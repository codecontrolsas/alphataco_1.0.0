import { formatMoney } from '@/features/Warehouses/lib/format';
import moment from 'moment';
import type { BalanceAfter } from '../hooks/useBalanceAfter';

/** "Saldo de «Caja» al 10/10/2026: $ 5.000,00 → queda $ −1.000,00" (en rojo si es negativo). */
export function BalancePreview({ accountName, date, preview }: { accountName: string; date: string; preview: BalanceAfter }) {
  if (preview.loading && preview.before === null) {
    return <p className="text-sm text-muted-foreground">Calculando el saldo de «{accountName}»…</p>;
  }
  if (preview.before === null) return null;
  const day = moment(date, 'YYYY-MM-DD').format('DD/MM/YYYY');
  const negative = preview.after?.startsWith('-') ?? false;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      Saldo de «{accountName}» al {day}: <span className="tabular-nums">{formatMoney(preview.before)}</span>
      {preview.after !== null && (
        <>
          {' → queda '}
          <span className={negative ? 'font-medium tabular-nums text-red-600 dark:text-red-400' : 'font-medium tabular-nums'}>
            {formatMoney(preview.after)}
          </span>
        </>
      )}
    </p>
  );
}
