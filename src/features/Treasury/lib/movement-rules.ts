import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

/** Sentido de un movimiento manual: ingreso o egreso. */
export type MovementDirection = 'IN' | 'OUT';
export type ConceptDirection = 'IN' | 'OUT' | 'BOTH';
export type PaymentMethodKind = 'TRANSFER' | 'CHECK' | 'ECHECK' | 'CASH';

/** Importe con signo en centavos: positivo entra, negativo sale. `amount` es el texto del form (> 0). */
export function signedCents(direction: MovementDirection, amount: string): bigint {
  const cents = parseScaled(amount, AMOUNT_SCALE);
  if (cents === null || cents <= BigInt(0)) throw new Error(`Importe inválido: ${amount}`);
  return direction === 'IN' ? cents : -cents;
}

/** El concepto admite el sentido. */
export function conceptAllows(conceptDirection: ConceptDirection, direction: MovementDirection): boolean {
  return conceptDirection === 'BOTH' || conceptDirection === direction;
}

/**
 * Fecha valor del movimiento de un medio de pago de Compras: los cheques y e-cheqs debitan en su
 * fecha de pago; la transferencia y el efectivo, en la fecha de pago de la orden.
 */
export function paymentMovementDate(method: PaymentMethodKind, paidOn: string, checkDueOn: string | null): string {
  if (method === 'CHECK' || method === 'ECHECK') {
    if (!checkDueOn) throw new Error('El cheque no tiene fecha de pago');
    return checkDueOn;
  }
  return paidOn;
}

/** Futuro (a debitar / a acreditar) o no (cuenta en el saldo). `date` y `today` en YYYY-MM-DD. */
export function isFuture(date: string, today: string): boolean {
  return date > today;
}
