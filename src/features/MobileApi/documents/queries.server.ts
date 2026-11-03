import 'server-only';

import { loadEmployeeDocumentRows } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { loadCompanyDocumentRows } from '@/features/Documentacion/DocumentosEmpresa/lib/company-document-rows.server';
import { loadEquipmentDocumentRows } from '@/features/Documentacion/DocumentosEquipos/lib/equipment-document-rows.server';
import { parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { runInTenantScope, type TenantContext } from '@/shared/lib/tenant-context';
import type { DocumentListQuery, DocumentResource } from '../contracts/documents';
import { allowedResources, canListPeriod, type DocumentAccess } from './access';
import {
  DOCUMENT_STATUS_LABELS,
  documentStatus,
  filterRows,
  labeledState,
  pageRows,
  searchVariants,
  toListItem,
  type EngineState,
  type MobileDocumentRow,
} from './rows';

/**
 * Consultas de Documentación para la API móvil. Las filas salen del MISMO motor de cumplimiento que las listas web
 * (`load*DocumentRows`), con el contexto de la petición en el ALS (esas consultas usan el cliente contextual). Las
 * lecturas por id se acotan SIEMPRE a la empresa a través del recurso (`employees.company_id`, `vehicles.company_id`,
 * `documents_company.applies`), como `document-scope.ts`.
 *
 * Archivados («ya no aplica», `archived_at`): el motor no lee esa columna; en las listas generales no aparecen porque
 * su tipo ya no aplica, y además se descartan explícitamente por id (defensa ante una fila archivada cuyo tipo vuelve a
 * aplicar antes de la reconciliación).
 */

export class DocumentNotFoundError extends Error {}

export interface LoadOptions {
  resource: DocumentResource;
  monthly: boolean;
  privateTypes: boolean;
  /** Documentos de un solo recurso (empleado o equipo): la lista embebida de su ficha. */
  resourceId?: string;
}

/** Ids archivados de la empresa (empleados y equipos; la empresa no archiva). */
async function archivedIds(companyId: string, resource: DocumentResource): Promise<Set<string>> {
  if (resource === 'company') return new Set();
  const rows =
    resource === 'employee'
      ? await prisma.documents_employees.findMany({
          where: { archived_at: { not: null }, employees: { company_id: companyId } },
          select: { id: true },
        })
      : await prisma.documents_equipment.findMany({
          where: { archived_at: { not: null }, vehicles: { company_id: companyId } },
          select: { id: true },
        });
  return new Set(rows.map((row) => row.id));
}

interface EngineRowBase {
  id: string;
  state: EngineState;
  period: string | null;
  isMissing: boolean;
  expiringSoon: boolean;
  notApplicable: boolean;
  document_types: {
    id: string;
    name: string;
    mandatory: boolean;
    explired: boolean;
    is_it_montlhy: boolean | null;
    private: boolean | null;
  };
}

function baseRow(row: EngineRowBase, validity: Date | string | null, monthly: boolean) {
  return {
    id: row.id,
    isMissing: row.isMissing,
    type: {
      id: row.document_types.id,
      name: row.document_types.name,
      mandatory: row.document_types.mandatory === true,
      monthly,
      hasExpiry: row.document_types.explired === true,
      private: row.document_types.private === true,
    },
    state: row.state,
    status: documentStatus(row.state, row.expiringSoon),
    validity: parseValidity(validity),
    period: row.period,
  };
}

/** Filas de una clase de recurso y un período, normalizadas para la app. Sin «ya no aplica» ni archivados. */
export async function loadMobileDocumentRows(
  ctx: TenantContext,
  options: LoadOptions,
  companyName: string
): Promise<MobileDocumentRow[]> {
  const { resource, monthly, privateTypes, resourceId = '' } = options;
  const { companyId } = ctx;
  const [archived, mapped] = await Promise.all([
    archivedIds(companyId, resource),
    (async (): Promise<MobileDocumentRow[]> => {
      if (resource === 'employee') {
        const rows = await loadEmployeeDocumentRows(companyId, monthly, privateTypes, resourceId);
        return rows
          .filter((row) => !row.notApplicable)
          .map((row) => {
            const { employees: e } = row;
            const name = `${e.lastname} ${e.firstname}`;
            return {
              ...baseRow(row, row.validity, monthly),
              resource: { kind: 'employee', id: e.id, name, fileNumber: e.file, domain: null, internNumber: null },
              search: searchVariants(name, `${e.firstname} ${e.lastname}`, e.file, row.document_types.name),
            };
          });
      }
      if (resource === 'equipment') {
        const rows = await loadEquipmentDocumentRows(companyId, monthly, privateTypes, resourceId);
        return rows
          .filter((row) => !row.notApplicable)
          .map((row) => {
            const v = row.vehicles;
            return {
              ...baseRow(row, row.validity, monthly),
              resource: {
                kind: 'equipment',
                id: v.id,
                name: v.domain ?? v.serie ?? v.intern_number ?? v.id,
                fileNumber: null,
                domain: v.domain,
                internNumber: v.intern_number,
              },
              search: searchVariants(v.domain, v.serie, v.intern_number, row.document_types.name),
            };
          });
      }
      const rows = await loadCompanyDocumentRows(companyId, monthly, privateTypes);
      return rows
        .filter((row) => !row.notApplicable)
        .map((row) => ({
          ...baseRow(row, row.validity, monthly),
          resource: { kind: 'company', id: companyId, name: companyName, fileNumber: null, domain: null, internNumber: null },
          search: searchVariants(companyName, row.document_types.name),
        }));
    })(),
  ]);
  return mapped.filter((row) => !archived.has(row.id));
}

async function companyNameOf(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true } });
  return company?.company_name ?? 'Empresa';
}

