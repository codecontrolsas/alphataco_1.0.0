import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaPgConfig } from './prisma-pg-config';
import { createContextualClient, getCompanyScopeContext } from './tenant-context';

/**
 * El tipo es `Prisma.TransactionClient` mas los metodos de conexion a proposito: muchos helpers piden
 * `Prisma.TransactionClient` (o un `Pick` de el) y se llaman tanto con un `tx` como con este cliente. Con el tipo plano
 * (`PrismaClient`), TypeScript compara estructuralmente los dos clientes completos y `next build` supera el limite de
 * instanciacion de tipos (TS2589) cuando crece el esquema; con esta definicion, el cliente YA contiene
 * `TransactionClient` y la comparacion es inmediata. Solo se suman los metodos de conexion (no `PrismaClient` entero)
 * para no duplicar los tipos de todos los modelos: eso agota la memoria de `tsc`.
 */
export type TenantPrismaClient = Prisma.TransactionClient &
  Pick<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaContextual: TenantPrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL no esta definida en las variables de entorno');
  }

  const adapter = new PrismaPg(prismaPgConfig(connectionString));
  return new PrismaClient({ adapter });
}

/**
 * Cliente SIN extensiones. Lo usan quienes resuelven el contexto (sesion, empresa activa, Better Auth), los jobs y los
 * scripts: si resolvieran el contexto con el cliente contextual, la resolucion se esperaria a si misma.
 */
export const prismaBase = globalForPrisma.prisma ?? createPrismaClient();

/**
 * Cliente que usan las features. SIEMPRE lleva el contexto de la transaccion (`app.company_id`, `app.user_id`,
 * `app.actor_kind`, ver `tenant-context.ts`): es lo que completa solo `company_id` en cada fila nueva
 * (`DEFAULT app_current_company_id()`) y lo que leen las politicas RLS. Sin request (login, jobs, tests) la operacion
 * corre directa, sin contexto: ahi `company_id` hay que pasarlo explicito.
 */
export const prisma: TenantPrismaClient =
  globalForPrisma.prismaContextual ??
  (createContextualClient(prismaBase, async () => {
    // Dentro de una funcion `'use cache'` no hay request: manda la empresa que fijo `runInCompanyScope`.
    const scoped = getCompanyScopeContext();
    if (scoped) return scoped;
    // Import dinamico: tenant-db trae `next/headers` y la sesion, que solo existen dentro de un request.
    const { getTenantContextOrNull } = await import('./tenant-db');
    return getTenantContextOrNull();
  }) as unknown as TenantPrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaBase;
  globalForPrisma.prismaContextual = prisma;
}
