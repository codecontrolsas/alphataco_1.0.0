import { Suspense } from 'react';
import type { getPaymentOrdersAttention } from './actions.server';
import { PaymentOrdersAttention } from './components/PaymentOrdersAttention';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getPaymentOrdersAttention>;
  serverStatus: string | null;
}) {
  return <PaymentOrdersAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve las bandas en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getPaymentOrdersAttention` nunca rechaza (devuelve `null` si falla).
 */
export function PaymentOrdersAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getPaymentOrdersAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
