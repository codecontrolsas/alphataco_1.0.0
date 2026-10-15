import { MetricCard } from '@/shared/components/common/MetricCard';
import type { ReceivablesSummary } from '../../actions/customer-statement.server';
import { formatInCurrency } from '../../lib/currency-format';

/** Lo vencido y lo que vence en 30 días, por moneda (sin convertir). */
export function ReceivablesSummaryCards({ summary }: { summary: ReceivablesSummary }) {
  if (summary.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay comprobantes pendientes de cobro.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summary.map((s) => (
        <MetricCard
          key={s.currency}
          label={`A cobrar en ${s.currency === 'ARS' ? 'pesos' : s.currency}`}
          value={formatInCurrency(s.total, s.currency)}
          hint={`${s.count} ${s.count === 1 ? 'comprobante' : 'comprobantes'} · Vencido ${formatInCurrency(s.overdue, s.currency)} · Vence en 30 días ${formatInCurrency(s.dueSoon, s.currency)}`}
          tone={s.overdue !== '0.00' ? 'danger' : 'default'}
        />
      ))}
    </div>
  );
}
