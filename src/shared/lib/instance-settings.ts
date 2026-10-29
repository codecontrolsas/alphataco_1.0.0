import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { connection } from 'next/server';
import { cache } from 'react';
import { prismaSystem } from './prisma-system';

/**
 * Lectura tipada de `instance_settings` (configuración global de la instancia, ticket 807).
 *
 * La tabla no tiene empresa ni RLS y la app solo la puede leer: el valor lo cambia el dueño de la base
 * o el panel de administración externo (ver `docs/deploy/runbook.md`, "Límite de empresas"). Las
 * lecturas van por el cliente de sistema, igual que el conteo de empresas: hay que ver TODAS las
 * empresas de la instancia, no solo la activa.
 */

const logger = new Logger('shared/lib/instance-settings');

/** Claves conocidas de `instance_settings`. */
export const INSTANCE_SETTING_KEYS = { maxCompanies: 'max_companies' } as const;

/** Si la fila falta o el valor no es un entero >= 1, la instancia admite una sola empresa. */
export const DEFAULT_MAX_COMPANIES = 1;

/**
 * Lock transaccional (`pg_advisory_xact_lock(hashtext(...))`) que serializa el alta de empresas con los cambios de
 * `max_companies`: el conteo y el insert (o el cambio del límite) no pueden cruzarse.
 */
export const COMPANY_LIMIT_LOCK_KEY = 'alphataco:company-create-limit';

type SettingsReader = Pick<Prisma.TransactionClient, 'instance_settings'>;
type CompanyCounter = Pick<Prisma.TransactionClient, 'company'>;

/** Normaliza el valor guardado (`1`, `"3"`, …) a un entero >= 1, o null si no es válido. */
export function parseMaxCompanies(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/** Lee `max_companies` con el cliente dado (dentro de una transacción, el `tx`). */
export async function readMaxCompanies(db: SettingsReader): Promise<number> {
  const row = await db.instance_settings.findUnique({
    where: { key: INSTANCE_SETTING_KEYS.maxCompanies },
    select: { value: true },
  });
  if (!row) return DEFAULT_MAX_COMPANIES;
  const max = parseMaxCompanies(row.value);
  if (max === null) {
    logger.warn('instance_settings.max_companies inválido: se usa el valor por defecto', {
      data: { value: row.value },
    });
    return DEFAULT_MAX_COMPANIES;
  }
  return max;
}

/** Cantidad máxima de empresas de la instancia (por request). Default 1 si falta, es inválida o no se puede leer. */
export const getMaxCompanies = cache(async (): Promise<number> => {
  // Dato por request: con `cacheComponents`, consultar la base antes de leer la request rompe el prerender.
  await connection();
  try {
    return await readMaxCompanies(prismaSystem);
  } catch (error) {
    logger.error('No se pudo leer instance_settings.max_companies', { data: { error } });
    return DEFAULT_MAX_COMPANIES;
  }
});

export interface CompanyLimitStatus {
  /** Empresas permitidas en la instancia. */
  max: number;
  /** Empresas existentes (activas e inactivas: todas ocupan lugar). */
  count: number;
  /** true si ya no se puede crear otra. */
  reached: boolean;
}

/** Estado del límite con el cliente dado. Dentro del alta se llama con el `tx` que ya tomó el lock. */
export async function readCompanyLimitStatus(db: SettingsReader & CompanyCounter): Promise<CompanyLimitStatus> {
  const [max, count] = await Promise.all([readMaxCompanies(db), db.company.count()]);
  return { max, count, reached: count >= max };
}

/**
 * Estado del límite para la UI (por request). Si la consulta falla se informa como alcanzado: la UI no
 * ofrece crear una empresa que el servidor después podría rechazar (el servidor valida igual).
 */
export const getCompanyLimitStatus = cache(async (): Promise<CompanyLimitStatus> => {
  await connection();
  try {
    return await readCompanyLimitStatus(prismaSystem);
  } catch (error) {
    logger.error('No se pudo calcular el límite de empresas', { data: { error } });
    return { max: DEFAULT_MAX_COMPANIES, count: DEFAULT_MAX_COMPANIES, reached: true };
  }
});

/**
 * Instancia de una sola empresa (`max_companies = 1`): la UI es la de esa empresa, sin selector, sin alta y sin
 * ninguna mención a «otras empresas». Con N > 1 la UI multiempresa aparece según cuántas haya.
 */
export function isSingleCompanyInstance(limit: Pick<CompanyLimitStatus, 'max'>): boolean {
  return limit.max === 1;
}

/**
 * Qué muestra el header del sidebar: solo la identidad de la empresa (instancia de una sola empresa, o una sola
 * empresa del usuario sin lugar para otra) o el selector (más de una empresa, o todavía se puede crear otra: el botón
 * «Agregar compañía» vive en el desplegable).
 */
export function companyHeaderMode(
  limit: Pick<CompanyLimitStatus, 'max' | 'reached'>,
  userCompanies: number
): 'identity' | 'switcher' {
  if (isSingleCompanyInstance(limit)) return 'identity';
  return userCompanies > 1 || !limit.reached ? 'switcher' : 'identity';
}

/** Texto informativo del límite: «Tu plan permite 1 empresa». */
export function companyLimitLabel(max: number): string {
  return `Tu plan permite ${max} ${max === 1 ? 'empresa' : 'empresas'}`;
}

/** «Tu plan permite 1 empresa y ya está en uso» / «… 3 empresas y ya están todas en uso». */
export function companyLimitReachedText(max: number): string {
  return `${companyLimitLabel(max)} y ${max === 1 ? 'ya está en uso' : 'ya están todas en uso'}`;
}
