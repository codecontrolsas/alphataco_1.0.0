'use client';

import { withDocumentStatusColumn, withDocumentStatusFacet } from '@/features/Modules/lib/document-status-visibility';
import { status_type } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { employeeStatusLabels } from '@/shared/utils/mappers';
import { useCallback, useMemo, useState } from 'react';
import { CustomersTableSkeleton } from '../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../hooks/useTablePreferences';
import { buildBooleanFacetResult, buildEnumFacetResult, buildFkFacetResult } from '../lib/facet-results';
import { customerTabKey } from '../lib/query-keys';
import { documentStatusIcons } from '../lib/status-config';
import {
  getAllCustomerEmployeesForExport,
  getCustomerEmployeeSingleFacet,
  getCustomerEmployeesPaginated,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, formatDbDate } from './columns';

const TABLE_ID = 'customer-employees';

/** Filtros visibles de entrada; el resto se activa con el toggle de filtros. */
const DEFAULT_VISIBLE_FILTERS = ['file', 'fullname', 'is_active'];

interface Props {
  customerId: string;
  /** Botón de afectación (ya protegido por permisos en el padre). */
  toolbarActions?: React.ReactNode;
  /** `documentacion` encendido: si no, se ocultan la columna y el filtro de estado documental (caché congelado). */
  showDocumentStatus?: boolean;
}

/**
 * Empleados afectados al cliente: paginados y filtrados en el servidor, acotados a la pivote
 * `contractor_employee` de ESTE cliente.
 */
export function _CustomerEmployeesDataTable({ customerId, toolbarActions, showDocumentStatus = true }: Props) {
  const visibleColumns = useMemo(() => withDocumentStatusColumn(columns, showDocumentStatus), [showDocumentStatus]);
  const preferences = useTablePreferences(TABLE_ID);
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getCustomerEmployeesPaginated(customerId, params),
    [customerId]
  );

  const fetchFkFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCustomerEmployeeSingleFacet(customerId, columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    [customerId]
  );

  const fetchStatusFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCustomerEmployeeSingleFacet(customerId, 'status', params);
      if (!result) return { options: [], counts: new Map() };
      return buildEnumFacetResult(Object.values(status_type), employeeStatusLabels, documentStatusIcons, result.counts);
    },
    [customerId]
  );

  const fetchActiveFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCustomerEmployeeSingleFacet(customerId, 'is_active', params);
      if (!result) return { options: [], counts: new Map() };
      return buildBooleanFacetResult(result.counts, 'Activo', 'Dado de baja');
    },
    [customerId]
  );

  const allFacetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'file', title: 'Legajo (exacto)', type: 'text', placeholder: 'Número de legajo completo' },
      {
        columnId: 'fullname',
        title: 'Apellido y nombre',
        type: 'text',
        placeholder: 'Buscar por apellido o nombre...',
      },
      { columnId: 'is_active', title: 'Situación', fetchFacet: fetchActiveFacet },
      { columnId: 'status', title: 'Estado documental', fetchFacet: fetchStatusFacet },
      { columnId: 'company_position', title: 'Puesto', fetchFacet: fetchFkFacet('company_position') },
      { columnId: 'hierarchical_position', title: 'Sector', fetchFacet: fetchFkFacet('hierarchical_position') },
      { columnId: 'type_of_contract', title: 'Tipo de contrato', fetchFacet: fetchFkFacet('type_of_contract') },
      { columnId: 'cuil', title: 'CUIL', type: 'text', placeholder: 'Buscar por CUIL...' },
      { columnId: 'document_number', title: 'Documento', type: 'text', placeholder: 'Buscar por documento...' },
      { columnId: 'phone', title: 'Teléfono', type: 'text', placeholder: 'Buscar por teléfono...' },
      { columnId: 'email', title: 'Email', type: 'text', placeholder: 'Buscar por email...' },
      { columnId: 'date_of_admission', title: 'Fecha de ingreso', type: 'dateRange' },
      { columnId: 'affected_since', title: 'Afectado desde', type: 'dateRange' },
    ],
    [fetchActiveFacet, fetchFkFacet, fetchStatusFacet]
  );

  const facetedFilters = useMemo(
    () => withDocumentStatusFacet(allFacetedFilters, showDocumentStatus),
    [allFacetedFilters, showDocumentStatus]
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
      columns={visibleColumns}
      data={[]}
      totalRows={0}
      searchParams={{}}
      queryFn={tableQueryFn}
      queryKey={customerTabKey(customerId, 'employees')}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por legajo, nombre, CUIL, documento, teléfono o email"
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
      emptyMessage="Este cliente no tiene empleados afectados"
      data-testid="customer-employees-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllCustomerEmployeesForExport(customerId, currentParams)),
        options: { filename: 'empleados-cliente', title: 'Empleados del cliente', sheetName: 'Empleados' },
        formatters: {
          status: (value) => (value ? employeeStatusLabels[value as string] ?? String(value) : ''),
          is_active: (value) => (value === false ? 'Dado de baja' : 'Activo'),
          date_of_admission: formatDbDate,
          affected_since: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        },
      }}
    />
  );
}
