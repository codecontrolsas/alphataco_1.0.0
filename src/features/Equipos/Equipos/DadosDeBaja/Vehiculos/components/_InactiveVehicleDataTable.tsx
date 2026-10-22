'use client';

import { formatDbDate, formatTimestampDay } from '@/features/Equipos/lib/vehicle-list-client';
import {
  condition_enum,
  contract_type_vehicles_enum,
  cost_type_enum,
  currency_enum,
  status_type,
  termination_reason_enum,
} from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import { type DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import { useCallback } from 'react';
import { conditionIcons } from '../../../../lib/condition-config';
import {
  getAllInactiveVehiclesForExport,
  getInactiveVehicleSingleFacet,
  getInactiveVehiclesPaginated,
  type InactiveVehicleListItem,
} from '../actions/actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: InactiveVehicleListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// FILTROS
// ============================================================================

const facets = createFacetFilters(getInactiveVehicleSingleFacet);
const NULL_OPTION = { label: 'Sin asignar' };

// Filtros visibles por defecto: solo los 3 más comunes para vehículos dados de baja.
const DEFAULT_VISIBLE_FILTERS = ['condition', 'reason_for_termination', 'type'];

const FACETED_FILTERS = [
  facets.fixed(
    'reason_for_termination',
    'Motivo de baja',
    enumFilterOptions(Object.values(termination_reason_enum), terminationReasonEquipmentLabels),
    NULL_OPTION
  ),
  facets.fixed(
    'condition',
    'Condición',
    enumFilterOptions(
      Object.values(condition_enum),
      conditionLabels,
      conditionIcons as Record<string, LucideIcon | undefined>
    ),
    NULL_OPTION
  ),
  facets.fixed(
    'status',
    'Estado',
    enumFilterOptions(Object.values(status_type), otherEquipmentStatusLabels),
    NULL_OPTION
  ),
  facets.lookup('type', 'Tipo', undefined, NULL_OPTION),
  facets.lookup('sub_type', 'Subtipo', undefined, NULL_OPTION),
  facets.lookup('brand', 'Marca', undefined, NULL_OPTION),
  facets.lookup('model', 'Modelo', undefined, NULL_OPTION),
  facets.fixed(
    'cost_type',
    'Tipo de costo',
    enumFilterOptions(Object.values(cost_type_enum), costTypeLabels),
    NULL_OPTION
  ),
  facets.fixed('currency', 'Moneda', enumFilterOptions(Object.values(currency_enum), currencyLabels), NULL_OPTION),
  facets.fixed(
    'type_of_contract',
    'Tipo de contrato',
    enumFilterOptions(Object.values(contract_type_vehicles_enum), contractTypeVehiclesLabels),
    NULL_OPTION
  ),
  facets.lookup('sector', 'Sector', undefined, NULL_OPTION),
  facets.lookup('owner', 'Propietario', undefined, NULL_OPTION),
  facets.lookup('cost_center', 'Centro de costo', undefined, NULL_OPTION),
  facets.lookup('contractor_equipment', 'Afectaciones', undefined, { label: 'Sin afectar' }),
  textFilter('domain', 'Dominio', 'Buscar por dominio...'),
  textFilter('intern_number', 'N° Interno', 'Buscar por N° Interno...'),
  textFilter('chassis', 'Chassis', 'Buscar por chassis...'),
  textFilter('engine', 'Motor', 'Buscar por motor...'),
  textFilter('serie', 'Serie', 'Buscar por serie...'),
  textFilter('contract_number', 'N° Contrato', 'Buscar por N° de contrato...'),
  textFilter('year', 'Año', 'Buscar por año...'),
  textFilter('kilometer', 'Kilómetros', 'Buscar por kilómetros...'),
  textFilter('engine_hours', 'Horómetro', 'Buscar por horómetro...'),
  textFilter('price', 'Precio', 'Buscar por precio...'),
  dateRangeFilter('termination_date', 'Fecha de baja'),
  dateRangeFilter('contract_start_date', 'Inicio de contrato'),
  dateRangeFilter('contract_expiration_date', 'Vencimiento de contrato'),
  dateRangeFilter('created_at', 'Creado'),
];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _InactiveVehicleDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters: FACETED_FILTERS,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInactiveVehiclesPaginated(params), []);

  return (
    <DataTable
      {...tableProps}
      columns={columns}
      data={data}
      totalRows={totalRows}
      queryFn={tableQueryFn}
      queryKey={['inactive-vehicles-list']}
      searchPlaceholder="Buscar por dominio, interno, chasis o motor"
      showSearch
      mobileCards
      emptyMessage="No hay vehículos dados de baja"
      data-testid="inactive-vehicles-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllInactiveVehiclesForExport(currentParams)),
        options: {
          filename: 'vehiculos-dados-de-baja',
          title: 'Vehículos Dados de Baja',
          sheetName: 'Vehículos Dados de Baja',
        },
        formatters: {
          condition: (val) => conditionLabels[val as string] ?? String(val ?? ''),
          status: (val) => otherEquipmentStatusLabels[val as string] ?? String(val ?? ''),
          cost_type: (val) => costTypeLabels[val as string] ?? String(val ?? ''),
          currency: (val) => currencyLabels[val as string] ?? String(val ?? ''),
          type_of_contract: (val) => contractTypeVehiclesLabels[val as string] ?? String(val ?? ''),
          reason_for_termination: (val) => terminationReasonEquipmentLabels[val as string] ?? String(val ?? ''),
          termination_date: formatDbDate,
          contract_start_date: formatDbDate,
          contract_expiration_date: formatDbDate,
          created_at: formatTimestampDay,
          price: (val) => (val != null ? String(val) : ''),
        },
      }}
    />
  );
}
