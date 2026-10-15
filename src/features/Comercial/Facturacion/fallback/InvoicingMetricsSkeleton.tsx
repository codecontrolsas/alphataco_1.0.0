import { Skeleton } from '@/components/ui/skeleton';

/** Tarjetas del tablero mientras se cuentan los comprobantes (misma grilla que `InvoicingMetrics`). */
export function InvoicingMetricsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Calculando resumen de comprobantes"
    >
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[124px] rounded-xl" />
      ))}
    </div>
  );
}
