import { MetricCard } from '@/shared/components/common/MetricCard';
import type { getChecksHeader } from '../../actions/check-reads.server';
import { formatInCurrency } from '../../lib/currency-format';
import { DEPOSIT_WINDOW_DAYS, DUE_SOON_DAYS } from '../../lib/checks-dates';

type ChecksHeader = NonNullable<Awaited<ReturnType<typeof getChecksHeader>>>;

/** Encabezado de la tab Cheques: total en cartera por cartera y los avisos de plazo para depositar. */
export function ChecksHeaderCards({ header }: { header: ChecksHeader }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {header.portfolios.map((p) => (
        <MetricCard
          key={p.id}
          label={p.name}
          value={formatInCurrency(p.total, 'ARS')}
          hint={`${p.count} ${p.count === 1 ? 'cheque' : 'cheques'} en cartera`}
        />
      ))}
      <MetricCard
        label="Por vencer"
        value={header.dueSoon.toLocaleString('es-AR')}
        hint={`Vencen en ${DUE_SOON_DAYS} días o menos para depositar`}
        tone={header.dueSoon > 0 ? 'warn' : 'default'}
      />
      <MetricCard
        label="Vencidos para depositar"
        value={header.expired.toLocaleString('es-AR')}
        hint={`Pasaron los ${DEPOSIT_WINDOW_DAYS} días desde la fecha de pago`}
        tone={header.expired > 0 ? 'danger' : 'default'}
      />
    </div>
  );
}
