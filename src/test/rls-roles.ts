import { PrismaClient } from '@/generated/prisma/client';
import { prismaPgConfig } from '@/shared/lib/prisma-pg-config';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Integración bajo los roles REALES de la base: el código de la app conecta como `alphataco_app` (sin BYPASSRLS, las
 * políticas le aplican) y el cliente de sistema como `alphataco_system`, igual que la demo y el e2e-rls. Los datos de
 * prueba los crea y borra el usuario dueño, con su propio cliente.
 *
 * Los tests de integración comunes corren como el dueño de las tablas, que saltea la RLS: por eso no vieron las listas
 * vacías de los `'use cache'` (ticket 800), las preferencias que nunca se guardaban ni los avisos de los jobs que la
 * RLS rechazaba. Las URLs las exportan `scripts/test-rls.sh` y `scripts/test-jobs.sh` después de habilitar los roles.
 */

/** URL del dueño, capturada al cargar el módulo: `connectAsAppRoles()` pisa `DATABASE_URL` después. */
const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.RLS_APP_DATABASE_URL;
const SYSTEM_URL = process.env.RLS_SYSTEM_DATABASE_URL;

/** Hay base y roles habilitados: las suites bajo RLS corren solo así. */
export const RUN_RLS = Boolean(OWNER_URL && APP_URL && SYSTEM_URL);

/**
 * Apunta los clientes de la app a los roles reales (`prisma`/`prismaBase` → `alphataco_app`, `prismaSystem` →
 * `alphataco_system`) y devuelve el cliente del dueño para los datos de prueba. Llamarlo ANTES del primer import de
 * `@/shared/lib/prisma`: los clientes leen la URL una sola vez, al crearse. Cada archivo de test corre en su propio
 * proceso, así que no afecta a los demás.
 */
export function connectAsAppRoles(): PrismaClient {
  if (!RUN_RLS || !OWNER_URL || !APP_URL || !SYSTEM_URL) {
    throw new Error('Faltan DATABASE_URL, RLS_APP_DATABASE_URL o RLS_SYSTEM_DATABASE_URL (ver scripts/test-rls.sh)');
  }
  process.env.DATABASE_URL = APP_URL;
  // Sin SYSTEM_DATABASE_URL, `prismaSystem` cae en el cliente de la app y los jobs fallarían por otra razón.
  process.env.SYSTEM_DATABASE_URL = SYSTEM_URL;
  return new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(OWNER_URL)) });
}

/**
 * Comprueba que el cliente de la app quedó conectado como `alphataco_app` y que la RLS le aplica: sin esto, un error
 * de configuración haría pasar las suites como dueño, sin probar nada.
 */
export async function assertAppRoleConnection(): Promise<void> {
  const { prismaBase } = await import('@/shared/lib/prisma');
  const [row] = await prismaBase.$queryRaw<{ role: string; bypass: boolean }[]>`
    SELECT current_user::text AS role, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname = current_user`;
  if (row?.role !== 'alphataco_app' || row.bypass) {
    throw new Error(`El cliente de la app no conecta como alphataco_app sin BYPASSRLS (conecta como ${row?.role})`);
  }
}

/** Empresa mínima de prueba (las columnas NOT NULL con relleno), creada por el dueño. */
export async function createTestCompany(
  owner: PrismaClient,
  company: { id: string; name: string; cuit: string; cityId: bigint }
): Promise<void> {
  await owner.company.create({
    data: {
      id: company.id,
      company_name: company.name,
      description: 'Empresa de prueba de integración bajo RLS',
      contact_email: `contacto-${company.id}@rls.test`,
      contact_phone: '0000000000',
      address: 'Sin especificar',
      city: company.cityId,
      country: 'Argentina',
      industry: 'Sin especificar',
      company_cuit: company.cuit,
    },
  });
}

/** Usuario (profile) miembro activo de una empresa, creado por el dueño. `id` = `credential_id`. */
export async function createTestMember(
  owner: PrismaClient,
  member: { id: string; email: string; fullname: string; companyId: string }
): Promise<void> {
  await owner.profile.create({
    data: { id: member.id, credential_id: member.id, email: member.email, fullname: member.fullname, role: 'User' },
  });
  await owner.share_company_users.create({ data: { company_id: member.companyId, profile_id: member.id } });
}
