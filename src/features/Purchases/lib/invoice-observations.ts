import type { Prisma } from '@/generated/prisma/client';
import type { InvoiceObservation } from './invoice-control';

export function parseObservations(value: Prisma.JsonValue): InvoiceObservation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { code, message, lineId } = item as Record<string, unknown>;
    if (typeof code !== 'string' || typeof message !== 'string') return [];
    return [{ code: code as InvoiceObservation['code'], message, ...(typeof lineId === 'string' ? { lineId } : {}) }];
  });
}
