import 'server-only';

import { notFound } from 'next/navigation';

/**
 * Puerta ÚNICA del portal de empleados (clave `portal` del catálogo funcional, F3 de la Sala de Control).
 *
 * Hasta que exista F3 la decide una variable de la instancia: `PORTAL_ENABLED=false` apaga el portal entero (las rutas
 * `/portal/**` responden 404 y el legajo deja de ofrecer "Habilitar portal"). Sin la variable el portal está prendido,
 * pero nadie entra hasta que RR.HH. le habilita el acceso a un legajo. Cuando F3 exista, se reemplaza el cuerpo de
 * `isPortalEnabled()` por la lectura del catálogo y nada más cambia.
 */
export function isPortalEnabled(): boolean {
  return process.env.PORTAL_ENABLED !== 'false';
}

/** Corta la ruta con 404 si el portal está apagado en esta instancia. */
export function assertPortalEnabled(): void {
  if (!isPortalEnabled()) notFound();
}
