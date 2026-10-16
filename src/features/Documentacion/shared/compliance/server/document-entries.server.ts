import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { cache } from 'react';
import { typeAppliesTo } from '../applicability';
import { arCurrentPeriod, arToday, normalizePeriod } from '../dates';
import { deriveState, evaluateResource } from '../evaluation';
import { describeRequirementReason } from '../requirement-reason';
import type { ComplianceDoc, ComplianceKind, ComplianceResource, ComplianceType } from '../types';
import { loadComplianceDataset, type ComplianceDataset, type ComplianceDocExtra } from './dataset.server';

/**
 * Filas de las listas de documentos, calculadas por el motor de cumplimiento.
 *
 * Cada lista (empleados, equipos, empresa; permanentes o mensuales) muestra, por recurso y tipo de
 * documento que le APLICA: el documento vigente real con su estado derivado, o una fila SINTÉTICA
 * "faltante" si el tipo es obligatorio y no hay documento. Las filas legacy `pendiente` sin archivo
 * no existen para el motor. Los documentos de un tipo que ya no aplica ("ya no aplica") sólo se
 * incluyen cuando la lista está embebida en la ficha de un recurso.
 */

/**
 * Valores de `state` que ven las listas. `pendiente` es el nombre histórico de la fila SIN documento
 * (la fila faltante): se conserva para no romper filtros, íconos, tarjetas ni URLs guardadas; la UI
 * lo muestra como "Faltante".
 */
export type DocumentRowState = 'aprobado' | 'presentado' | 'rechazado' | 'vencido' | 'pendiente';

export interface DocumentEntry {
  /** Id del documento real, o `missing:<recurso>:<tipo>[:<período>]` para una fila faltante. */
  rowId: string;
  resourceId: string;
  typeId: string;
  typeName: string;
  type: ComplianceType;
  state: DocumentRowState;
  /** Fila sintética: el tipo es obligatorio y no hay documento. */
  isMissing: boolean;
  /** Documento vigente que vence dentro de `EXPIRING_SOON_DAYS`. */
  expiringSoon: boolean;
  /** Documento cuyo tipo hoy no aplica al recurso. Sólo en listas embebidas en la ficha del recurso. */
  notApplicable: boolean;
  doc: ComplianceDoc | null;
  extra: ComplianceDocExtra | null;
  /** Criterio por el que se pide ("Puesto = Operador"). Sólo en listas embebidas en la ficha; resuelto sin consultas. */
  requestedBy: string | null;
  /** Período del documento; en una fila faltante mensual, el período corriente (`YYYY-MM`). */
  period: string | null;
}

export interface LoadedDocumentEntries {
  entries: DocumentEntry[];
  /** Recursos evaluados (activos, o el único recurso pedido). */
  resources: Map<string, ComplianceResource>;
}

/** Orden por estado: lo que pide acción primero. */
export const DOCUMENT_STATE_RANK: Record<DocumentRowState, number> = {
  pendiente: 0,
  rechazado: 1,
  vencido: 2,
  presentado: 3,
  aprobado: 4,
};

/** `YYYY-MM` -> [`YYYY-MM`, `MM/YYYY`]: lo que el usuario puede escribir para buscar un período. */
export function periodSearchValues(period: string | null): string[] {
  if (!period) return [];
  const match = /^(\d{4})-(\d{2})/.exec(period);
  return match ? [period, `${match[2]}/${match[1]}`] : [period];
}

export const MISSING_ROW_PREFIX = 'missing:';

export function missingRowId(resourceId: string, typeId: string, period: string | null): string {
  return `${MISSING_ROW_PREFIX}${resourceId}:${typeId}${period ? `:${period}` : ''}`;
}

function rowState(state: ReturnType<typeof deriveState>): DocumentRowState {
  return state === 'faltante' ? 'pendiente' : state;
}

interface LoadParams {
  companyId: string;
  kind: ComplianceKind;
  /** `true`: sólo tipos mensuales; `false`: sólo permanentes. */
  monthly: boolean;
  /** Sin este permiso, los tipos privados (y sus filas faltantes) no se incluyen. */
  canViewPrivate: boolean;
  /** Si se indica, la lista está embebida en la ficha de ese recurso. */
  resourceId?: string;
}

/**
 * Dataset + nombres de tipos, una vez por request (`React.cache`). Permanentes y mensuales de una misma
 * pantalla comparten la carga, que es la parte cara (decenas de miles de documentos). No persiste entre
 * requests: cada acción vuelve a leer la base, así que una edición propia siempre se ve.
 */
const loadSharedDataset = cache(
  async (
    companyId: string,
    kind: ComplianceKind,
    resourceId: string | undefined
  ): Promise<[ComplianceDataset, Array<{ id: string; name: string }>]> =>
    Promise.all([
      loadComplianceDataset(prisma, {
        companyId,
        kind,
        resourceIds: resourceId ? [resourceId] : undefined,
        includeDocExtras: true,
      }),
      prisma.document_types.findMany({
        where: { applies: kind, OR: [{ company_id: null }, { company_id: companyId }] },
        select: { id: true, name: true },
      }),
    ])
);

