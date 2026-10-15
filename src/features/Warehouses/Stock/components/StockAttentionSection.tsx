import { Suspense } from 'react';
import type { getStockAttention } from './StockList/actions.server';
import { StockAttention } from './StockAttention';

async function Attention({ attention }: { attention: ReturnType<typeof getStockAttention> }) {
  return <StockAttention initialData={await attention} />;
}

/**
 * Server Component: resuelve la banda y las tarjetas en su propio Suspense sin frenar la tabla. La promesa
 * se inicia en la lista ANTES de esperar la tabla; `getStockAttention` nunca rechaza (devuelve `null`).
 */
export function StockAttentionSection({ attention }: { attention: ReturnType<typeof getStockAttention> }) {
  return (
    <Suspense fallback={<div className="bg-muted/50 h-24 animate-pulse rounded-xl" aria-hidden="true" />}>
      <Attention attention={attention} />
    </Suspense>
  );
}
