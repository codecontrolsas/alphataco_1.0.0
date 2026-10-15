'use client';

import { condition_enum, status_type } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { conditionLabels, otherEquipmentStatusLabels } from '@/shared/utils/mappers';
import { useCallback, useMemo, useState } from 'react';
import { CustomersTableSkeleton } from '../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../hooks/useTablePreferences';
import { buildBooleanFacetResult, buildEnumFacetResult, buildFkFacetResult } from '../lib/facet-results';
import { customerTabKey } from '../lib/query-keys';
import { conditionIcons, documentStatusIcons } from '../lib/status-config';
import {
  getAllCustomerEquipmentForExport,
  getCustomerEquipmentPaginated,
  getCustomerEquipmentSingleFacet,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from './columns';

const TABLE_ID = 'customer-equipment';

/** Filtros visibles de entrada; el resto se activa con el toggle de filtros. */
const DEFAULT_VISIBLE_FILTERS = ['intern_number', 'domain', 'type'];

interface Props {
  customerId: string;
  /** Botón de afectación (ya protegido por permisos en el padre). */
  toolbarActions?: React.ReactNode;
}

/**
 * Equipos de la empresa afectados al cliente: paginados y filtrados en el servidor, acotados a la pivote
 * `contractor_equipment` de ESTE cliente.
 */
export function _CustomerEquipmentDataTable({ customerId, toolbarActions }: Props) {
  const preferences = useTablePreferences(TABLE_ID);
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getCustomerEquipmentPaginated(customerId, params),
    [customerId]
  );

  const fetchFkFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCustomerEquipmentSingleFacet(customerId, columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    [customerId]
  );

  const fetchConditionFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCustomerEquipmentSingleFacet(customerId, 'condition', params);
      if (!result) return { options: [], counts: new Map() };
      return buildEnumFacetResult(Object.values(condition_enum), conditionLabels, conditionIcons, result.counts);
    },
    [customerId]
  );

  const fetchStatusFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCustomerEquipmentSingleFacet(customerId, 'status', params);
      if (!result) return { options: [], counts: new Map() };
      return buildEnumFacetResult(
        Object.values(status_type),
        otherEquipmentStatusLabels,
        documentStatusIcons,
        result.counts
      );
    },
    [customerId]
  );

  const fetchActiveFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCustomerEquipmentSingleFacet(customerId, 'is_active', params);
      if (!result) return { options: [], counts: new Map() };
      return buildBooleanFacetResult(result.counts, 'Activo', 'Dado de baja');
    },
    [customerId]
  );

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'intern_number', title: 'Número interno', type: 'text', placeholder: 'Buscar por número interno...' },
      { columnId: 'domain', title: 'Dominio', type: 'text', placeholder: 'Buscar por dominio...' },
      { columnId: 'type', title: 'Tipo', fetchFacet: fetchFkFacet('type') },
      { columnId: 'brand', title: 'Marca', fetchFacet: fetchFkFacet('brand') },
      { columnId: 'model', title: 'Modelo', fetchFacet: fetchFkFacet('model') },
      { columnId: 'year', title: 'Año', type: 'text', placeholder: 'Buscar por año...' },
      { columnId: 'condition', title: 'Condición', fetchFacet: fetchConditionFacet },
      { columnId: 'status', title: 'Estado documental', fetchFacet: fetchStatusFacet },
      { columnId: 'is_active', title: 'Situación', fetchFacet: fetchActiveFacet },
      { columnId: 'affected_since', title: 'Afectado desde', type: 'dateRange' },
    ],
    [fetchActiveFacet, fetchConditionFacet, fetchFkFacet, fetchStatusFacet]
  );

  const columnVisibility = useMemo(
    () => ({
      ...Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((id) => [id, false])),
      ...(preferences.data?.columnVisibility ?? {}),
    }),
    [preferences.data]
  );

  const filterVisibility = useMemo(() => {
    const saved = preferences.data?.filterVisibility ?? {};
    if (Object.keys(saved).length > 0) return saved;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [preferences.data, facetedFilters]);

  if (preferences.isPending) return <CustomersTableSkeleton />;

  return (
    <DataTable
      columns={columns}
      data={[]}
      totalRows={0}
      searchParams={{}}
      queryFn={tableQueryFn}
      queryKey={customerTabKey(customerId, 'equipment')}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número interno, dominio o año"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={columnVisibility}
      initialFilterVisibility={filterVisibility}
      tableId={TABLE_ID}
      paramNamespace={TABLE_ID}
      showFilterToggle
      toolbarActions={toolbarActions}
      rowClassName={(row) => (row.is_active === false ? 'opacity-60' : '')}
      emptyMessage="Este cliente no tiene equipos afectados"
      data-testid="customer-equipment-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllCustomerEquipmentForExport(customerId, currentParams)),
        options: { filename: 'equipos-cliente', title: 'Equipos afectados al cliente', sheetName: 'Equipos' },
        formatters: {
          condition: (value) => (value ? conditionLabels[value as string] ?? String(value) : ''),
          status: (value) => (value ? otherEquipmentStatusLabels[value as string] ?? String(value) : ''),
          is_active: (value) => (value === false ? 'Dado de baja' : 'Activo'),
          affected_since: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        },
      }}
    />
  );
}
