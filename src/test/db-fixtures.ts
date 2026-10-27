import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Datos mínimos que los tests de integración necesitan y que NO vienen en las migraciones.
 *
 * `cities` y `provinces` son catálogos que en el entorno de trabajo llegan con el clon de
 * producción (`scripts/sync-prod-to-dev.sh`), pero en CI la base se crea desde `0_init` y está
 * vacía. Un `findFirstOrThrow` sobre `cities` hacía que los tests pasaran en la máquina del
 * desarrollador y fallaran en CI — el peor modo de falla para una suite que existe justamente
 * para atajar regresiones.
 */

/** Una ciudad cualquiera, creándola con su provincia si el catálogo está vacío. */
export async function ensureCity(prisma: PrismaClient): Promise<{ id: bigint; province_id: bigint }> {
  const existing = await prisma.cities.findFirst({ select: { id: true, province_id: true } });
  if (existing) return existing;

  const province =
    (await prisma.provinces.findFirst({ select: { id: true } })) ??
    (await prisma.provinces.create({ data: { name: 'Provincia de prueba' }, select: { id: true } }));

  return prisma.cities.create({
    data: { name: 'Ciudad de prueba', province_id: province.id },
    select: { id: true, province_id: true },
  });
}

/**
 * El rol `User`: es el default de `profile.role` (FK a `roles.name`), así que ningún `profile`
 * se puede crear sin él. Lo siembra `scripts/seed-company.ts`, no las migraciones: en CI la base
 * de trabajo sale vacía de `0_init` y cualquier alta de perfil fallaba con `profile_role_fkey`.
 * Mismos valores que el seed; no se borra al terminar porque es catálogo compartido.
 *
 * `ON CONFLICT DO NOTHING` y no `prisma.roles.upsert`: el upsert de Prisma lee y después inserta,
 * y vitest corre los archivos en paralelo. Con la base vacía de CI, dos suites que llegaban a la
 * vez insertaban las dos y una caía con `roles_name_key` (P2002).
 */
// Tipado con lo que usa (no el cliente entero): comparar el cliente contextual con `PrismaClient` completo supera el
// límite de instanciación de tipos (TS2589) cuando crece el esquema.
export async function ensureDefaultRole(prisma: Pick<PrismaClient, '$executeRaw'>): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO roles (name, slug, is_system, is_active)
    VALUES ('User', 'user', true, true)
    ON CONFLICT DO NOTHING
  `;
}

/** Un país cualquiera (FK de `employees.birthplace`), creándolo si no hay ninguno. */
export async function ensureCountry(prisma: PrismaClient): Promise<{ id: string }> {
  const existing = await prisma.countries.findFirst({ select: { id: true } });
  if (existing) return existing;
  return prisma.countries.create({ data: { name: 'Argentina' }, select: { id: true } });
}
