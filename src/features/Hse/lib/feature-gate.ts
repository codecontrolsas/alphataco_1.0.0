import 'server-only';

import { isModuleEnabledOrLegacy } from '@/features/Modules/server/modules.server';
import { notFound } from 'next/navigation';

/**
 * Puerta ÚNICA del módulo HSE (clave `hse` del catálogo funcional, F3 de la sala de control).
 *
 * Desde F3.1 la decide el estado del módulo (instancia y empresa, `app_enabled_modules`) y, mientras exista, también la
 * variable `HSE_ENABLED`: `HSE_ENABLED=false` lo apaga igual que antes. Si el estado no se puede leer, manda la variable
 * (compatibilidad). En F3.6 se borra la variable y esto pasa a ser `isModuleEnabled('hse')` / `requireModule('hse')`.
 * Apagado: `/dashboard/hse/**` y los documentos HSE del portal responden 404 y los archivos `hse-files` no se sirven.
 * Va junto a `assertPortalEnabled()` (`features/Portal/lib/feature-gate.ts`).
 */
export function isHseEnabledByEnv(): boolean {
  return process.env.HSE_ENABLED !== 'false';
}

/** `companyId` para quien ya conoce la empresa (jobs, portal); sin él, la empresa activa de la sesión. */
export async function isHseEnabled(companyId?: string | null): Promise<boolean> {
  return isHseEnabledByEnv() && (await isModuleEnabledOrLegacy('hse', companyId));
}

/** Corta la ruta con 404 si HSE está apagado. */
export async function assertHseEnabled(): Promise<void> {
  if (!(await isHseEnabled())) notFound();
}

/**
 * Saca el módulo `hse` de la navegación (sidebar y buscador del header) si la VARIABLE lo apaga. El apagado por estado
 * ya lo hacen los permisos (las pestañas de un módulo apagado no se devuelven). Se borra en F3.6.
 */
export function withoutDisabledHse(moduleSlugs: string[]): string[] {
  return isHseEnabledByEnv() ? moduleSlugs : moduleSlugs.filter((slug) => slug !== 'hse');
}
