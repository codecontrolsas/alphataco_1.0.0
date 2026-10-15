import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import { getTireStatusCounts, getTiresPaginated } from './actions/tire-list.server';
import { CatalogoViewSwitch } from './components/CatalogoViewSwitch';
import { TireStatusMetricsSection } from './components/TireStatusMetricsSection';
import _TiresDataTable from './components/_TiresDataTable';
import { TireStatusMetricsSkeleton } from './fallback/TireStatusMetricsSkeleton';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Clave de las preferencias guardadas (columnas y filtros visibles). `-v2`: el diseño nuevo parte de cero. */
const TABLE_ID = 'tires-catalog-v2';
/** Prefijo de los params de la URL: no cambia con el rediseño para que los enlaces guardados sigan abriendo. */
const PARAM_NAMESPACE = 'tires-catalog';

// ============================================================================
// TYPES
// ============================================================================

interface TiresListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function TiresList({ searchParams, permissionsMap }: TiresListProps) {
  // Extract only the params for this table (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, PARAM_NAMESPACE);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const counts = getTireStatusCounts();

  // Facets are loaded lazy (on-demand when each popover opens) — not in SSR
  const [{ data, total }, preferences] = await Promise.all([
    getTiresPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      {/* Las tarjetas llegan por su propio Suspense; si fallan, el error queda acotado a ellas y la tabla sigue. */}
      <SectionErrorBoundary title="No se pudieron cargar los totales por estado">
        <Suspense fallback={<TireStatusMetricsSkeleton />}>
          <TireStatusMetricsSection paramNamespace={PARAM_NAMESPACE} counts={counts} />
        </Suspense>
      </SectionErrorBoundary>

      <CatalogoViewSwitch paramNamespace={PARAM_NAMESPACE}>
        <Card>
          <CardContent className="pt-6">
            <_TiresDataTable
              data={data}
              totalRows={total}
              searchParams={tableParams}
              tableId={TABLE_ID}
              paramNamespace={PARAM_NAMESPACE}
              permissionsMap={permissionsMap}
              initialColumnVisibility={preferences.columnVisibility ?? {}}
              initialFilterVisibility={preferences.filterVisibility ?? {}}
            />
          </CardContent>
        </Card>
      </CatalogoViewSwitch>
    </div>
  );
}
