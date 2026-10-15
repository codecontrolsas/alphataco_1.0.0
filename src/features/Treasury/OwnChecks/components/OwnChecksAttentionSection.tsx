import moment from 'moment';
import { Suspense } from 'react';
import type { getOwnChecksHeader } from '../../actions/own-checks.server';
import { AttentionSkeleton } from '../../components/AttentionSkeleton';
import { HeaderLoadError } from '../../components/HeaderLoadError';
import { TreasuryAttentionBanner } from '../../components/TreasuryAttentionBanner';
import { treasuryToday } from '../../lib/today';
import { DEFAULT_STATUS_FILTER } from '../OwnChecksList/constants';
import { OwnChecksHeaderCards } from './OwnChecksHeaderCards';

type Header = Awaited<ReturnType<typeof getOwnChecksHeader>>;

async function Attention({
  tableId,
  header,
  pendingCount,
}: {
  tableId: string;
  header: Promise<Header | null>;
  pendingCount: Promise<number | null>;
}) {
  const [data, count] = await Promise.all([header, pendingCount]);
  // Mismo corte que el contador (`payment_date < hoy`): en la tabla es "fecha de pago hasta ayer".
  const yesterday = moment.utc(treasuryToday(), 'YYYY-MM-DD', true).subtract(1, 'day').format('YYYY-MM-DD');

  return (
    <div className="space-y-4">
      <TreasuryAttentionBanner
        tableId={tableId}
        tone="warn"
        title={
          count && count > 0
            ? `${count.toLocaleString('es-AR')} ${count === 1 ? 'débito pendiente' : 'débitos pendientes'} de confirmar`
            : null
        }
        description="Cheques emitidos cuya fecha de pago ya pasó: confirmá el débito del banco o registrá el rechazo."
        filters={{ status: DEFAULT_STATUS_FILTER, payment_date_from: null, payment_date_to: yesterday }}
        buttonLabel="Ver pendientes en la tabla"
      />
      {data ? <OwnChecksHeaderCards header={data} /> : <HeaderLoadError what="el resumen de cheques emitidos" />}
    </div>
  );
}

/** Server Component: encabezado y banda en su propio Suspense; las promesas se inician antes de la tabla y nunca rechazan. */
export function OwnChecksAttentionSection(props: {
  tableId: string;
  header: Promise<Header | null>;
  pendingCount: Promise<number | null>;
}) {
  return (
    <Suspense fallback={<AttentionSkeleton />}>
      <Attention {...props} />
    </Suspense>
  );
}
