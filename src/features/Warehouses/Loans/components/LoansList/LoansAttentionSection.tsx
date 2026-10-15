import { Suspense } from 'react';
import { LoansAttention } from '../LoansAttention';
import type { getLoansAttention } from './actions.server';

async function Attention({ attention }: { attention: ReturnType<typeof getLoansAttention> }) {
  return <LoansAttention initialData={await attention} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getLoansAttention` nunca rechaza (devuelve `null`).
 */
export function LoansAttentionSection({ attention }: { attention: ReturnType<typeof getLoansAttention> }) {
  return (
    <Suspense fallback={<div className="bg-muted/50 h-16 animate-pulse rounded-xl" aria-hidden="true" />}>
      <Attention attention={attention} />
    </Suspense>
  );
}
