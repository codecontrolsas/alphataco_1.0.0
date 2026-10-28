import 'server-only';

import { isModuleEnabledOrLegacy } from '@/features/Modules/server/modules.server';
import { notFound } from 'next/navigation';

/**
 * Puerta ÚNICA del portal de empleados (clave `portal` del catálogo funcional, F3 de la sala de control).
 *
 * Desde F3.1 la decide el estado del módulo (instancia y empresa) y, mientras exista, también la variable
 * `PORTAL_ENABLED`: `PORTAL_ENABLED=false` lo apaga igual que antes. Si el estado no se puede leer, manda la variable.
 * Apagado: las rutas `/portal/**` responden 404 y el legajo deja de ofrecer «Habilitar portal». En F3.6 se borra la
 * variable y esto pasa a ser `isModuleEnabled('portal')` / `requireModule('portal')`.
 */
export function isPortalEnabledByEnv(): boolean {
  return process.env.PORTAL_ENABLED !== 'false';
}

/** `companyId` para quien ya conoce la empresa (el panel del portal); sin él, la empresa activa de la sesión. */
export async function isPortalEnabled(companyId?: string | null): Promise<boolean> {
  return isPortalEnabledByEnv() && (await isModuleEnabledOrLegacy('portal', companyId));
}

/** Corta la ruta con 404 si el portal está apagado. */
export async function assertPortalEnabled(companyId?: string | null): Promise<void> {
  if (!(await isPortalEnabled(companyId))) notFound();
}

/**
 * Corte SÍNCRONO por la variable, para el layout raíz de `/portal` (síncrono: con `cacheComponents` no puede leer la
 * base fuera de un Suspense). El estado del módulo lo corta el panel (`PortalPanel`) y el login. Se borra en F3.6.
 */
export function assertPortalEnabledByEnv(): void {
  if (!isPortalEnabledByEnv()) notFound();
}
