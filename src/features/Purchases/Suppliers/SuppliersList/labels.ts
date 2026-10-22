import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';

/**
 * Estado de la documentacion de un proveedor, derivado de sus documentos VIGENTES
 * (`replaced_by_id IS NULL`). Sin directiva de servidor/cliente: lo usan la action y la tabla.
 */
export const SUPPLIER_DOCUMENT_STATES = ['EXPIRED', 'EXPIRING', 'OK', 'NONE'] as const;

export type SupplierDocumentState = (typeof SUPPLIER_DOCUMENT_STATES)[number];

export const SUPPLIER_DOCUMENT_STATE_LABELS: Record<SupplierDocumentState, string> = {
  EXPIRED: 'Vencido',
  EXPIRING: 'Por vencer',
  OK: 'Al día',
  NONE: 'Sin documentos',
};

/** Dias de anticipacion con que un documento pasa a "Por vencer". */
export const SUPPLIER_DOCUMENT_EXPIRING_DAYS = 30;

/** Hoy y el limite de "Por vencer" como `YYYY-MM-DD`, en hora argentina. */
export function supplierDocumentDates(): { today: string; soon: string } {
  const today = argentinaDate();
  const soon = moment.utc(today).add(SUPPLIER_DOCUMENT_EXPIRING_DAYS, 'days').format('YYYY-MM-DD');
  return { today, soon };
}

/** Vencido si alguno vencio, por vencer si alguno vence dentro de la ventana, al dia si hay documentos. */
export function deriveSupplierDocumentState(
  docs: { expires_at: Date | null }[],
  dates: { today: string; soon: string }
): { state: SupplierDocumentState; nextExpiry: string | null } {
  if (docs.length === 0) return { state: 'NONE', nextExpiry: null };

  const expiries = docs
    .map((d) => (d.expires_at ? moment.utc(d.expires_at).format('YYYY-MM-DD') : null))
    .filter((d): d is string => d != null)
    .sort();
  const nextExpiry = expiries[0] ?? null;

  if (expiries.some((d) => d < dates.today)) return { state: 'EXPIRED', nextExpiry };
  if (expiries.some((d) => d <= dates.soon)) return { state: 'EXPIRING', nextExpiry };
  return { state: 'OK', nextExpiry };
}
