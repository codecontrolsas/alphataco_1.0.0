import { cn } from '@/lib/utils';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import Link from 'next/link';

export const PAYMENTS_VIEWS = ['vencimientos', 'ordenes'] as const;
export type PaymentsView = (typeof PAYMENTS_VIEWS)[number];

const VIEW_LABELS: Record<PaymentsView, string> = {
  vencimientos: 'Vencimientos',
  ordenes: 'Órdenes de pago',
};

/** Parámetro de URL de la vista activa. Es un parámetro propio: no lleva el prefijo de ninguna tabla. */
export const PAYMENTS_VIEW_PARAM = 'vista';

/** Vista pedida en la URL; cualquier valor ajeno cae en la de vencimientos. */
export function resolvePaymentsView(searchParams: DataTableSearchParams): PaymentsView {
  const raw = searchParams[PAYMENTS_VIEW_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PAYMENTS_VIEWS.find((view) => view === value) ?? 'vencimientos';
}

/** Query con TODOS los parámetros actuales (sección, filtros de cada tabla) y la vista pedida. */
function hrefForView(searchParams: DataTableSearchParams, view: PaymentsView): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === PAYMENTS_VIEW_PARAM || value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  params.set(PAYMENTS_VIEW_PARAM, view);
  return `?${params.toString()}`;
}

/**
 * Control de vista de Pagos: links (la vista queda en la URL, se comparte y funciona con el botón Atrás).
 * Solo se renderiza y consulta la vista activa.
 */
export function PaymentsViewNav({ searchParams, active }: { searchParams: DataTableSearchParams; active: PaymentsView }) {
  return (
    <nav aria-label="Vista de pagos" className="inline-flex rounded-lg bg-muted p-1">
      {PAYMENTS_VIEWS.map((view) => {
        const isActive = view === active;
        return (
          <Link
            key={view}
            href={hrefForView(searchParams, view)}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {VIEW_LABELS[view]}
          </Link>
        );
      })}
    </nav>
  );
}
