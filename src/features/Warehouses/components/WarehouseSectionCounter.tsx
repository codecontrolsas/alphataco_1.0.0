import { getLoansSectionCount, getRequestsSectionCount, getStockSectionCount } from '../lib/section-counts';

type SectionCounterKey = 'stock' | 'requests' | 'loans';

const LOADERS: Record<SectionCounterKey, () => Promise<number | null>> = {
  stock: getStockSectionCount,
  requests: getRequestsSectionCount,
  loans: getLoansSectionCount,
};

/**
 * Contador de una sección en la sub-navegación. Se resuelve en su propio `<Suspense fallback={null}>`
 * y nunca lanza: si no se pudo calcular muestra "—".
 */
export async function WarehouseSectionCounter({ section, label }: { section: SectionCounterKey; label: string }) {
  let count: number | null = null;
  try {
    count = await LOADERS[section]();
  } catch {
    count = null;
  }

  return (
    <span
      className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums"
      aria-label={count === null ? `${label}: sin datos` : `${label}: ${count}`}
    >
      {count === null ? '—' : count.toLocaleString('es-AR')}
    </span>
  );
}
