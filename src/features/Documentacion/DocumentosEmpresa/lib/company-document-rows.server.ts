import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { normalizePeriod, parseValidity } from '../../shared/compliance/dates';
import {
  DOCUMENT_STATE_RANK,
  loadDocumentEntries,
  periodSearchValues,
  type DocumentEntry,
} from '../../shared/compliance/server/document-entries.server';

/**
 * Filas de las listas de documentos de la EMPRESA (permanentes y mensuales), calculadas por el motor
 * de cumplimiento. El único recurso es la empresa activa y sus tipos no tienen condiciones: cada
 * tipo activo obligatorio genera su documento o una fila faltante. Misma forma que las filas Prisma
 * de antes (`document_types`, `profile`, `validity` como texto `DD/MM/YYYY`...) más `isMissing`,
 * `expiringSoon` y `notApplicable`. El id de una fila faltante es `missing:<empresa>:<tipo>[:<período>]`.
 */

interface ProfileDisplay {
  id: string;
  fullname: string | null;
  avatar: string | null;
}

function toCompanyDocumentRow(entry: DocumentEntry, profiles: ReadonlyMap<string, ProfileDisplay>) {
  const userId = entry.extra ? entry.extra.userId : null;
  const profile: ProfileDisplay | null = userId ? profiles.get(userId) ?? null : null;
  return {
    id: entry.rowId,
    created_at: entry.doc ? entry.doc.createdAt : null,
    state: entry.state,
    validity: entry.extra ? entry.extra.validityText : null,
    period: entry.period,
    document_path: entry.doc ? entry.doc.path : null,
    user_id: userId,
    id_document_types: entry.typeId,
    document_types: {
      id: entry.typeId,
      name: entry.typeName,
      mandatory: entry.type.mandatory,
      explired: entry.type.hasExpiry,
      is_it_montlhy: entry.type.monthly,
      private: entry.type.isPrivate,
    },
    profile,
    /** Fila sintética: el tipo es obligatorio y no hay documento. */
    isMissing: entry.isMissing,
    /** Vence dentro de los próximos 30 días. */
    expiringSoon: entry.expiringSoon,
    notApplicable: entry.notApplicable,
  };
}

export type CompanyDocumentRow = ReturnType<typeof toCompanyDocumentRow>;

/** Todas las filas de la lista (sin filtros del usuario), una vez por request. */
export const loadCompanyDocumentRows = cache(
  async (companyId: string, monthly: boolean, canViewPrivate: boolean): Promise<CompanyDocumentRow[]> => {
    const { entries } = await loadDocumentEntries(companyId, 'Empresa', monthly, canViewPrivate, '');
    const userIds = [...new Set(entries.flatMap((e) => (e.extra?.userId ? [e.extra.userId] : [])))];
    const profiles =
      userIds.length > 0
        ? await prisma.profile.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullname: true, avatar: true },
          })
        : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return entries.map((entry) => toCompanyDocumentRow(entry, byId));
  }
);

/**
 * Filas de la lista de la pestaña (permanentes o mensuales) para el usuario de la sesión. Exige el
 * permiso `view` de la sub-pestaña que muestra la lista (el mismo que usa el TabContent para
 * mostrarla) y calcula los documentos privados solo con `view_private`.
 */
export async function loadAuthorizedCompanyDocumentRows(monthly: boolean): Promise<CompanyDocumentRow[]> {
  const tabSlug = monthly ? 'docs-empresa-mensuales' : 'docs-empresa-permanentes';
  const [companyId, canView, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', tabSlug, 'view'),
    checkPermissionServer('documentacion', 'documentos-de-empresa', 'view_private'),
  ]);
  if (!canView) throw new Error('No tenés permiso para ver los documentos de la empresa.');
  return loadCompanyDocumentRows(companyId, monthly, canViewPrivate);
}

/** Búsqueda, filtros, facetas y orden de las listas de empresa. */
export const COMPANY_DOCUMENT_SPEC: InMemoryTableSpec<CompanyDocumentRow> = {
  rowId: (row) => row.id,
  search: { contains: (row) => [row.document_types.name] },
  textFilters: { period: (row) => periodSearchValues(row.period) },
  facets: {
    state: (row) => [{ id: row.state }],
    documentType: (row) => [{ id: row.id_document_types, name: row.document_types.name }],
    mandatory: (row) => [{ id: String(row.document_types.mandatory) }],
    uploadedBy: (row) => (row.profile ? [{ id: row.profile.id, name: row.profile.fullname ?? row.profile.id }] : []),
  },
  dateRanges: { created_at: (row) => row.created_at },
  sorters: {
    created_at: (row) => row.created_at,
    state: (row) => DOCUMENT_STATE_RANK[row.state],
    validity: (row) => parseValidity(row.validity),
    period: (row) => normalizePeriod(row.period) ?? row.period,
    documentType: (row) => row.document_types.name,
    uploadedBy: (row) => row.profile?.fullname,
  },
  defaultSort: [(row) => row.document_types.name],
};
