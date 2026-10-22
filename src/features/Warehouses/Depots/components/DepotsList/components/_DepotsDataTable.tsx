'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { User } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { getAllDepotsForExport, getDepotSingleFacet, getDepotsPaginated, type DepotListItem } from '../actions.server';
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

const facets = createFacetFilters(getDepotSingleFacet);

export function _DepotsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDepotsPaginated(params), []);

  const canUpdate = permissionsMap['almacenes:depositos:update'] === true;
  const canDelete = permissionsMap['almacenes:depositos:delete'] === true;
  const columns = useMemo(() => getColumns({ canUpdate, canDelete }), [canUpdate, canDelete]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('is_active', 'Estado', [
        { value: 'true', label: 'Activo', icon: activeIcons.true },
        { value: 'false', label: 'Inactivo', icon: activeIcons.false },
      ]),
      // Cada opcion es un empleado: mismo icono de recurso (User).
      facets.lookup('manager', 'Responsable', User, { label: 'Sin asignar' }),
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

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<DepotListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllDepotsForExport(currentParams)),
      options: { filename: 'depositos', title: 'Listado de Depósitos', sheetName: 'Depósitos' },
      formatters: {
        is_active: (value) => (value ? 'Activo' : 'Inactivo'),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
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
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...WAREHOUSE_QUERY_KEYS.depots]}
      searchPlaceholder="Buscar por código, nombre o dirección"
      emptyMessage="No hay depósitos cargados"
      exportConfig={exportConfig}
      data-testid="warehouse-depots-table"
    />
  );
}
