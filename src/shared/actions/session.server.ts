'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUser, getSessionUserId } from '@/shared/lib/session';
import { assertCompanyAccess } from '@/shared/lib/tenant';

/**
 * Datos que consume el store `useLoggedUserStore` (antes los pedía con PostgREST y realtime
 * desde el navegador). El store sólo guarda estado; todo lo que toca la base vive acá.
 *
 * Sin RLS cada export es un endpoint público: todo `companyId` que llega del cliente pasa por
 * `assertCompanyAccess`, el profile sale siempre de la sesión y las lecturas por id de recurso
 * se acotan a la empresa activa.
 */
const logger = new Logger('shared/session-store');

/** Usuario de sesión y sus filas de `profile` (por `credential_id`). */
export async function getSessionBootstrap() {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await prisma.profile.findMany({ where: { credential_id: user.id } });
  return { credentialUser: user, profile };
}

const companyForStoreInclude = {
  profile: true,
  cities: { select: { id: true, name: true } },
  provinces: { select: { id: true, name: true } },
  share_company_users: { include: { profile: true } },
} as const;

/** `share_company_users` no tiene `role`: el rol del invitado es `profile.role` (shape legacy). */
function withRole<T extends { profile: { role: string | null } | null }>(row: T) {
  return { ...row, role: row.profile?.role ?? '' };
}

type CompanyForStoreRow = Awaited<
  ReturnType<typeof prisma.company.findFirstOrThrow<{ include: typeof companyForStoreInclude }>>
>;

/** Shape legacy de PostgREST: `owner_id(*)`, `city(id,name)`, `province_id(id,name)`, `share_company_users(*, profile(*))`. */
function toStoreCompany({ profile, cities, provinces, share_company_users, city, province_id, ...rest }: CompanyForStoreRow) {
  return {
    ...rest,
    owner_id: profile,
    city: { id: Number(cities.id), name: cities.name },
    province_id: provinces ? { id: Number(provinces.id), name: provinces.name } : null,
    share_company_users: share_company_users.map(withRole),
  };
}

export type StoreCompany = ReturnType<typeof toStoreCompany>;

/**
 * Empresas propias (`owner_id`) y compartidas (`share_company_users`) del profile de sesión,
 * para la selección de empresa activa del store. El profile se resuelve desde la sesión
 * (nunca del cliente).
 */
export async function getStoreCompanies() {
  try {
    const credentialId = await getSessionUserId();
    if (!credentialId) return { allCompanies: [], sharedCompanies: [] };
    const profile = await prismaSystem.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } });
    if (!profile) return { allCompanies: [], sharedCompanies: [] };
    const profileId = profile.id;

    const [owned, shared] = await Promise.all([
      prismaSystem.company.findMany({ where: { owner_id: profileId }, include: companyForStoreInclude }),
      prismaSystem.share_company_users.findMany({
        where: { profile_id: profileId },
        include: { profile: true, company: { include: companyForStoreInclude } },
      }),
    ]);
    return {
      allCompanies: owned.map(toStoreCompany),
      sharedCompanies: shared.flatMap(({ company, ...row }) =>
        company ? [{ ...withRole(row), company_id: toStoreCompany(company) }] : []
      ),
    };
  } catch (error) {
    logger.error('Error al obtener empresas para el store', { data: { error } });
    return { allCompanies: [], sharedCompanies: [] };
  }
}

export type StoreSharedCompany = Awaited<ReturnType<typeof getStoreCompanies>>['sharedCompanies'][number];

/**
 * Equipos de la compañía para el único consumidor del store (la vista previa de campos
 * "Vehículos" del diseñador de formularios): sólo los identificadores que se listan, sin
 * documentos ni relaciones, y acotado para que una flota grande no viaje entera al navegador.
 */
const STORE_VEHICLES_LIMIT = 500;

export async function getStoreVehicles(companyId: string) {
  await assertCompanyAccess(companyId);
  try {
    return await prisma.vehicles.findMany({
      where: withCompany({}, companyId),
      select: { id: true, domain: true, serie: true, intern_number: true },
      orderBy: { domain: 'asc' },
      take: STORE_VEHICLES_LIMIT,
    });
  } catch (error) {
    logger.error('Error al obtener equipos para el store', { data: { error, companyId } });
    return [];
  }
}

export type StoreVehicle = Awaited<ReturnType<typeof getStoreVehicles>>[number];

/** Usuarios compartidos de la compañía (shape legacy: `profile_id` y `customer_id` expandidos). */
export async function getStoreSharedUsers(companyId: string) {
  await assertCompanyAccess(companyId);
  try {
    const rows = await prisma.share_company_users.findMany({
      where: withCompany({}, companyId),
      include: {
        profile: true,
        customers: { select: { id: true, name: true, cuit: true, address: true, is_active: true } },
      },
    });
    // `role` no existe en `share_company_users`: el rol del invitado vive en `profile.role`.
    return rows.flatMap(({ profile, customers, ...row }) =>
      profile
        ? [
            {
              ...row,
              role: profile.role ?? '',
              profile_id: profile,
              customer_id: customers && { ...customers, cuit: Number(customers.cuit) },
            },
          ]
        : []
    );
  } catch (error) {
    logger.error('Error al obtener usuarios compartidos para el store', { data: { error, companyId } });
    return [];
  }
}

export type StoreSharedUser = Awaited<ReturnType<typeof getStoreSharedUsers>>[number];
