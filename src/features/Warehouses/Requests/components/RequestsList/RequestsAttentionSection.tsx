import { Suspense } from 'react';
import type { getRequestsAttention } from './actions.server';
import { RequestsAttention } from './components/RequestsAttention';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getRequestsAttention>;
  serverStatus: string | null;
}) {
  return <RequestsAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getRequestsAttention` nunca rechaza (devuelve `null` si falla).
 */
export function RequestsAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getRequestsAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
