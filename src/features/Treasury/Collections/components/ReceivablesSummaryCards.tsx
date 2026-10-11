import { Card, CardContent } from '@/components/ui/card';
import type { ReceivablesSummary } from '../../actions/customer-statement.server';
import { formatInCurrency } from '../../lib/currency-format';

/** Lo vencido y lo que vence en 30 días, por moneda (sin convertir). */
export function ReceivablesSummaryCards({ summary }: { summary: ReceivablesSummary }) {
  if (summary.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay comprobantes pendientes de cobro.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {summary.map((s) => (
        <Card key={s.currency}>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              A cobrar en {s.currency === 'ARS' ? 'pesos' : s.currency} · {s.count} {s.count === 1 ? 'comprobante' : 'comprobantes'}
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatInCurrency(s.total, s.currency)}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span className={s.overdue !== '0.00' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                Vencido {formatInCurrency(s.overdue, s.currency)}
              </span>
              <span className="text-muted-foreground">Vence en 30 días {formatInCurrency(s.dueSoon, s.currency)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
