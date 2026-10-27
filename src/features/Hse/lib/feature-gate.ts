import 'server-only';

import { notFound } from 'next/navigation';

/**
 * Puerta ÚNICA del módulo HSE (clave `hse` del catálogo funcional, F3 de la Sala de Control).
 *
 * Hasta que exista F3 la decide una variable de la instancia: `HSE_ENABLED=false` apaga el módulo entero
 * (`/dashboard/hse/**` y los documentos HSE del portal responden 404 y los archivos `hse-files` no se sirven). Las tablas
 * existen igual (migraciones comunes) y quedan vacías. Cuando F3 exista, se reemplaza el cuerpo de `isHseEnabled()` por
 * la lectura del catálogo y nada más cambia. Va junto a `assertPortalEnabled()` (`features/Portal/lib/feature-gate.ts`).
 */
export function isHseEnabled(): boolean {
  return process.env.HSE_ENABLED !== 'false';
}

/** Corta la ruta con 404 si HSE está apagado en esta instancia. */
export function assertHseEnabled(): void {
  if (!isHseEnabled()) notFound();
}
