import type { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';

/**
 * Filtro virtual `attention` del listado de comprobantes. Lo escriben las tarjetas del tablero
 * (`InvoicingMetrics`) y lo resuelve `buildWhereClause`: el conteo de cada tarjeta y las filas de la tabla
 * salen de la MISMA condición (`invoiceAttentionWhere`). Módulo sin directiva: lo importan servidor y cliente.
 */

export const INVOICES_TABLE_ID = 'invoices';

export const INVOICE_ATTENTION_KEYS = ['drafts', 'pending', 'rejected', 'authorized'] as const;
export type InvoiceAttentionKey = (typeof INVOICE_ATTENTION_KEYS)[number];

export function isInvoiceAttentionKey(value: unknown): value is InvoiceAttentionKey {
  return typeof value === 'string' && (INVOICE_ATTENTION_KEYS as readonly string[]).includes(value);
}

/** Ventana de "rechazadas recientes", en días. */
export const REJECTED_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Primer instante del mes en hora argentina (UTC-3, sin horario de verano). */
function argentinaMonthStart(now: Date): Date {
  return new Date(`${argentinaDate(now).slice(0, 7)}-01T00:00:00-03:00`);
}

/**
 * - `drafts`: borradores.
 * - `pending`: sin respuesta firme de ARCA (`pendiente` y `emitiendo`): hay que consultar antes de reintentar.
 * - `rejected`: rechazadas en los últimos 30 días (fecha del último envío a ARCA; sin envío, la última actualización).
 * - `authorized`: autorizadas en el mes en curso (fecha de autorización, hora argentina).
 */
export function invoiceAttentionWhere(key: InvoiceAttentionKey, now: Date): Prisma.invoicesWhereInput {
  switch (key) {
    case 'drafts':
      return { status: 'borrador' };
    case 'pending':
      return { status: { in: ['pendiente', 'emitiendo'] } };
    case 'rejected': {
      const since = new Date(now.getTime() - REJECTED_WINDOW_DAYS * DAY_MS);
      return {
        status: 'rechazada',
        OR: [{ sent_at: { gte: since } }, { sent_at: null, updated_at: { gte: since } }],
      };
    }
    case 'authorized':
      return { status: 'autorizada', authorized_at: { gte: argentinaMonthStart(now) } };
  }
}
