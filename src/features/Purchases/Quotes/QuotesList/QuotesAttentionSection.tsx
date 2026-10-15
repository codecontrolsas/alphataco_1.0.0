import { Suspense } from 'react';
import type { getPurchaseQuotesAttention } from './actions.server';
import { QuotesAttention } from './components/QuotesAttention';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getPurchaseQuotesAttention>;
  serverStatus: string | null;
}) {
  return <QuotesAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getPurchaseQuotesAttention` nunca rechaza (devuelve `null` si falla).
 */
export function QuotesAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getPurchaseQuotesAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
