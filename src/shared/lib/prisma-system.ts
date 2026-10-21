import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaPgConfig } from './prisma-pg-config';
import { prismaBase, type TenantPrismaClient } from './prisma';

const globalForSystem = globalThis as unknown as { prismaSystem: PrismaClient | undefined };

function createSystemClient(): PrismaClient {
  const connectionString = process.env.SYSTEM_DATABASE_URL;
  // Sin URL de sistema (instancias que todavia conectan como el usuario duenio) se usa el cliente base.
  if (!connectionString) return prismaBase;
  return new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(connectionString)) });
}

/**
 * Cliente del SISTEMA: conecta como `alphataco_system` (`SYSTEM_DATABASE_URL`, con BYPASSRLS) y no lleva contexto de
 * empresa. Es para lo que corre ANTES de saber la empresa o para todas a la vez: jobs programados (recorren las
 * empresas), autenticacion de la API externa (busca la credencial por su id) y registro de intentos fallidos.
 *
 * Las features y las acciones del dashboard NO lo usan: ahi corre el cliente de `prisma.ts`, con el contexto de la
 * empresa activa y RLS como red de seguridad.
 */
export const prismaSystem: TenantPrismaClient = (globalForSystem.prismaSystem ??
  createSystemClient()) as unknown as TenantPrismaClient;

if (process.env.NODE_ENV !== 'production') globalForSystem.prismaSystem = prismaSystem as unknown as PrismaClient;
