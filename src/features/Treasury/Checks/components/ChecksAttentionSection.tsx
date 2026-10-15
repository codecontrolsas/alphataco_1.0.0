import { Suspense } from 'react';
import type { getChecksHeader } from '../../actions/check-reads.server';
import { AttentionSkeleton } from '../../components/AttentionSkeleton';
import { HeaderLoadError } from '../../components/HeaderLoadError';
import { TreasuryAttentionBanner } from '../../components/TreasuryAttentionBanner';
import { depositDeadline, depositWarningCutoffs } from '../../lib/checks-dates';
import { treasuryToday } from '../../lib/today';
import { DEFAULT_STATUS_FILTER } from '../ChecksList/constants';
import { ChecksHeaderCards } from './ChecksHeaderCards';

type Header = Awaited<ReturnType<typeof getChecksHeader>>;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`;

async function Attention({
  tableId,
  header,
  warnedCount,
}: {
  tableId: string;
  header: Promise<Header | null>;
  warnedCount: Promise<number | null>;
}) {
  const [data, count] = await Promise.all([header, warnedCount]);
  // Mismo corte que el contador (`payment_date <= warnUntil`): en la tabla es "vence para depositar <= warnUntil + 30 días".
  const { warnUntil } = depositWarningCutoffs(treasuryToday());
  const deadlineTo = depositDeadline(warnUntil);

  return (
    <div className="space-y-4">
      <TreasuryAttentionBanner
        tableId={tableId}
        tone={data && data.expired > 0 ? 'danger' : 'warn'}
        title={count && count > 0 ? `${plural(count, 'cheque por vencer o vencido', 'cheques por vencer o vencidos')} para depositar` : null}
        description={
          data
            ? `${plural(data.expired, 'vencido', 'vencidos')} · ${plural(data.dueSoon, 'por vencer', 'por vencer')}. Solo avisa: no bloquea ninguna operación.`
            : 'Solo avisa: no bloquea ninguna operación.'
        }
        filters={{ status: DEFAULT_STATUS_FILTER, deposit_deadline_from: null, deposit_deadline_to: deadlineTo }}
        buttonLabel="Ver cheques en la tabla"
      />
      {data && data.portfolios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay una cartera de cheques. Creala en Tesorería → Configuración, con el tipo «Cartera de cheques».
        </p>
      ) : data ? (
        <ChecksHeaderCards header={data} />
      ) : (
        <HeaderLoadError what="el resumen de la cartera" />
      )}
    </div>
  );
}

/** Server Component: encabezado y banda en su propio Suspense; las promesas se inician antes de la tabla y nunca rechazan. */
export function ChecksAttentionSection(props: {
  tableId: string;
  header: Promise<Header | null>;
  warnedCount: Promise<number | null>;
}) {
  return (
    <Suspense fallback={<AttentionSkeleton />}>
      <Attention {...props} />
    </Suspense>
  );
}
