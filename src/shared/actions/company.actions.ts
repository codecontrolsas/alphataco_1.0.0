'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('shared/company');

const companyRowSelect = {
  id: true,
  company_name: true,
  description: true,
  website: true,
  contact_email: true,
  contact_phone: true,
  address: true,
  city: true,
  country: true,
  industry: true,
  company_logo: true,
  is_active: true,
  company_cuit: true,
  province_id: true,
  owner_id: true,
  by_defect: true,
} as const;

type CompanyRowRaw = {
  city: bigint;
  province_id: bigint | null;
};

/**
 * `cities.id` y `provinces.id` son `bigint` en Postgres; los consumidores (selector de
 * empresa, formularios) los manejan como `number`, así que se convierten acá.
 */
function toCompanyRow<T extends CompanyRowRaw>({ city, province_id, ...rest }: T) {
  return { ...rest, city: Number(city), province_id: province_id == null ? null : Number(province_id) };
}

/** Empresa activa (array de 0/1 elementos, shape legacy de `select('*')`). */
export const fetchCurrentCompany = async () => {
  try {
    const company_id = await getActiveCompanyId();
    const rows = await prisma.company.findMany({ where: { id: company_id }, select: companyRowSelect });
    return rows.map(toCompanyRow);
  } catch (error) {
    logger.error('Error fetching company', { data: { error } });
    return null;
  }
};

/** Empresas propias (`owner_id`) y compartidas (`share_company_users`) del profile de sesión. */
export const fetchUserCompanies = async () => {
  const credentialId = await getSessionUserId();
  if (!credentialId) {
    return { sharedCompanies: [], allCompanies: [] };
  }

  try {
    const profile = await prismaSystem.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } });
    if (!profile) return { sharedCompanies: [], allCompanies: [] };
    const userId = profile.id;

    const [shared, owned] = await Promise.all([
      prismaSystem.share_company_users.findMany({
        where: { profile_id: userId },
        select: { company: { select: companyRowSelect } },
      }),
      prismaSystem.company.findMany({ where: { owner_id: userId }, select: companyRowSelect }),
    ]);

    // Cada empresa una sola vez: un usuario puede ser dueño y además tenerla compartida
    // (`share_company_users`), o tener dos filas compartidas de la misma. Sin esto la empresa
    // salía repetida en el selector. Si es dueño, cuenta como propia.
    const seen = new Set(owned.map((company) => company.id));
    const sharedCompanies = shared.flatMap((sc) => {
      if (!sc.company || seen.has(sc.company.id)) return [];
      seen.add(sc.company.id);
      return [toCompanyRow(sc.company)];
    });
    return { sharedCompanies, allCompanies: owned.map(toCompanyRow) };
  } catch (error) {
    logger.error('Error fetching user companies', { data: { error } });
    return { sharedCompanies: [], allCompanies: [] };
  }
};
