import { AMOUNT_SCALE, amountOf, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

export type StatementRow = { id: string; date: string; amount: string; cancelled: boolean };

/** Agrega el saldo acumulado; los anulados no suman y llevan el saldo de la fila anterior. */
export function withRunningBalance<T extends StatementRow>(
  previous: string,
  rows: T[]
): { rows: (T & { balance: string })[]; closing: string } {
  let running = amountOf(previous);
  const withBalance = rows.map((row) => {
    if (!row.cancelled) running += amountOf(row.amount);
    return { ...row, balance: formatScaled(running, AMOUNT_SCALE) };
  });
  return { rows: withBalance, closing: formatScaled(running, AMOUNT_SCALE) };
}

export type AccountIndicators = { balance: string; toDebit: string; toCredit: string; projected: string };

/** Proyectado = saldo + a debitar (negativo) + a acreditar. */
export function indicatorsFromBuckets(b: { balance: string; toDebit: string; toCredit: string }): AccountIndicators {
  const projected = amountOf(b.balance) + amountOf(b.toDebit) + amountOf(b.toCredit);
  return { ...b, projected: formatScaled(projected, AMOUNT_SCALE) };
}
