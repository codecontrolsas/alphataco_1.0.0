import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaPgConfig } from './prisma-pg-config';
import { createContextualClient } from './tenant-context';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaContextual: PrismaClient | undefined;
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
export const prisma: PrismaClient =
  globalForPrisma.prismaContextual ??
  (createContextualClient(prismaBase, async () => {
    // Import dinamico: tenant-db trae `next/headers` y la sesion, que solo existen dentro de un request.
    const { getTenantContextOrNull } = await import('./tenant-db');
    return getTenantContextOrNull();
  }) as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaBase;
  globalForPrisma.prismaContextual = prisma;
}