export class DocumentQueryError extends Error {
  constructor(
    readonly status: 403 | 422,
    message: string
  ) {
    super(message);
  }
}

/**
 * Listado paginado. Sin `resource` ni `period`, junta todo lo que el usuario puede ver (como recorrer las pestañas
 * de la web). Pedir explícitamente una clase o un período sin permiso es 403.
 */
export async function listDocuments(
  ctx: TenantContext,
  query: DocumentListQuery,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  const visible = allowedResources(access, enabledModules);
  if (query.resourceId && (!query.resource || query.resource === 'company')) {
    throw new DocumentQueryError(422, '`resourceId` exige `resource` = employee o equipment.');
  }
  if (query.resource && !visible.includes(query.resource)) {
    throw new DocumentQueryError(403, 'No tenés permiso para ver esos documentos.');
  }
  const resources = query.resource ? [query.resource] : visible;
  const loads: LoadOptions[] = [];
  for (const resource of resources) {
    for (const monthly of [false, true]) {
      if (query.period && (query.period === 'monthly') !== monthly) continue;
      if (!canListPeriod(access[resource], monthly)) continue;
      loads.push({ resource, monthly, privateTypes: access[resource].privateTypes, resourceId: query.resourceId });
    }
  }
  if (loads.length === 0) throw new DocumentQueryError(403, 'No tenés permiso para ver esos documentos.');

  return runInTenantScope(ctx, async () => {
    const companyName = loads.some((load) => load.resource === 'company') ? await companyNameOf(ctx.companyId) : '';
    const rows = (await Promise.all(loads.map((load) => loadMobileDocumentRows(ctx, load, companyName)))).flat();
    const { page, nextCursor, total } = pageRows(filterRows(rows, query), query);
    return { items: page.map(toListItem), nextCursor, total };
  });
}

/** Opciones de los filtros: clases visibles con sus períodos, estados y tipos de documento (sin privados ajenos). */
export async function getDocumentFilterOptions(
  ctx: TenantContext,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  const visible = allowedResources(access, enabledModules);
  const APPLIES = { employee: 'Persona', equipment: 'Equipos', company: 'Empresa' } as const;
  const LABELS = { employee: 'Empleados', equipment: 'Equipos', company: 'Empresa' } as const;
  const types = await runInTenantScope(ctx, () =>
    prisma.document_types.findMany({
      where: {
        company_id: ctx.companyId,
        is_active: true,
        applies: { in: visible.map((resource) => APPLIES[resource]) },
      },
      select: { id: true, name: true, applies: true, is_it_montlhy: true, private: true },
      orderBy: { name: 'asc' },
    })
  );
  const resourceOf = (applies: string) =>
    (Object.keys(APPLIES) as DocumentResource[]).find((resource) => APPLIES[resource] === applies) ?? null;
  return {
    resources: visible.map((resource) => ({
      value: resource,
      label: LABELS[resource],
      periods: [
        ...(access[resource].permanent ? (['permanent'] as const) : []),
        ...(access[resource].monthly ? (['monthly'] as const) : []),
      ],
    })),
    statuses: (Object.keys(DOCUMENT_STATUS_LABELS) as (keyof typeof DOCUMENT_STATUS_LABELS)[]).map((value) => ({
      value,
      label: DOCUMENT_STATUS_LABELS[value],
    })),
    types: types.flatMap((type) => {
      const resource = resourceOf(type.applies);
      if (!resource) return [];
      const monthly = type.is_it_montlhy === true;
      if (!canListPeriod(access[resource], monthly)) return [];
      if (type.private === true && !access[resource].privateTypes) return [];
      return [{ id: type.id, name: type.name, resource, monthly }];
    }),
  };
}

