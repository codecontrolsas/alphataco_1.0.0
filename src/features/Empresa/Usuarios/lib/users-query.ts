import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import { type DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE, buildDateRangeFiltersWhere } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import type { CompanyUserRow } from './users-types';

const logger = new Logger('Empresa/Usuarios/lib');

/** Campos reales de BD por los que se puede ordenar la lista. */
export const VALID_SORT_FIELDS = new Set(['created_at', 'fullname', 'email', 'is_active']);

/** Claves de filtro que la lista realmente usa; el resto de la URL se descarta antes de armar el where. */
const USER_FILTER_KEYS = new Set([
  'is_active',
  'role',
  'linked_employee',
  'fullname',
  'email',
  ...dateRangeKeys(['created_at']),
]);

export function parseUsersState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), USER_FILTER_KEYS);
}

export type UsersState = ReturnType<typeof parseUsersState>;

export const SHARE_USER_SELECT = {
  id: true,
  created_at: true,
  profile_id: true,
  is_active: true,
  profile: {
    select: {
      id: true,
      email: true,
      fullname: true,
      avatar: true,
      employee_id: true,
      credential_id: true,
      employees: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          file: true,
          picture: true,
          is_active: true,
        },
      },
    },
  },
} as const;

type UserRoleWithRole = {
  id: string;
  role_id: bigint;
  roles: { id: bigint; name: string | null; color: string | null } | null;
};

/**
 * Carga los `user_roles` de ESTA empresa para una lista de profile_ids.
 * Los roles son por empresa (`user_roles.company_id`): la columna "Rol" muestra lo que el usuario es acá.
 */
export async function loadUserRoles(profileIds: string[], companyId: string): Promise<Map<string, UserRoleWithRole[]>> {
  if (profileIds.length === 0) return new Map();

  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: { in: profileIds }, company_id: companyId },
    select: {
      id: true,
      user_id: true,
      role_id: true,
      roles: { select: { id: true, name: true, color: true } },
    },
  });

  const map = new Map<string, UserRoleWithRole[]>();
  for (const ur of userRoles) {
    const existing = map.get(ur.user_id) ?? [];
    existing.push({ id: ur.id, role_id: ur.role_id, roles: ur.roles ?? null });
    map.set(ur.user_id, existing);
  }
  return map;
}

/** Perfiles de la empresa sin ningún rol asignado en ella. */
async function profileIdsWithoutRole(companyId: string): Promise<{ all: string[]; withRole: Set<string> }> {
  const members = await prisma.share_company_users.findMany({
    where: { company_id: companyId },
    select: { profile_id: true },
  });
  const all = members.map((u) => u.profile_id).filter((id): id is string => Boolean(id));
  const rows = await prisma.user_roles.findMany({
    where: { user_id: { in: all }, company_id: companyId },
    select: { user_id: true },
  });
  return { all, withRole: new Set(rows.map((ur) => ur.user_id)) };
}

/** Resuelve el filtro de rol a la lista de `profile_id` que lo cumplen. */
export async function resolveRoleFilter(roleValues: string[] | undefined, companyId: string): Promise<string[] | null> {
  if (!roleValues?.length) return null;

  const includeNull = roleValues.includes(NULL_FILTER_VALUE);
  const realRoleIds = roleValues
    .filter((v) => v !== NULL_FILTER_VALUE)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (!includeNull) {
    if (realRoleIds.length === 0) return [];
    const usersWithRole = await prisma.user_roles.findMany({
      where: { role_id: { in: realRoleIds }, company_id: companyId },
      select: { user_id: true },
    });
    return usersWithRole.map((ur) => ur.user_id);
  }

  const { all, withRole } = await profileIdsWithoutRole(companyId);
  if (realRoleIds.length === 0) return all.filter((id) => !withRole.has(id));

  const usersWithSpecificRole = await prisma.user_roles.findMany({
    where: { role_id: { in: realRoleIds }, company_id: companyId },
    select: { user_id: true },
  });
  const withSpecific = new Set(usersWithSpecificRole.map((ur) => ur.user_id));
  return all.filter((id) => !withRole.has(id) || withSpecific.has(id));
}