async function loadEntries(params: LoadParams): Promise<LoadedDocumentEntries> {
  const { companyId, kind, monthly, canViewPrivate, resourceId } = params;
  const embedded = Boolean(resourceId);
  const now = new Date();
  const options = { today: arToday(now), period: arCurrentPeriod(now) };

  // Tipos (con su nombre, que el motor no necesita) y dataset: una sola carga por request y por
  // (empresa, tipo de recurso, recurso), compartida entre la pestaña de permanentes y la de mensuales.
  const [dataset, typeNames] = await loadSharedDataset(companyId, kind, resourceId);

  const nameById = new Map(typeNames.map((t) => [t.id, t.name]));
  const typeById = new Map(dataset.types.map((t) => [t.id, t]));
  const visibleType = (type: ComplianceType | undefined): type is ComplianceType =>
    Boolean(type) && type!.monthly === monthly && (canViewPrivate || !type!.isPrivate);

  const entries: DocumentEntry[] = [];
  const resources = new Map<string, ComplianceResource>();

  const push = (
    resource: ComplianceResource,
    type: ComplianceType,
    state: DocumentRowState,
    doc: ComplianceDoc | null,
    flags: { expiringSoon?: boolean; notApplicable?: boolean }
  ) => {
    const isMissing = doc === null;
    const period = doc ? doc.period : monthly ? options.period : null;
    entries.push({
      rowId: doc ? doc.id : missingRowId(resource.id, type.id, period),
      resourceId: resource.id,
      typeId: type.id,
      typeName: nameById.get(type.id) ?? '',
      type,
      state,
      isMissing,
      expiringSoon: flags.expiringSoon ?? false,
      notApplicable: flags.notApplicable ?? false,
      doc,
      extra: doc ? dataset.docExtras.get(doc.id) ?? null : null,
      requestedBy: embedded ? describeRequirementReason(type, resource) : null,
      period,
    });
  };

  for (const resource of dataset.resources) {
    // La lista general sólo muestra recursos activos; la ficha de un recurso muestra el suyo siempre.
    if (!embedded && !resource.isActive) continue;
    resources.set(resource.id, resource);

    const docs = dataset.docsByResource.get(resource.id) ?? [];
    const evaluation = evaluateResource(resource, dataset.types, docs, options);
    const shown = new Set<string>();

    for (const requirement of evaluation.requirements) {
      const type = typeById.get(requirement.typeId);
      if (!visibleType(type)) continue;
      if (requirement.doc) shown.add(requirement.doc.id);
      push(resource, type, rowState(requirement.state), requirement.doc, { expiringSoon: requirement.expiringSoon });
    }

    // Mensuales: el motor sólo evalúa el período corriente. Los documentos de otros períodos de un
    // tipo que sigue aplicando se conservan como historial (las listas mensuales siempre los mostraron).
    if (monthly) {
      for (const doc of docs) {
        if (shown.has(doc.id) || normalizePeriod(doc.period) === options.period) continue;
        const type = typeById.get(doc.typeId);
        if (!visibleType(type) || !typeAppliesTo(type, resource)) continue;
        push(resource, type, rowState(deriveState(type, doc, options.today)), doc, {});
      }
    }

    if (embedded) {
      for (const doc of evaluation.notApplicable) {
        const type = typeById.get(doc.typeId);
        if (!visibleType(type)) continue;
        push(resource, type, rowState(deriveState(type, doc, options.today)), doc, { notApplicable: true });
      }
    }
  }

  return { entries, resources };
}

/**
 * Filas calculadas de una lista, una vez por request (`React.cache`): la tabla y las tarjetas de la
 * misma página comparten la carga. Los argumentos son primitivos para que la caché los reconozca.
 * El resultado es compartido: no se muta.
 */
export const loadDocumentEntries = cache(
  (
    companyId: string,
    kind: ComplianceKind,
    monthly: boolean,
    canViewPrivate: boolean,
    resourceId: string
  ): Promise<LoadedDocumentEntries> =>
    loadEntries({ companyId, kind, monthly, canViewPrivate, resourceId: resourceId || undefined })
);

/** Conteos por estado para las tarjetas (`pendiente` = faltantes). No incluye las filas "ya no aplica". */
export function countEntryStates(entries: readonly DocumentEntry[]): Partial<Record<DocumentRowState, number>> {
  const counts: Partial<Record<DocumentRowState, number>> = {};
  for (const entry of entries) {
    if (entry.notApplicable) continue;
    counts[entry.state] = (counts[entry.state] ?? 0) + 1;
  }
  return counts;
}
