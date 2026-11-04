import { moduleForMobileEntry } from '../../Modules/catalog.ts';

/**
 * Configuración de la API móvil. Se enciende SOLO en el contenedor `api` (`MOBILE_API_ENABLED=true`, perfil `mobile`
 * del compose): el contenedor `app` no la atiende y su autenticación no cambia. Módulo sin dependencias de Next.
 */
export const MOBILE_API_VERSION = '1';

/**
 * Revisión del contrato dentro de la versión 1 (solo agregados compatibles: campos nuevos opcionales y parámetros
 * nuevos). 1 = Empleados, Operaciones, Equipos y Documentación; 2 = rediseño de la app (lote W1); 3 = Capacitaciones,
 * tableros, avisos y búsqueda global (lote W2). Ver
 * `docs/api-movil/equipos-y-documentacion.md`.
 */
export const MOBILE_CONTRACT_REVISION = 3;

export function isMobileApiEnabled(): boolean {
  return process.env.MOBILE_API_ENABLED === 'true';
}

/** Módulos que la API móvil expone en esta versión (los informa `/capabilities`). */
export const MOBILE_MODULES = [
  'operaciones.daily-report-rows',
  'operaciones.daily-reports',
  'operaciones.resources',
  'empleados.employees',
  'equipos.equipment',
  'documentacion.documents',
  'hse.trainings',
  'nucleo.dashboards',
  'nucleo.notifications',
  'nucleo.search',
] as const;

/**
 * Entradas de `MOBILE_MODULES` cuya clave dueña (`catalog.mobile`) está encendida en `enabled`. Es lo que informan
 * `/capabilities` (instancia) y `/me` (empresa) para que la app no ofrezca lo que está apagado.
 */
export function mobileModulesFor(enabled: ReadonlySet<string>): (typeof MOBILE_MODULES)[number][] {
  return MOBILE_MODULES.filter((entry) => {
    const owner = moduleForMobileEntry(entry);
    return owner !== null && enabled.has(owner);
  });
}