/**
 * `where` ÚNICO de la lista, el export y las facetas de usuarios. Cada condición con OR va dentro de `AND`
 * para que no se pisen entre sí (búsqueda, empleado vinculado) ni con los filtros por nombre y correo.
 */
export function buildWhereClause(
  companyId: string,
  state: UsersState,
  profileIdsWithRole: string[] | null
): Prisma.share_company_usersWhereInput {
  const AND: Prisma.share_company_usersWhereInput[] = [{ company_id: companyId }];

  if (state.search) {
    AND.push({
      OR: [
        { profile: { fullname: { contains: state.search, mode: 'insensitive' } } },
        { profile: { email: { contains: state.search, mode: 'insensitive' } } },
      ],
    });
  }

  const fullname = state.filters.fullname?.[0];
  if (fullname) AND.push({ profile: { fullname: { contains: fullname, mode: 'insensitive' } } });

  const email = state.filters.email?.[0];
  if (email) AND.push({ profile: { email: { contains: email, mode: 'insensitive' } } });

  AND.push(buildDateRangeFiltersWhere(state.filters, ['created_at']) as Prisma.share_company_usersWhereInput);

  if (profileIdsWithRole) {
    // Sin coincidencias: lista vacía (nunca "sin filtro").
    AND.push(profileIdsWithRole.length > 0 ? { profile_id: { in: profileIdsWithRole } } : { id: { in: [] } });
  }

  // Con ambos valores (activo y baneado) equivale a no filtrar.
  const isActive = state.filters.is_active;
  if (isActive?.length === 1) AND.push({ is_active: isActive[0] === 'true' });

  const linked = state.filters.linked_employee;
  if (linked?.length) {
    const realIds = linked.filter((v) => v !== NULL_FILTER_VALUE);
    const conditions: Prisma.share_company_usersWhereInput[] = [];
    if (linked.includes(NULL_FILTER_VALUE)) conditions.push({ profile: { employee_id: null } });
    if (realIds.length > 0) conditions.push({ profile: { employee_id: { in: realIds } } });
    AND.push(conditions.length === 1 ? conditions[0] : { OR: conditions });
  }

  return { AND };
}

/** Estado → `where` completo (resuelve el filtro de rol). Lo usan lista, export y facetas. */
export async function buildUsersWhere(
  companyId: string,
  state: UsersState
): Promise<Prisma.share_company_usersWhereInput> {
  const profileIdsWithRole = await resolveRoleFilter(state.filters.role, companyId);
  return buildWhereClause(companyId, state, profileIdsWithRole);
}

/** Normaliza filas de `share_company_users` agregándoles sus `user_roles` de esta empresa. */
export async function normalizeRows(
  rows: Array<Prisma.share_company_usersGetPayload<{ select: typeof SHARE_USER_SELECT }>>,
  companyId: string,
  isOwner = false
) {
  const profileIds = rows.map((r) => r.profile_id).filter((id): id is string => Boolean(id));
  const rolesMap = await loadUserRoles(profileIds, companyId);

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    profile_id: row.profile_id,
    is_active: row.is_active,
    isOwner,
    profile: row.profile
      ? {
          ...row.profile,
          user_roles: rolesMap.get(row.profile.id) ?? [],
        }
      : null,
  }));
}

/** Propietario de la empresa como fila de la lista (no figura en `share_company_users`). */
export async function getCompanyOwner(companyId: string): Promise<CompanyUserRow | null> {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { owner_id: true } });
    if (!company?.owner_id) return null;

    const ownerProfile = await prisma.profile.findUnique({
      where: { id: company.owner_id },
      select: SHARE_USER_SELECT.profile.select,
    });
    if (!ownerProfile) return null;

    const rolesMap = await loadUserRoles([company.owner_id], companyId);

    return {
      id: `owner-${company.owner_id}`,
      created_at: new Date(0),
      profile_id: company.owner_id,
      is_active: true,
      isOwner: true,
      profile: { ...ownerProfile, user_roles: rolesMap.get(company.owner_id) ?? [] },
    };
  } catch (error) {
    logger.error('Error obteniendo owner de la compañía', { data: { error, companyId } });
    return null;
  }
}