// ─── Ficha ────────────────────────────────────────────────────────────────────

/** Referencia mínima de un documento REAL de la empresa (no archivado y con archivo), o null. */
export async function findDocumentRef(companyId: string, resource: DocumentResource, documentId: string) {
  const withFile = { document_path: { not: null }, NOT: { document_path: '' } };
  const typeSelect = { select: { name: true, is_it_montlhy: true, private: true } } as const;
  if (resource === 'employee') {
    const row = await prisma.documents_employees.findFirst({
      where: { id: documentId, archived_at: null, ...withFile, employees: { company_id: companyId } },
      select: {
        applies: true,
        document_path: true,
        created_at: true,
        deny_reason: true,
        document_types: typeSelect,
      },
    });
    return row?.applies ? { ...row, resourceId: row.applies, policyNumber: null } : null;
  }
  if (resource === 'equipment') {
    const row = await prisma.documents_equipment.findFirst({
      where: { id: documentId, archived_at: null, ...withFile, vehicles: { company_id: companyId } },
      select: {
        applies: true,
        document_path: true,
        created_at: true,
        deny_reason: true,
        policy_number: true,
        document_types: typeSelect,
      },
    });
    return row?.applies ? { ...row, resourceId: row.applies, policyNumber: row.policy_number } : null;
  }
  const row = await prisma.documents_company.findFirst({
    where: { id: documentId, applies: companyId, ...withFile },
    select: { applies: true, document_path: true, created_at: true, deny_reason: true, document_types: typeSelect },
  });
  return row ? { ...row, resourceId: row.applies, policyNumber: null } : null;
}

export type DocumentRef = NonNullable<Awaited<ReturnType<typeof findDocumentRef>>>;

/**
 * Documento REAL de la empresa que el usuario puede ver: ficha (`detalle-de-documento`), lista de ese recurso y
 * período, y privado solo con `view_private`. Lanza `DocumentQueryError(403)` sin permiso y `DocumentNotFoundError`
 * si no existe en la empresa, está archivado, no tiene archivo o ya no es una fila vigente de su lista.
 */
export async function resolveVisibleDocument(
  ctx: TenantContext,
  resource: DocumentResource,
  documentId: string,
  access: DocumentAccess
): Promise<{ ref: DocumentRef; row: MobileDocumentRow }> {
  if (!access.detail) throw new DocumentQueryError(403, 'No tenés permiso para ver la ficha de los documentos.');
  return runInTenantScope(ctx, async () => {
    const ref = await findDocumentRef(ctx.companyId, resource, documentId);
    if (!ref) throw new DocumentNotFoundError();
    const monthly = ref.document_types?.is_it_montlhy === true;
    const isPrivate = ref.document_types?.private === true;
    const kindAccess = access[resource];
    if (!canListPeriod(kindAccess, monthly) || (isPrivate && !kindAccess.privateTypes)) {
      throw new DocumentQueryError(403, 'No tenés permiso para ver este documento.');
    }
    const companyName = resource === 'company' ? await companyNameOf(ctx.companyId) : '';
    const rows = await loadMobileDocumentRows(
      ctx,
      {
        resource,
        monthly,
        privateTypes: kindAccess.privateTypes,
        resourceId: resource === 'company' ? undefined : ref.resourceId,
      },
      companyName
    );
    const row = rows.find((candidate) => candidate.id === documentId);
    if (!row) throw new DocumentNotFoundError();
    return { ref, row };
  });
}

export async function getDocumentDetail(
  ctx: TenantContext,
  resource: DocumentResource,
  documentId: string,
  access: DocumentAccess
) {
  const { ref, row } = await resolveVisibleDocument(ctx, resource, documentId, access);
  return {
    id: row.id,
    resource: row.resource,
    type: row.type,
    status: row.status,
    state: labeledState(row.state),
    validity: row.validity,
    period: row.period,
    uploadedAt: argentinaDate(ref.created_at),
    denyReason: ref.deny_reason ?? null,
    policyNumber: ref.policyNumber ?? null,
    hasFile: Boolean(ref.document_path),
  };
}
