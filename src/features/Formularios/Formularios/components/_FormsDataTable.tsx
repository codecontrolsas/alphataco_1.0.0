'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formSourceLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleOff, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllFormsForExport,
  getFormsPaginated,
  getFormsSingleFacet,
  getFormsUnionCoverage,
  type FormListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formSourceIcons, getColumns } from '../columns';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: FormListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'source', 'created_at'];

const SOURCES = ['checklist_template', 'custom_form'] as const;

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

// ─── fetchFacet lazy por columna (estables: viven fuera del componente) ───────
async function fetchIsActiveFacet(params: DataTableSearchParams): Promise<FacetResult> {
  const result = await getFormsSingleFacet('is_active', params);
  if (!result) return EMPTY_FACET;
  return {
    options: [
      { value: 'true', label: 'Activo', icon: CheckCircle2 },
      { value: 'false', label: 'Inactivo', icon: XCircle },
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
        : []),
    ],
    counts: result.counts,
  };
}

async function fetchSourceFacet(params: DataTableSearchParams): Promise<FacetResult> {
  const result = await getFormsSingleFacet('source', params);
  if (!result) return EMPTY_FACET;
  return {
    options: SOURCES.map((value) => ({ value, label: formSourceLabels[value], icon: formSourceIcons[value] })),
    counts: result.counts,
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _FormsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // Helper de permisos desde el map serializable del servidor (sin re-fetch en el cliente)
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  // Client-side mode: filtros, orden y paginación sin re-renderizar la página
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getFormsPaginated(params), []);

  // La unión de las dos fuentes se arma en memoria con tope por fuente: si los filtros dejan más filas que
  // el tope, se avisa con el conteo real en vez de truncar en silencio.
  const { data: coverage } = useQuery({
    queryKey: ['forms-list', 'coverage', currentParams],
    queryFn: () => getFormsUnionCoverage(currentParams),
    staleTime: 30 * 1000,
  });
  const isTruncated = coverage != null && coverage.shown < coverage.total;

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'is_active', title: 'Estado', fetchFacet: fetchIsActiveFacet },
      { columnId: 'source', title: 'Tipo', fetchFacet: fetchSourceFacet },
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Filtrar por nombre...' },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Filtrar por descripción...',
      },
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Filtrar por código...' },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    []
  );

  // Filtros visibles por defecto — máximo 3 (las preferencias guardadas tienen prioridad)
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const columns = useMemo(() => getColumns(permissions), [permissions]);

  const exportConfig: DataTableExportConfig<FormListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllFormsForExport(currentParams)),
      options: {
        filename: 'formularios',
        title: 'Listado de Formularios',
        sheetName: 'Formularios',
      },
      formatters: {
        is_active: (val) => (val == null ? 'Sin asignar' : val ? 'Activo' : 'Inactivo'),
        source: (val) => formSourceLabels[val as string] ?? String(val ?? ''),
        created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
        total_responses: (val) => String(val ?? 0),
        code: (val) => String(val ?? ''),
        description: (val) => String(val ?? ''),
      },
    }),
    [currentParams]
  );

  return (
    <div className="space-y-3">
      <p
        role="status"
        className={
          isTruncated
            ? 'text-warn-subtle-foreground bg-warn-subtle border-warn/35 rounded-lg border px-3 py-2 text-sm'
            : 'sr-only'
        }
      >
        {isTruncated && coverage
          ? `Se listan los ${coverage.shown.toLocaleString('es-AR')} formularios más recientes de ${coverage.total.toLocaleString('es-AR')}. La búsqueda y los filtros acotan el resto.`
          : ''}
      </p>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={['forms-list']}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar formularios por nombre, descripción o código..."
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        tableId={tableId}
        paramNamespace={tableId}
        showFilterToggle={true}
        emptyMessage="No hay formularios registrados"
        data-testid="forms-table"
        exportConfig={exportConfig}
      />
    </div>
  );
}
