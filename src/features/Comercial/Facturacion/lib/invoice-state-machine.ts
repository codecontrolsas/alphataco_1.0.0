import type { invoice_status } from '@/generated/prisma/enums';

/**
 * Estados de un comprobante.
 *
 * ```
 * borrador ──emitir──> emitiendo ──ARCA aprueba──> autorizada   (final)
 *    ▲                    │
 *    │                    ├──ARCA rechaza──> rechazada ──editar/emitir de nuevo──┐
 *    │                    │                                                       │
 *    │                    └──sin respuesta──> pendiente ──consultar en ARCA──> autorizada
 *    └──────────────── (si ARCA confirma que no lo autorizó) ◄──────────────────┘
 * ```
 *
 * - Una autorizada tiene validez fiscal: no se modifica ni se borra (lo garantiza además un
 *   trigger en la base). Se contrarresta con una nota de crédito.
 * - `pendiente` NUNCA se reintenta a ciegas: puede estar autorizada en ARCA. Se consulta.
 * - Un `emitiendo` huérfano (el proceso murió) se trata como `pendiente`.
 */

export const INVOICE_STATUS_LABELS: Record<invoice_status, string> = {
  borrador: 'Borrador',
  emitiendo: 'Emitiendo',
  pendiente: 'Pendiente en ARCA',
  rechazada: 'Rechazada',
  autorizada: 'Autorizada',
};

/** Se edita y se emite: el borrador y el rechazado (ARCA no consumió el número). */
export function isEditable(status: invoice_status): boolean {
  return status === 'borrador' || status === 'rechazada';
}

export function isDeletable(status: invoice_status): boolean {
  return status === 'borrador' || status === 'rechazada';
}

export function canIssue(status: invoice_status): boolean {
  return status === 'borrador' || status === 'rechazada';
}

/**
 * Un `emitiendo` sin novedades después de este tiempo se considera abandonado (el proceso murió).
 * Se mide desde el envío a ARCA (o el reclamo) y supera el peor caso de una emisión en curso:
 * lease (20 s) + ticket WSAA (45 s) + consultas con reintentos (45 s) + CAE (45 s).
 */
export const STALE_EMITTING_MS = 6 * 60 * 1000;
