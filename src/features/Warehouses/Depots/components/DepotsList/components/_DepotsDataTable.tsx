'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff, User } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import {
  getAllDepotsForExport,
  getDepotSingleFacet,
  getDepotsPaginated,
  type DepotListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, activeIcons, getColumns } from '../columns';

interface Props {
  data: DepotListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'manager', 'name'];
const ALL_FILTER_IDS = ['is_active', 'manager', 'fileNumber', 'code', 'name', 'address', 'created_at'];

export function _DepotsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDepotsPaginated(params), []);

  const canUpdate = permissionsMap['almacenes:depositos:update'] === true;
  const canDelete = permissionsMap['almacenes:depositos:delete'] === true;
  const columns = useMemo(() => getColumns({ canUpdate, canDelete }), [canUpdate, canDelete]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getDepotSingleFacet('is_active', params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: [
              { value: 'true', label: 'Activo', icon: activeIcons.true },
              { value: 'false', label: 'Inactivo', icon: activeIcons.false },
            ],
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'manager',
        title: 'Responsable',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getDepotSingleFacet('manager', params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: [
              // Cada opcion es un empleado: mismo icono de recurso (User).
              ...(result.resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', icon: User })) ?? []),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'fileNumber',
        title: 'Legajo responsable',
        type: 'text' as const,
        // DataTableFacetedFilterConfig no soporta tooltip/exactMatch: el placeholder avisa que es exacto.
        placeholder: 'Legajo exacto (numero completo)...',
      },
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      { columnId: 'address', title: 'Dirección', type: 'text' as const, placeholder: 'Buscar por dirección...' },
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
    ],
    []
  );

  const exportConfig: DataTableExportConfig<DepotListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllDepotsForExport(currentParams),
      options: { filename: 'depositos', title: 'Listado de Depósitos', sheetName: 'Depósitos' },
      formatters: {
        is_active: (value) => (value ? 'Activo' : 'Inactivo'),
        created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : ''),
        address: (value) => (value ? String(value) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...WAREHOUSE_QUERY_KEYS.depots]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por código, nombre o dirección"
      emptyMessage="No hay depósitos cargados"
      exportConfig={exportConfig}
      data-testid="warehouse-depots-table"
    />
  );
}
