/**
 * Configuración de la API móvil. Se enciende SOLO en el contenedor `api` (`MOBILE_API_ENABLED=true`, perfil `mobile`
 * del compose): el contenedor `app` no la atiende y su autenticación no cambia. Módulo sin dependencias de Next.
 */
export const MOBILE_API_VERSION = '1';

export function isMobileApiEnabled(): boolean {
  return process.env.MOBILE_API_ENABLED === 'true';
}

/** Módulos que la API móvil expone en esta versión (los informa `/capabilities`). */
export const MOBILE_MODULES = [
  'operaciones.daily-report-rows',
  'operaciones.daily-reports',
  'operaciones.resources',
  'empleados.employees',
] as const;
