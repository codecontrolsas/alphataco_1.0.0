import { Suspense } from 'react';
import type { ReceivablesSummary } from '../../actions/customer-statement.server';
import { AttentionSkeleton } from '../../components/AttentionSkeleton';
import { HeaderLoadError } from '../../components/HeaderLoadError';
import { TreasuryAttentionBanner } from '../../components/TreasuryAttentionBanner';
import { ReceivablesSummaryCards } from './ReceivablesSummaryCards';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`;

async function Attention({
  tableId,
  summary,
  overdueCount,
}: {
  tableId: string;
  summary: Promise<ReceivablesSummary | null>;
  overdueCount: Promise<number | null>;
}) {
  const [data, count] = await Promise.all([summary, overdueCount]);
  return (
    <div className="space-y-4">
      <TreasuryAttentionBanner
        tableId={tableId}
        tone="danger"
        title={count && count > 0 ? `${plural(count, 'cobro vencido', 'cobros vencidos')}` : null}
        description="Comprobantes con el vencimiento cumplido y deudas por cheques rechazados."
        filters={{ state: 'OVERDUE' }}
        buttonLabel="Ver vencidos en la tabla"
      />
      {data ? <ReceivablesSummaryCards summary={data} /> : <HeaderLoadError what="el resumen de cobranzas" />}
    </div>
  );
}

/**
 * Server Component: banda de vencidos y tarjetas por moneda en su propio Suspense. Las promesas se
 * inician en la tab ANTES de esperar la tabla y nunca rechazan (`null` = no se pudo calcular).
 */
export function ReceivablesAttentionSection(props: {
  tableId: string;
  summary: Promise<ReceivablesSummary | null>;
  overdueCount: Promise<number | null>;
}) {
  return (
    <Suspense fallback={<AttentionSkeleton />}>
      <Attention {...props} />
    </Suspense>
  );
}
