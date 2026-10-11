import { AMOUNT_SCALE, amountOf, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

/**
 * Cuenta corriente del cliente (spec Tesorería etapa 2 §3.6): por moneda y sin convertir. El
 * debe son las facturas, ND y anticipos aplicados; el haber, las NC, lo cobrado y lo cobrado a
 * cuenta. Saldo positivo = el cliente debe.
 */

export type CustomerStatementEntry = {
  id: string;
  date: string;
  currency: string;
  kind: 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'RECEIPT' | 'ADVANCE' | 'ADVANCE_APPLIED';
  label: string;
  href: string;
  debit: string;
  credit: string;
};

export type CustomerStatementCurrency = {
  currency: string;
  previous: string;
  rows: (CustomerStatementEntry & { balance: string })[];
  closing: string;
};

const money = (cents: bigint) => formatScaled(cents, AMOUNT_SCALE);

/** Agrupa por moneda (ARS primero), ordena por fecha e id y agrega el saldo acumulado. */
export function buildCustomerStatement(previous: Record<string, string>, entries: CustomerStatementEntry[]): CustomerStatementCurrency[] {
  const currencies = new Set<string>([...Object.keys(previous), ...entries.map((e) => e.currency)]);
  const ordered = [...currencies].sort((a, b) => (a === 'ARS' ? -1 : b === 'ARS' ? 1 : a.localeCompare(b)));
  return ordered.map((currency) => {
    const start = amountOf(previous[currency] ?? '0');
    let balance = start;
    const rows = entries
      .filter((e) => e.currency === currency)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
      .map((e) => {
        balance += amountOf(e.debit) - amountOf(e.credit);
        return { ...e, balance: money(balance) };
      });
    return { currency, previous: money(start), rows, closing: money(balance) };
  });
}
