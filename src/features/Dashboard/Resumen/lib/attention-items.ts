import type { ExpiringOverview } from '@/features/Dashboard/Documentacion/lib/expiring-overview.server';

/**
 * Piezas puras de la bandeja «Para atender»: forma de un pendiente, tono por fuente y los pendientes de documentos
 * vencidos. Módulo sin dependencias de servidor: lo usan la bandeja web (`attention.server.ts`) y la API móvil.
 */

/** Qué tan urgente es un pendiente: ordena la bandeja y elige el color. */
export type AttentionTone = 'danger' | 'warn' | 'info';

export interface AttentionItem {
  key: string;
  module: string;
  /** Lo que se cuenta, en minúscula y plural («solicitudes pendientes de aprobación»). */
  label: string;
  count: number;
  href: string;
  tone: AttentionTone;
}

/** Una fuente de la bandeja: el pendiente, sin permiso, o error al calcularlo. */
export type Source = { status: 'ok'; item: AttentionItem } | { status: 'forbidden' } | { status: 'error' };
export const FORBIDDEN: Source = { status: 'forbidden' };
export const ERROR: Source = { status: 'error' };

/** Lo vencido va primero: es lo que ya está fuera de término. */
const DANGER_KEYS = new Set([
  'documentacion:empleados',
  'documentacion:equipos',
  'compras:pagos',
  'tesoreria:cobranzas',
]);
/** Lo que espera una decisión de alguien. */
const WARN_KEYS = new Set([
  'mantenimiento:maint_operaciones',
  'almacenes:pedidos',
  'compras:solicitudes',
  'compras:ordenes',
  'compras:facturas',
  'comercial:certificaciones-borrador',
]);
export const TONE_ORDER: Record<AttentionTone, number> = { danger: 0, warn: 1, info: 2 };

export function toneFor(key: string): AttentionTone {
  if (DANGER_KEYS.has(key)) return 'danger';
  if (WARN_KEYS.has(key)) return 'warn';
  return 'info';
}

/**
 * Documentos ya vencidos de personal y de equipos, a partir de las series de vencimientos. Lo comparten la bandeja web y
 * la API móvil (que arma la serie con su propio contexto).
 */
export function overdueDocumentSources(overview: Pick<ExpiringOverview, 'employees' | 'vehicles'>): Source[] {
  const build = (key: string, source: typeof overview.employees, label: string, href: string): Source =>
    source.status === 'ok'
      ? {
          status: 'ok',
          item: { key, module: 'Documentación', label, count: source.series.overdue, href, tone: toneFor(key) },
        }
      : source.status === 'error'
        ? ERROR
        : FORBIDDEN;
  return [
    build(
      'documentacion:empleados',
      overview.employees,
      'documentos de personal vencidos',
      '/dashboard/document?tab=documentos-de-empleados'
    ),
    build(
      'documentacion:equipos',
      overview.vehicles,
      'documentos de equipos vencidos',
      '/dashboard/document?tab=documentos-de-equipos'
    ),
  ];
}
