'use client';

import {
  withDocumentStatusColumn,
  withDocumentStatusDefault,
  withDocumentStatusFacet,
} from '@/features/Modules/lib/document-status-visibility';
import {
  condition_enum,
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
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import {
  conditionLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import { conditionIcons } from '../../../../lib/condition-config';
import {
  getAllInactiveOtherEquipmentForExport,
  getInactiveOtherEquipmentPaginated,
  getInactiveOtherEquipmentSingleFacet,
  type InactiveOtherEquipmentListItem,
} from '../actions/actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: InactiveOtherEquipmentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** `documentacion` encendido: si no, se ocultan la columna y el filtro de estado documental (caché congelado). */
  showDocumentStatus: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// FILTROS
// ============================================================================

const facets = createFacetFilters(getInactiveOtherEquipmentSingleFacet);
const NULL_OPTION = { label: 'Sin asignar' };

// Filtros visibles por defecto: solo los 3 más comunes para equipos dados de baja.
const DEFAULT_VISIBLE_FILTERS = ['reason_for_termination', 'condition', 'type'];

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
  facets.lookup('sector', 'Sector', undefined, NULL_OPTION),
  facets.lookup('owner', 'Propietario', undefined, NULL_OPTION),
  facets.lookup('cost_center', 'Centro de costo', undefined, NULL_OPTION),
  facets.lookup('linked_vehicle', 'Vinculado a', undefined, { label: 'Sin vincular' }),
  facets.lookup('contractor_other_equipment', 'Afectaciones', undefined, { label: 'Sin afectar' }),
  facets.fixed(
    'cost_type',
    'Tipo de costo',
    enumFilterOptions(Object.values(cost_type_enum), costTypeLabels),
    NULL_OPTION
  ),
  facets.fixed('currency', 'Moneda', enumFilterOptions(Object.values(currency_enum), currencyLabels), NULL_OPTION),
  textFilter('serial_number', 'N° Serie', 'Buscar por N° Serie...'),
  textFilter('intern_number', 'N° Interno', 'Buscar por N° Interno...'),
  textFilter('manufacturer_plate', 'Placa fabricante', 'Buscar por placa...'),
  textFilter('invoice_number', 'N° Factura', 'Buscar por N° de factura...'),
  textFilter('composition', 'Composición', 'Buscar por composición...'),
  textFilter('year', 'Año', 'Buscar por año...'),
  textFilter('horometer', 'Horómetro', 'Buscar por horómetro...'),
  textFilter('initial_value', 'Valor inicial', 'Buscar por valor...'),
  dateRangeFilter('purchase_date', 'Fecha de compra'),
  dateRangeFilter('created_at', 'Creado'),
  dateRangeFilter('termination_date', 'Fecha de baja'),
];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _InactiveOtherEquipmentDataTable({
  data,
  totalRows,
  searchParams,
  showDocumentStatus,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const visibleColumns = useMemo(() => withDocumentStatusColumn(columns, showDocumentStatus), [showDocumentStatus]);
  const facetedFilters = useMemo(
    () => withDocumentStatusFacet(FACETED_FILTERS, showDocumentStatus),
    [showDocumentStatus]
  );
  const defaultVisibleFilters = useMemo(
    () => withDocumentStatusDefault(DEFAULT_VISIBLE_FILTERS, showDocumentStatus),
    [showDocumentStatus]
  );
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInactiveOtherEquipmentPaginated(params), []);

  return (
    <DataTable
      {...tableProps}
      columns={visibleColumns}
      data={data}
      totalRows={totalRows}
      queryFn={tableQueryFn}
      queryKey={['inactive-other-equipment-list']}
      searchPlaceholder="Buscar por serie, interno o placa del fabricante"
      showSearch
      mobileCards
      emptyMessage="No hay equipos dados de baja"
      data-testid="inactive-other-equipment-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllInactiveOtherEquipmentForExport(currentParams)),
        options: {
          filename: 'otros-equipos-dados-de-baja',
          title: 'Listado de Otros Equipos Dados de Baja',
          sheetName: 'Dados de Baja',
        },
        formatters: {
          condition: (val) => conditionLabels[val as string] ?? String(val ?? ''),
          status: (val) => otherEquipmentStatusLabels[val as string] ?? String(val ?? ''),
          cost_type: (val) => costTypeLabels[val as string] ?? String(val ?? ''),
          currency: (val) => currencyLabels[val as string] ?? String(val ?? ''),
          reason_for_termination: (val) => terminationReasonEquipmentLabels[val as string] ?? String(val ?? ''),
          purchase_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          termination_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
          initial_value: (val) => (val != null ? String(val) : ''),
          horometer: (val) => (val != null ? `${String(val)} h` : ''),
        },
      }}
    />
  );
}
