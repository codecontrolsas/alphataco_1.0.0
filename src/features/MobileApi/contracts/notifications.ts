import { z } from 'zod';

/**
 * Contrato de Avisos de `/api/mobile/v1` (solo lectura, revisión 3). Módulo sin directivas.
 *
 * Los avisos son la bandeja personal de la campanita de la web (`notification_deliveries` en la app: una fila por
 * destinatario, con su estado de lectura). La app SOLO lee: marcar como leído sigue siendo de la web.
 */

export const NOTIFICATION_LIST_MAX = 50;

export const notificationListQuerySchema = z.object({
  /** `unread=1`: solo los no leídos. */
  unread: z
    .enum(['0', '1'])
    .optional()
    .transform((value) => value === '1'),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_LIST_MAX).default(20),
});
export type NotificationListQuery = z.output<typeof notificationListQuerySchema>;

/** A dónde lleva un aviso dentro de la app. `null` = no hay pantalla equivalente (el aviso se lee y listo). */
export const notificationTargetSchema = z
  .object({
    /** `daily-report` (id = parte diario) · `module` (id = `documents` o `trainings`). */
    type: z.enum(['daily-report', 'module']),
    id: z.string(),
  })
  .nullable();

export const notificationItemSchema = z.object({
  /** Id de la entrega (estable): es el cursor de la paginación. */
  id: z.string().uuid(),
  /** Clave del evento del catálogo de avisos (`documents.expiry_weekly`, `operations.daily_report_deviations`, …). */
  kind: z.string(),
  /** Módulo del evento, para agrupar o ilustrar (`Documentación`, `Operaciones`, …); null si el evento ya no está en el catálogo. */
  module: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  /** Cuándo se generó (hora argentina, con desfase). */
  at: z.string(),
  /** Día argentino (`YYYY-MM-DD`): la clave para agrupar por día. */
  day: z.string(),
  unread: z.boolean(),
  target: notificationTargetSchema,
});

export const notificationListResponseSchema = z.object({
  items: z.array(notificationItemSchema),
  nextCursor: z.string().nullable(),
  /** No leídos (los que cuenta la campanita de la web); solo en la primera página. */
  unreadCount: z.number().int().nullable(),
});

export const notificationCountResponseSchema = z.object({ unread: z.number().int() });
