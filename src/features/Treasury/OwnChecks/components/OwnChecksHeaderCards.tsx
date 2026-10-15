import { MetricCard } from '@/shared/components/common/MetricCard';
import type { getOwnChecksHeader } from '../../actions/own-checks.server';
import { formatInCurrency } from '../../lib/currency-format';

type OwnChecksHeader = NonNullable<Awaited<ReturnType<typeof getOwnChecksHeader>>>;

/** Encabezado de la tab Cheques propios: lo emitido sin debitar por cuenta y los pendientes de confirmar. */
export function OwnChecksHeaderCards({ header }: { header: OwnChecksHeader }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {header.issued.map((a) => (
        <MetricCard
          key={a.accountId}
          label={a.name}
          value={formatInCurrency(a.total, 'ARS')}
          hint={`${a.count} ${a.count === 1 ? 'cheque emitido' : 'cheques emitidos'} sin debitar`}
        />
      ))}
      <MetricCard
        label="Débitos por confirmar"
        value={header.pendingConfirmation.toLocaleString('es-AR')}
        hint="Fecha de pago vencida, sin débito confirmado"
        tone={header.pendingConfirmation > 0 ? 'warn' : 'default'}
      />
    </div>
  );
}
