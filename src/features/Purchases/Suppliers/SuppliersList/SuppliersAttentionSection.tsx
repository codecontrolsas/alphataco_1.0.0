import { Suspense } from 'react';
import type { getSuppliersAttention } from './actions.server';
import { SuppliersAttention } from './components/SuppliersAttention';

async function Attention({ attention }: { attention: ReturnType<typeof getSuppliersAttention> }) {
  return <SuppliersAttention initialData={await attention} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getSuppliersAttention` nunca rechaza (devuelve `null` si falla).
 */
export function SuppliersAttentionSection({ attention }: { attention: ReturnType<typeof getSuppliersAttention> }) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} />
    </Suspense>
  );
}
