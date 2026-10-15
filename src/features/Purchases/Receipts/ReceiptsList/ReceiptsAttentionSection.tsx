import { Suspense } from 'react';
import type { getPurchaseReceiptsAttention } from './actions.server';
import { ReceiptsAttention } from './components/ReceiptsAttention';

async function Attention({ attention }: { attention: ReturnType<typeof getPurchaseReceiptsAttention> }) {
  return <ReceiptsAttention initialData={await attention} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getPurchaseReceiptsAttention` nunca rechaza (devuelve `null` si falla).
 */
export function ReceiptsAttentionSection({ attention }: { attention: ReturnType<typeof getPurchaseReceiptsAttention> }) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} />
    </Suspense>
  );
}
