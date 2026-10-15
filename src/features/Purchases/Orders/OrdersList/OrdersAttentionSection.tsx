import { Suspense } from 'react';
import type { getPurchaseOrdersAttention } from './actions.server';
import { OrdersAttention } from './components/OrdersAttention';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getPurchaseOrdersAttention>;
  serverStatus: string | null;
}) {
  return <OrdersAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve las bandas en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getPurchaseOrdersAttention` nunca rechaza (devuelve `null` si falla).
 */
export function OrdersAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getPurchaseOrdersAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
