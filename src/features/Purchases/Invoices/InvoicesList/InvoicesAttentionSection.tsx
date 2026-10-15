import { Suspense } from 'react';
import type { getSupplierInvoicesAttention } from './actions.server';
import { InvoicesAttention } from './components/InvoicesAttention';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getSupplierInvoicesAttention>;
  serverStatus: string | null;
}) {
  return <InvoicesAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getSupplierInvoicesAttention` nunca rechaza (devuelve `null` si falla).
 */
export function InvoicesAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getSupplierInvoicesAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
