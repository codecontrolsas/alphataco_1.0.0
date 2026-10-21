import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaPgConfig } from './prisma-pg-config';
import { createContextualClient } from './tenant-context';

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
 * Cliente que usan las features. Con `TENANT_CONTEXT=on` cada operacion corre con `app.company_id`, `app.user_id` y
 * `app.actor_kind` fijados (ver `tenant-context.ts`), que es lo que leen las politicas RLS; apagado (el valor por
 * defecto) es el mismo cliente base, sin costo. Se prende junto con el cambio de `DATABASE_URL` al rol
 * `alphataco_app` (docs/deploy/runbook.md): mientras la app conecte como duenio de las tablas, las politicas no
 * le aplican y el contexto no aporta nada.
 */
/**
 * El tipo es `PrismaClient & Prisma.TransactionClient` a proposito: muchos helpers piden `Prisma.TransactionClient` (o un
 * `Pick` de el) y se llaman tanto con un `tx` como con este cliente. Con el tipo plano, TypeScript compara
 * estructuralmente los dos clientes completos y `next build` supera el limite de instanciacion de tipos (TS2589) cuando
 * crece el esquema; con la interseccion, el cliente YA contiene `TransactionClient` y la comparacion es inmediata.
 */
export type TenantPrismaClient = PrismaClient & Prisma.TransactionClient;

export const prisma: TenantPrismaClient =
  process.env.TENANT_CONTEXT === 'on'
    ? (globalForPrisma.prismaContextual ??
      (createContextualClient(prismaBase, async () => {
        // Import dinamico: tenant-db trae `next/headers` y la sesion, que solo existen dentro de un request.
        const { getTenantContextOrNull } = await import('./tenant-db');
        return getTenantContextOrNull();
      }) as unknown as TenantPrismaClient))
    : (prismaBase as unknown as TenantPrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaBase;
  globalForPrisma.prismaContextual = (prisma as unknown) === prismaBase ? undefined : prisma;
}
