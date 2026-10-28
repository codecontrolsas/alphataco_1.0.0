/**
 * Catálogo de avisos del sistema (#786). Módulo sin directiva ni dependencias de servidor: lo leen el
 * despachador (`lib/dispatch.server.ts`) y el editor de roles del cliente, igual que `permissions-map.ts`.
 *
 * Cada rol elige por evento si lo recibe en la campanita y/o por email (`role_notifications`). Además,
 * para recibirlo hay que tener ALGUNO de los permisos de `requires`: el rol habilita el canal, el permiso
 * pone el piso de quién puede ver ese dato.
 */

export type NotificationChannel = 'in_app' | 'email';

/** `role` = a todos los de los roles con el aviso activo; `actor` = a una persona puntual (quien pidió o creó). */
export type NotificationAudience = 'role' | 'actor';

export interface NotificationPermission {
  module: string;
  tab: string;
  action: string;
}

export interface NotificationEventDef {
  /** Módulo para agrupar en el editor y en la bandeja. */
  module: string;
  moduleLabel: string;
  label: string;
  description: string;
  audience: NotificationAudience;
  requires: readonly NotificationPermission[];
  /** Texto legible del permiso mínimo, para el editor de roles. */
  requiresLabel: string;
  /** Lista fija de la empresa (`notification_settings`) que también recibe el email. */
  legacyKind?: 'documents_expiry' | 'daily_report_deviations' | 'stock_batch_expiry';
  /** Canales que se preseleccionan al crear un rol nuevo. */
  defaultChannels: readonly NotificationChannel[];
}

export const NOTIFICATION_EVENTS = {
  'documents.expiry_weekly': {
    module: 'documentacion',
    moduleLabel: 'Documentación',
    label: 'Resumen semanal de vencimientos',
    description: 'Los lunes: documentos vencidos, por vencer y faltantes de personal, equipos y empresa.',
    audience: 'role',
    requires: [
      { module: 'documentacion', tab: 'documentos-de-empleados', action: 'view' },
      { module: 'documentacion', tab: 'documentos-de-equipos', action: 'view' },
      { module: 'documentacion', tab: 'documentos-de-empresa', action: 'view' },
    ],
    requiresLabel: 'Ver documentos de empleados, de equipos o de empresa',
    legacyKind: 'documents_expiry',
    defaultChannels: ['in_app'],
  },
  'operations.daily_report_deviations': {
    module: 'operaciones',
    moduleLabel: 'Operaciones',
    label: 'Desvíos del parte diario',
    description: 'Cada día: servicios del parte con desvíos de personal o de equipos.',
    audience: 'role',
    requires: [{ module: 'operaciones', tab: 'detalle-parte-diario', action: 'view' }],
    requiresLabel: 'Ver el detalle del parte diario',
    legacyKind: 'daily_report_deviations',
    defaultChannels: ['in_app'],
  },
  'warehouses.batch_expiry': {
    module: 'almacenes',
    moduleLabel: 'Almacenes',
    label: 'Lotes por vencer',
    description: 'Los lunes: lotes con saldo vencidos o que vencen en los próximos 30 días.',
    audience: 'role',
    requires: [{ module: 'almacenes', tab: 'stock', action: 'view' }],
    requiresLabel: 'Ver el stock',
    legacyKind: 'stock_batch_expiry',
    defaultChannels: ['in_app'],
  },
  'purchases.request_submitted': {
    module: 'compras',
    moduleLabel: 'Compras',
    label: 'Solicitud de compra para aprobar',
    description: 'Alguien envió una solicitud de compra a aprobación.',
    audience: 'role',
    requires: [{ module: 'compras', tab: 'solicitudes', action: 'approve' }],
    requiresLabel: 'Aprobar solicitudes de compra',
    defaultChannels: ['in_app'],
  },
  'purchases.request_decided': {
    module: 'compras',
    moduleLabel: 'Compras',
    label: 'Tu solicitud fue aprobada o rechazada',
    description: 'Le llega a quien pidió la solicitud de compra.',
    audience: 'actor',
    requires: [{ module: 'compras', tab: 'solicitudes', action: 'view' }],
    requiresLabel: 'Ver solicitudes de compra',
    defaultChannels: ['in_app', 'email'],
  },
  'purchases.order_submitted': {
    module: 'compras',
    moduleLabel: 'Compras',
    label: 'Orden de compra para aprobar',
    description: 'Alguien envió una orden de compra a aprobación.',
    audience: 'role',
    requires: [{ module: 'compras', tab: 'ordenes', action: 'approve' }],
    requiresLabel: 'Aprobar órdenes de compra',
    defaultChannels: ['in_app'],
  },
  'purchases.order_decided': {
    module: 'compras',
    moduleLabel: 'Compras',
    label: 'Tu orden de compra fue aprobada o rechazada',
    description: 'Le llega a quien creó la orden de compra.',
    audience: 'actor',
    requires: [{ module: 'compras', tab: 'ordenes', action: 'view' }],
    requiresLabel: 'Ver órdenes de compra',
    defaultChannels: ['in_app', 'email'],
  },
  'hse.document_rejected': {
    module: 'hse',
    moduleLabel: 'HSE',
    label: 'Un empleado rechazó un documento HSE',
    description: 'Cuando un empleado rechaza un documento desde el portal, con el motivo que escribió.',
    audience: 'role',
    requires: [{ module: 'hse', tab: 'documentos-hse', action: 'view' }],
    requiresLabel: 'Ver los documentos HSE',
    defaultChannels: ['in_app', 'email'],
  },
  'hse.expiry_weekly': {
    module: 'hse',
    moduleLabel: 'HSE',
    label: 'Resumen semanal de vencimientos HSE',
    description:
      'Los lunes: capacitaciones y documentos HSE vencidos o por vencer, y pendientes de aceptar, aprobar o firmar.',
    audience: 'role',
    requires: [
      { module: 'hse', tab: 'cumplimiento', action: 'view' },
      { module: 'hse', tab: 'capacitaciones', action: 'view' },
    ],
    requiresLabel: 'Ver el cumplimiento o las capacitaciones de HSE',
    defaultChannels: ['in_app'],
  },
} as const satisfies Record<string, NotificationEventDef>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

export const NOTIFICATION_EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[];

export function isNotificationEventKey(value: string): value is NotificationEventKey {
  return Object.hasOwn(NOTIFICATION_EVENTS, value);
}

export function getNotificationEvent(key: NotificationEventKey): NotificationEventDef {
  return NOTIFICATION_EVENTS[key];
}

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'Campanita',
  email: 'Email',
};
