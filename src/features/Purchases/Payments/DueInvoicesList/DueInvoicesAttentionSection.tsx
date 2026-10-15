import { Suspense } from 'react';
import type { getDueInvoicesAttention } from './actions.server';
import { DueInvoicesAttention } from './components/DueInvoicesAttention';

async function Attention({
  attention,
  serverDays,
}: {
  attention: ReturnType<typeof getDueInvoicesAttention>;
  serverDays: string | null;
}) {
  return <DueInvoicesAttention initialData={await attention} serverDays={serverDays} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getDueInvoicesAttention` nunca rechaza (devuelve `null` si falla).
 */
export function DueInvoicesAttentionSection({
  attention,
  serverDays = null,
}: {
  attention: ReturnType<typeof getDueInvoicesAttention>;
  serverDays?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverDays={serverDays} />
    </Suspense>
  );
}
