'use server';

import { Logger } from '@/lib/logger';
import { stateToPrismaParams, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { assertCompanyAccess } from '@/shared/lib/tenant';
import { cacheLife, cacheTag } from 'next/cache';
import { CATALOG_EXPORT_MAX_ROWS, catalogExportFailure, catalogTooLargeMessage } from '../lib/catalog-table.server';
import { USERS_VIEW_DENIED_MESSAGE, assertCanViewCompanyUsers, canViewCompanyUsers } from './lib/users-access';
import {
  SHARE_USER_SELECT,
  VALID_SORT_FIELDS,
  buildUsersWhere,
  getCompanyOwner,
  normalizeRows,
  parseUsersState,
} from './lib/users-query';
import type { CompanyUserRow } from './lib/users-types';

/**
 * Lecturas de la tab Usuarios (`share_company_users` + owner de la empresa).
 * Las mutaciones (ban/unban, vincular legajo, nombre) viven en `mutations.server.ts`; las facetas en
 * `facets.server.ts` y los selectores auxiliares en `lookups.server.ts`.
 *
 * Perímetro sin RLS: las funciones `'use cache'` no pueden leer la sesión, así que reciben
 * `companyId` ya validado; el export público exige el permiso `view` y llama `assertCompanyAccess(companyId)`
 * ANTES de entrar al caché.
 */
const logger = new Logger('Empresa/Usuarios');

// ── Query paginada ────────────────────────────────────────────────────────────
async function getCompanyUsersPaginatedCached(companyId: string, searchParams: DataTableSearchParams) {
  'use cache';
  cacheTag(CACHE_TAGS.COMPANY_USERS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });

  logger.debug('Obteniendo usuarios de empresa paginados');

  try {
    const state = parseUsersState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildUsersWhere(companyId, state);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (!VALID_SORT_FIELDS.has(s.id)) continue;
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      if (s.id === 'fullname') resolvedSorts.push({ profile: { fullname: dir } });
      else if (s.id === 'email') resolvedSorts.push({ profile: { email: dir } });
      else resolvedSorts.push({ [s.id]: dir });
    }
    const safeOrderBy = [...resolvedSorts, { is_active: 'desc' as const }, { profile: { fullname: 'asc' as const } }];

    const [rawRows, total, ownerRow] = await Promise.all([
      prisma.share_company_users.findMany({ where, select: SHARE_USER_SELECT, skip, take, orderBy: safeOrderBy }),
      prisma.share_company_users.count({ where }),
      getCompanyOwner(companyId),
    ]);

    const normalizedRows = await normalizeRows(rawRows, companyId);

    // Agregar owner si no está ya en la lista
    const ownerAlreadyInTable = ownerRow && normalizedRows.some((r) => r.profile_id === ownerRow.profile_id);

    let allRows: CompanyUserRow[] = normalizedRows;
    let adjustedTotal = total;

    if (ownerRow && !ownerAlreadyInTable) {
      if (skip === 0) allRows = [ownerRow, ...normalizedRows];
      adjustedTotal = total + 1;
    }

    return { data: allRows, total: adjustedTotal };
  } catch (error) {
    logger.error('Error obteniendo usuarios de empresa', { data: { error } });
    throw error;
  }
}

export async function getCompanyUsersPaginated(companyId: string, searchParams: DataTableSearchParams) {
  await assertCanViewCompanyUsers();
  await assertCompanyAccess(companyId);
  return getCompanyUsersPaginatedCached(companyId, searchParams);
}

// ── Export (sin paginación, con tope) ─────────────────────────────────────────
async function getAllCompanyUsersForExportCached(
  companyId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<CompanyUserRow[]>> {
  'use cache';
  cacheTag(CACHE_TAGS.COMPANY_USERS);
  cacheLife({ expire: CACHE_TTL.EXPORT, revalidate: CACHE_TTL.EXPORT, stale: 30 });

  logger.debug('Exportando usuarios de empresa');

  try {
    const state = parseUsersState(searchParams);
    const where = await buildUsersWhere(companyId, state);
    const orderBy = [{ profile: { fullname: 'asc' as const } }, { id: 'asc' as const }];

    const [rows, ownerRow] = await Promise.all([
      fetchExportRowsInBatches({
        maxRows: CATALOG_EXPORT_MAX_ROWS,
        listIds: (take) => prisma.share_company_users.findMany({ where, orderBy, select: { id: true }, take }),
        fetchByIds: async (ids) =>
          normalizeRows(
            await prisma.share_company_users.findMany({
              where: { AND: [where, { id: { in: ids } }] },
              select: SHARE_USER_SELECT,
            }),
            companyId
          ),
        tooLargeMessage: catalogTooLargeMessage('usuarios'),
      }),
      getCompanyOwner(companyId),
    ]);

    const ownerAlreadyInTable = ownerRow && rows.some((r) => r.profile_id === ownerRow.profile_id);
    return { ok: true, data: ownerRow && !ownerAlreadyInTable ? [ownerRow, ...rows] : rows };
  } catch (error) {
    // El tope es una respuesta determinística (se cachea); cualquier otro error se propaga y no se cachea.
    if (error instanceof ExportTooLargeError) return { ok: false, message: error.message };
    logger.error('Error exportando usuarios de empresa', { data: { error } });
    throw error;
  }
}

export async function getAllCompanyUsersForExport(
  companyId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<CompanyUserRow[]>> {
  try {
    if (!(await canViewCompanyUsers())) return { ok: false, message: USERS_VIEW_DENIED_MESSAGE };
    await assertCompanyAccess(companyId);
    return await getAllCompanyUsersForExportCached(companyId, searchParams);
  } catch (error) {
    logger.error('Error al exportar usuarios de empresa', { data: { error } });
    return catalogExportFailure(error, 'la lista de usuarios');
  }
}
