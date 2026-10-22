'use client';

import { Button } from '@/components/ui/button';
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
import { type DataTableSearchParams, type SortItem } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
} from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import { Check, Plus, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useCallback } from 'react';
import { conditionIcons } from '../../../lib/condition-config';
import {
  getAllOtherEquipmentForExport,
  getOtherEquipmentPaginated,
  getOtherEquipmentSingleFacet,
  type OtherEquipmentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: OtherEquipmentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  /** Filas por página guardadas por el usuario (undefined = default del sistema) */
  initialPageSize?: number;
  /** Ordenamiento guardado por el usuario (undefined = orden por defecto del server) */
  initialSorting?: SortItem[];
  /** Orden de columnas guardado por el usuario (undefined = orden de definición) */
  initialColumnOrder?: string[];
}

// ============================================================================
// FILTROS
// ============================================================================

const facets = createFacetFilters(getOtherEquipmentSingleFacet);
const NULL_OPTION = { label: 'Sin asignar' };

// Filtros visibles por defecto: los más comunes. El resto se crean pero ocultos — el usuario los activa con el
// toggle de filtros.
const DEFAULT_VISIBLE_FILTERS = ['condition', 'type', 'contractor_other_equipment', 'status'];

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
    'Documentación',
    enumFilterOptions(Object.values(status_type), otherEquipmentStatusLabels),
    NULL_OPTION
  ),
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
  facets.fixed('has_certification', 'Posee certificación', [
    { value: 'true', label: 'Sí', icon: Check },
    { value: 'false', label: 'No', icon: X },
  ]),
  facets.lookup('type', 'Tipo', undefined, NULL_OPTION),
  facets.lookup('sub_type', 'Subtipo', undefined, NULL_OPTION),
  facets.lookup('sector', 'Sector', undefined, NULL_OPTION),
  facets.lookup('owner', 'Propietario', undefined, NULL_OPTION),
  facets.lookup('cost_center', 'Centro de costo', undefined, NULL_OPTION),
  facets.lookup('linked_vehicle', 'Vinculado a', undefined, NULL_OPTION),
  facets.lookup('brand', 'Marca', undefined, NULL_OPTION),
  facets.lookup('model', 'Modelo', undefined, NULL_OPTION),
  facets.lookup('contractor_other_equipment', 'Afectado a', undefined, { label: 'Sin afectar' }),
  textFilter('serial_number', 'N° Serie', 'Buscar por N° Serie...'),
  textFilter('intern_number', 'N° Interno', 'Buscar por N° Interno...'),
  textFilter('manufacturer_plate', 'Placa fabricante', 'Buscar por placa...'),
  textFilter('invoice_number', 'N° Factura', 'Buscar por N° de factura...'),
  textFilter('composition', 'Composición', 'Buscar por composición...'),
  textFilter('year', 'Año', 'Buscar por año...'),
  textFilter('horometer', 'Horómetro', 'Buscar por horómetro...'),
  textFilter('initial_value', 'Valor inicial', 'Buscar por valor...'),
  textFilter('certification_number', 'N° de certificación', 'Buscar por N° de certificación...'),
  dateRangeFilter('purchase_date', 'Fecha de compra'),
  dateRangeFilter('created_at', 'Creado'),
  dateRangeFilter('certification_expiration_date', 'Vencimiento de certificación'),
];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _OtherEquipmentDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap: _permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  initialPageSize,
  initialSorting,
  initialColumnOrder,
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

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getOtherEquipmentPaginated(params), []);

  // ─── Botón "Nuevo equipo" protegido por permisos ───────────────────────────
  const toolbarActions = (
    <PermissionGuard module="equipos" tab="others" action="create">
      <Button asChild variant="brand" size="sm">
        <Link href="/dashboard/equipment/action?action=new&type=other">
          <Plus className="mr-2 size-4" />
          Nuevo equipo
        </Link>
      </Button>
    </PermissionGuard>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <DataTable
      {...tableProps}
      columns={columns}
      data={data}
      totalRows={totalRows}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['other-equipment-paginated']}
      initialPageSize={initialPageSize}
      initialSorting={initialSorting}
      persistViewPreferences={true}
      enableColumnReorder={true}
      initialColumnOrder={initialColumnOrder}
      searchPlaceholder="Buscar por serie, interno o placa del fabricante"
      showSearch
      mobileCards
      toolbarActions={toolbarActions}
      emptyMessage="No hay equipos registrados"
      data-testid="other-equipment-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllOtherEquipmentForExport(currentParams)),
        options: {
          filename: 'otros-equipos',
          title: 'Listado de Otros Equipos',
          sheetName: 'Otros Equipos',
        },
        formatters: {
          condition: (val) => conditionLabels[val as string] ?? String(val ?? ''),
          status: (val) => otherEquipmentStatusLabels[val as string] ?? String(val ?? ''),
          cost_type: (val) => costTypeLabels[val as string] ?? String(val ?? ''),
          currency: (val) => currencyLabels[val as string] ?? String(val ?? ''),
          type_of_contract: (val) => contractTypeVehiclesLabels[val as string] ?? String(val ?? ''),
          purchase_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
          initial_value: (val) => (val != null ? String(val) : ''),
          horometer: (val) => (val != null ? `${String(val)} h` : ''),
          has_certification: (val) => (val ? 'Sí' : 'No'),
          certification_expiration_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
        },
      }}
    />
  );
}
