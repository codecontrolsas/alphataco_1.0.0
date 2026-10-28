import 'server-only';

import { Logger } from '@/lib/logger';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { CORE_MODULE, isModuleKey, type ModuleKey } from '../catalog';

/**
 * Lectura del estado de los módulos (F3) para el código de servidor: «¿esta clave está encendida para la empresa?».
 *
 * - La fórmula es UNA, en la base: `app_enabled_modules(empresa)` (instancia encendida y la empresa no la apagó).
 * - La empresa sale SIEMPRE de la sesión (`getEnabledModules`, cacheada por request) o la pasa código de servidor que
 *   ya la resolvió (`getEnabledModulesFor`: jobs, APIs, portal). Nunca de un parámetro del cliente.
 * - Sin cache entre requests: un cambio en el panel se ve en el request siguiente.
 * - Va por el cliente de sistema, como `instance-settings.ts`: las tablas de estado no se abren al rol de la app.
 */

const logger = new Logger('features/Modules');

/** Un módulo apagado. Los adaptadores lo traducen: página → 404, API → 404 `MODULE_DISABLED`, job → `skipped`. */
export class ModuleDisabledError extends Error {
  constructor(readonly module: ModuleKey) {
    super(`El módulo ${module} no está habilitado.`);
    this.name = 'ModuleDisabledError';
  }
}

/** Mensaje para una action que se corta por módulo apagado. */
export const MODULE_DISABLED_MESSAGE = 'Este módulo no está habilitado.';

/** Claves encendidas para la empresa (o solo la instancia con `null`). Lanza si la base no responde. */
export async function readEnabledModules(companyId: string | null): Promise<ReadonlySet<ModuleKey>> {
  const rows = await prismaSystem.$queryRaw<{ keys: string[] | null }[]>`
    SELECT public.app_enabled_modules(${companyId}::uuid) AS keys`;
  const set = new Set<ModuleKey>([CORE_MODULE]);
  for (const key of rows[0]?.keys ?? []) if (isModuleKey(key)) set.add(key);
  return set;
}

/**
 * Para jobs, APIs y el portal, que ya conocen la empresa. Sin `cache()` ni `connection()` (puede correr fuera de un
 * render). Si la base falla, falla cerrada: solo el núcleo.
 */
export async function getEnabledModulesFor(companyId: string | null): Promise<ReadonlySet<ModuleKey>> {
  try {
    return await readEnabledModules(companyId);
  } catch (error) {
    logger.error('No se pudo leer el estado de los módulos', { data: { error, companyId } });
    return new Set<ModuleKey>([CORE_MODULE]);
  }
}

async function activeCompanyIdOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

/** Claves encendidas para la empresa activa de la sesión (por request). Sin empresa activa: las de la instancia. */
export const getEnabledModules = cache(async (): Promise<ReadonlySet<ModuleKey>> => {
  // Dato por request: con `cacheComponents`, consultar la base antes de leer la request rompe el prerender.
  await connection();
  return getEnabledModulesFor(await activeCompanyIdOrNull());
});

/**
 * Pestañas apagadas para la empresa activa (por módulo apagado, con la herencia): las usa el editor de roles para no
 * ofrecer permisos de módulos apagados. Si la base falla, devuelve vacío (el editor se ve como antes de F3).
 */
export const getDisabledTabIds = cache(async (): Promise<ReadonlySet<string>> => {
  await connection();
  const companyId = await activeCompanyIdOrNull();
  try {
    const rows = await prismaSystem.$queryRaw<{ id: string }[]>`
      SELECT public.app_disabled_tab_ids(${companyId}::uuid)::text AS id`;
    return new Set(rows.map((row) => row.id));
  } catch (error) {
    logger.error('No se pudieron leer las pestañas apagadas', { data: { error, companyId } });
    return new Set();
  }
});

/**
 * ¿La clave está encendida para ESA empresa? Para rutinas de servidor que ya conocen la empresa y pueden correr dentro de
 * una transacción ajena (cachés derivados: `refreshDocumentStatus`, `syncHse*`). Sin `cache()`: lee el estado vigente.
 */
export async function isModuleEnabledForCompany(key: ModuleKey, companyId: string): Promise<boolean> {
  return key === CORE_MODULE || (await getEnabledModulesFor(companyId)).has(key);
}

export async function isModuleEnabled(key: ModuleKey): Promise<boolean> {
  return key === CORE_MODULE || (await getEnabledModules()).has(key);
}

/** Para actions y servicios: lanza `ModuleDisabledError` si la clave está apagada para la empresa activa. */
export async function requireModule(key: ModuleKey): Promise<void> {
  if (!(await isModuleEnabled(key))) throw new ModuleDisabledError(key);
}

/** Para páginas: 404 si la clave está apagada (el módulo «no existe» para esa empresa; sin página de «no contratado»). */
export async function requireModulePage(key: ModuleKey): Promise<void> {
  if (!(await isModuleEnabled(key))) notFound();
}

/**
 * Compatibilidad con las compuertas por variable de entorno (`HSE_ENABLED`, `PORTAL_ENABLED`) hasta F3.6: decide el
 * estado del módulo y, si no se puede leer (base sin la migración de F3, error de conexión), se comporta como antes de
 * F3 (encendido) y lo deja en el log.
 */
export async function isModuleEnabledOrLegacy(key: ModuleKey, companyId?: string | null): Promise<boolean> {
  try {
    if (companyId !== undefined) return (await readEnabledModules(companyId)).has(key);
    await connection();
    return (await readEnabledModules(await activeCompanyIdOrNull())).has(key);
  } catch (error) {
    logger.warn('Estado del módulo no disponible: se usa la variable de entorno', { data: { error, key } });
    return true;
  }
}
