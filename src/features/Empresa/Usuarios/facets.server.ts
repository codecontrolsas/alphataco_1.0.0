'use server';

import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { assertCompanyAccess } from '@/shared/lib/tenant';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { cacheLife, cacheTag } from 'next/cache';
import { assertCanViewCompanyUsers } from './lib/users-access';
import { buildUsersWhere, parseUsersState } from './lib/users-query';
import type { CompanyUserFacetResult } from './lib/users-types';

/**
 * Facetas lazy de la lista de usuarios (una columna por llamada, con cross-filter).
 * Usan el MISMO `where` que la lista y el export (`buildUsersWhere`).
 */
const logger = new Logger('Empresa/Usuarios/facets');

async function getCompanyUserSingleFacetCached(
  columnId: string,
  companyId: string,
  searchParams: DataTableSearchParams
): Promise<CompanyUserFacetResult | null> {
  'use cache';
  cacheTag(CACHE_TAGS.COMPANY_USERS);
  cacheLife({ expire: CACHE_TTL.FACETS, revalidate: CACHE_TTL.FACETS, stale: 30 });
  return runInCompanyScope(companyId, () => getCompanyUserSingleFacetQuery(columnId, companyId, searchParams));
}

/** Cuerpo de `getCompanyUserSingleFacetCached`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getCompanyUserSingleFacetQuery(
  columnId: string,
  companyId: string,
  searchParams: DataTableSearchParams
): Promise<CompanyUserFacetResult | null> {
  logger.debug('Obteniendo faceta individual', { data: { columnId } });

  try {
    const state = parseUsersState(searchParams);

    // Cross-filter: excluir la columna propia del filtro
    const crossState = {
      ...state,
      filters: Object.fromEntries(Object.entries(state.filters).filter(([key]) => key !== columnId)),
    };
    const crossWhere = await buildUsersWhere(companyId, crossState);

    switch (columnId) {
      case 'is_active': {
        const grouped = await prisma.share_company_users.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const g of grouped) counts.set(String(g.is_active), g._count);
        return { counts };
      }

      case 'role': {
        const users = await prisma.share_company_users.findMany({ where: crossWhere, select: { profile_id: true } });
        const profileIds = users.map((u) => u.profile_id).filter((id): id is string => Boolean(id));

        const userRolesRows = await prisma.user_roles.findMany({
          where: { user_id: { in: profileIds }, company_id: companyId },
          select: { user_id: true, role_id: true },
        });

        const counts = new Map<string, number>();

        // Usuarios sin roles
        const usersWithRoles = new Set(userRolesRows.map((ur) => ur.user_id));
        const nullCount = profileIds.filter((id) => !usersWithRoles.has(id)).length;
        if (nullCount > 0) counts.set(NULL_FILTER_VALUE, nullCount);

        for (const ur of userRolesRows) {
          const key = String(ur.role_id);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const roleIds = [...counts.keys()]
          .filter((k) => k !== NULL_FILTER_VALUE)
          .map(Number)
          .filter((n) => !isNaN(n));

        const roles =
          roleIds.length > 0
            ? await prisma.roles.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
            : [];

        const resolvedOptions = roles.map((r) => ({ value: String(r.id), label: r.name ?? 'Sin nombre' }));
        return { counts, resolvedOptions };
      }

      case 'linked_employee': {
        const users = await prisma.share_company_users.findMany({
          where: crossWhere,
          select: {
            profile: {
              select: {
                employee_id: true,
                employees: { select: { id: true, firstname: true, lastname: true, file: true } },
              },
            },
          },
        });

        const counts = new Map<string, number>();
        const employeeLabels = new Map<string, string>();

        for (const u of users) {
          const empId = u.profile?.employee_id;
          if (!empId) {
            counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
            continue;
          }
          counts.set(empId, (counts.get(empId) ?? 0) + 1);
          if (u.profile?.employees && !employeeLabels.has(empId)) {
            const emp = u.profile.employees;
            employeeLabels.set(empId, `[${emp.file}] ${emp.lastname} ${emp.firstname}`);
          }
        }

        const resolvedOptions = [...employeeLabels.entries()].map(([value, label]) => ({ value, label }));
        return { counts, resolvedOptions };
      }

      default:
        logger.warn('Columna de faceta no soportada', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error obteniendo faceta individual', { data: { error, columnId } });
    return null;
  }
}

export async function getCompanyUserSingleFacet(
  columnId: string,
  companyId: string,
  searchParams: DataTableSearchParams
): Promise<CompanyUserFacetResult | null> {
  await assertCanViewCompanyUsers();
  await assertCompanyAccess(companyId);
  return getCompanyUserSingleFacetCached(columnId, companyId, searchParams);
}
