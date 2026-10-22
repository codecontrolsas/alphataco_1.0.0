'use client';

import { Button } from '@/components/ui/button';
import { formatDbDate, formatTimestampDay } from '@/features/Equipos/lib/vehicle-list-client';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import {
  condition_enum,
  contract_type_vehicles_enum,
  cost_type_enum,
  currency_enum,
  status_type,
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
import { Check, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';
import { conditionIcons } from '../../../lib/condition-config';
import {
  getAllVehiclesForExport,
  getVehicleSingleFacet,
  getVehiclesPaginated,
  type VehicleListItem,
} from '../actions/actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: VehicleListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// FILTROS
// ============================================================================

const facets = createFacetFilters(getVehicleSingleFacet);
const NULL_OPTION = { label: 'Sin asignar' };

// Filtros visibles por defecto: solo los 3 más comunes (condición, tipo, afectación).
// El resto existe pero oculto — el usuario lo activa con el toggle de filtros.
const DEFAULT_VISIBLE_FILTERS = ['condition', 'type', 'contractor_equipment'];

const FACETED_FILTERS = [
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
  facets.lookup('owner', 'Propietario', undefined, NULL_OPTION),
  facets.lookup('sector', 'Sector', undefined, NULL_OPTION),
  facets.lookup('cost_center', 'Centro de costo', undefined, NULL_OPTION),
  facets.lookup('contractor_equipment', 'Afectaciones', undefined, { label: 'Sin afectar' }),
  facets.fixed(
    'type_of_contract',
    'Tipo de contrato',
    enumFilterOptions(Object.values(contract_type_vehicles_enum), contractTypeVehiclesLabels),
    NULL_OPTION
  ),
  facets.fixed(
    'cost_type',
    'Tipo de costo',
    enumFilterOptions(Object.values(cost_type_enum), costTypeLabels),
    NULL_OPTION
  ),
  facets.fixed('currency', 'Moneda', enumFilterOptions(Object.values(currency_enum), currencyLabels), NULL_OPTION),
  facets.fixed('has_certification', 'Posee certificación', [
    { value: 'true', label: 'Sí', icon: Check },
    { value: 'false', label: 'No', icon: X },
  ]),
  textFilter('domain', 'Dominio', 'Buscar por dominio...'),
  textFilter('chassis', 'Chassis', 'Buscar por chassis...'),
  textFilter('engine', 'Motor', 'Buscar por motor...'),
  textFilter('serie', 'Serie', 'Buscar por serie...'),
  textFilter('intern_number', 'N° Interno', 'Buscar por N° Interno...'),
  textFilter('contract_number', 'N° Contrato', 'Buscar por N° de contrato...'),
  textFilter('year', 'Año', 'Buscar por año...'),
  textFilter('kilometer', 'Kilómetros', 'Buscar por kilómetros...'),
  textFilter('engine_hours', 'Horómetro', 'Buscar por horómetro...'),
  textFilter('price', 'Precio', 'Buscar por precio...'),
  textFilter('checklist_count', 'Cantidad de Checklist', 'Ej: 0 = sin checklist...'),
  textFilter('certification_number', 'N° de certificación', 'Buscar por N° de certificación...'),
  dateRangeFilter('contract_expiration_date', 'Vencimiento contrato'),
  dateRangeFilter('contract_start_date', 'Inicio contrato'),
  dateRangeFilter('created_at', 'Creado'),
  dateRangeFilter('last_checklist_date', 'Último Checklist'),
  dateRangeFilter('certification_expiration_date', 'Vencimiento de certificación'),
];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _VehicleDataTable({
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

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getVehiclesPaginated(params), []);

  // ─── Botón "Nuevo vehículo" protegido por permisos ────────────────────────
  const toolbarActions = (
    <PermissionGuard module="equipos" tab="vehicles" action="create">
      <Button asChild variant="brand" size="sm">
        <Link href="/dashboard/equipment/action?action=new">
          <Plus className="mr-2 size-4" />
          Agregar vehículo
        </Link>
      </Button>
    </PermissionGuard>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      {...tableProps}
      columns={columns}
      data={data}
      totalRows={totalRows}
      queryFn={tableQueryFn}
      queryKey={['vehicles-list']}
      searchPlaceholder="Buscar por dominio, interno, chasis o motor"
      showSearch
      mobileCards
      toolbarActions={toolbarActions}
      emptyMessage="No hay vehículos registrados"
      data-testid="vehicles-table"
      exportConfig={{
        // Usar currentParams (no searchParams) para respetar filtros activos post-SSR
        fetchAllData: async () => unwrapExportResult(await getAllVehiclesForExport(currentParams)),
        options: {
          filename: 'vehiculos',
          title: 'Listado de Vehículos',
          sheetName: 'Vehículos',
        },
        formatters: {
          condition: (val) => conditionLabels[val as string] ?? String(val ?? ''),
          status: (val) => otherEquipmentStatusLabels[val as string] ?? String(val ?? ''),
          type_of_contract: (val) => contractTypeVehiclesLabels[val as string] ?? String(val ?? ''),
          cost_type: (val) => costTypeLabels[val as string] ?? String(val ?? ''),
          currency: (val) => currencyLabels[val as string] ?? String(val ?? ''),
          reason_for_termination: (val) => terminationReasonEquipmentLabels[val as string] ?? String(val ?? ''),
          contract_expiration_date: formatDbDate,
          contract_start_date: formatDbDate,
          termination_date: formatDbDate,
          created_at: formatTimestampDay,
          price: (val) => (val != null ? String(val) : ''),
          last_checklist_date: formatTimestampDay,
          has_certification: (val) => (val ? 'Sí' : 'No'),
          certification_expiration_date: formatDbDate,
        },
      }}
    />
  );
}
