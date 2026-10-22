'use client';

import {
  condition_enum,
  cost_type_enum,
  currency_enum,
  status_type,
  termination_reason_enum,
} from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  type DataTableFacetedFilterConfig,
  type DataTableFilterOption,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
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
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
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
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// HELPERS — FacetResult builders
// ============================================================================

function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  const options: DataTableFilterOption[] = (resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '' }));
  if (counts.has(NULL_FILTER_VALUE)) {
    options.push({ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff });
  }
  return { options, counts };
}

function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  counts: Map<string, number>,
  icons?: Record<string, LucideIcon | undefined>,
  nullLabel = 'Sin asignar'
): FacetResult {
  const options: DataTableFilterOption[] = enumValues.map((v) => ({
    value: v,
    label: labels[v] ?? v,
    ...(icons?.[v] ? { icon: icons[v] } : {}),
  }));
  if (counts.has(NULL_FILTER_VALUE)) {
    options.push({ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff });
  }
  return { options, counts };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _InactiveOtherEquipmentDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ─── Client-side navigation mode ─────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInactiveOtherEquipmentPaginated(params), []);

  // ─── Lazy-load facet factories ────────────────────────────────────────────

  // Factory para filtros FK (opciones resueltas desde el servidor)
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getInactiveOtherEquipmentSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      },
    []
  );

  // Factory para filtros enum (opciones estáticas, counts del servidor)
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon | undefined>
    ) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getInactiveOtherEquipmentSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, result.counts, icons);
      },
    []
  );

  // Columnas ocultas por defecto (unir preferencias guardadas con las del sistema)
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Filtros visibles por defecto: solo los 3 más comunes para equipos dados de baja.
  const DEFAULT_VISIBLE_FILTERS = ['reason_for_termination', 'condition', 'type'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'condition',
      'status',
      'type',
      'sub_type',
      'brand',
      'model',
      'sector',
      'owner',
      'cost_center',
      'linked_vehicle',
      'contractor_other_equipment',
      'cost_type',
      'currency',
      'reason_for_termination',
      'serial_number',
      'intern_number',
      'manufacturer_plate',
      'invoice_number',
      'composition',
      'year',
      'horometer',
      'initial_value',
      'purchase_date',
      'created_at',
      'termination_date',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── Filtros facetados — lazy-load con fetchFacet ─────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // reason_for_termination (enum nullable) — clave para tabla de bajas
      {
        columnId: 'reason_for_termination',
        title: 'Motivo de baja',
        fetchFacet: makeEnumFetchFacet(
          'reason_for_termination',
          Object.values(termination_reason_enum),
          terminationReasonEquipmentLabels
        ),
      },

      // condition (enum nullable) — con iconos
      {
        columnId: 'condition',
        title: 'Condición',
        fetchFacet: makeEnumFetchFacet(
          'condition',
          Object.values(condition_enum),
          conditionLabels,
          conditionIcons as Record<string, LucideIcon | undefined>
        ),
      },

      // status (enum nullable)
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', Object.values(status_type), otherEquipmentStatusLabels),
      },

      // type (FK UUID nullable)
      {
        columnId: 'type',
        title: 'Tipo',
        fetchFacet: makeFkFetchFacet('type'),
      },

      // sub_type (FK UUID nullable)
      {
        columnId: 'sub_type',
        title: 'Subtipo',
        fetchFacet: makeFkFetchFacet('sub_type'),
      },

      // brand (FK BigInt nullable)
      {
        columnId: 'brand',
        title: 'Marca',
        fetchFacet: makeFkFetchFacet('brand'),
      },

      // model (FK BigInt nullable)
      {
        columnId: 'model',
        title: 'Modelo',
        fetchFacet: makeFkFetchFacet('model'),
      },

      // sector (FK UUID nullable → hierarchy)
      {
        columnId: 'sector',
        title: 'Sector',
        fetchFacet: makeFkFetchFacet('sector'),
      },

      // owner (FK UUID nullable → equipment_owners)
      {
        columnId: 'owner',
        title: 'Propietario',
        fetchFacet: makeFkFetchFacet('owner'),
      },

      // cost_center (FK UUID nullable)
      {
        columnId: 'cost_center',
        title: 'Centro de costo',
        fetchFacet: makeFkFetchFacet('cost_center'),
      },

      // linked_vehicle (FK UUID nullable → vehicles)
      {
        columnId: 'linked_vehicle',
        title: 'Vinculado a',
        fetchFacet: makeFkFetchFacet('linked_vehicle', 'Sin vincular'),
      },

      // contractor_other_equipment (M:M → customers)
      {
        columnId: 'contractor_other_equipment',
        title: 'Afectaciones',
        fetchFacet: makeFkFetchFacet('contractor_other_equipment', 'Sin afectar'),
      },

      // cost_type (enum nullable)
      {
        columnId: 'cost_type',
        title: 'Tipo de costo',
        fetchFacet: makeEnumFetchFacet('cost_type', Object.values(cost_type_enum), costTypeLabels),
      },

      // currency (enum nullable)
      {
        columnId: 'currency',
        title: 'Moneda',
        fetchFacet: makeEnumFetchFacet('currency', Object.values(currency_enum), currencyLabels),
      },

      // Filtros de texto libre por columna
      {
        columnId: 'serial_number',
        title: 'N° Serie',
        type: 'text' as const,
        placeholder: 'Buscar por N° Serie...',
      },
      {
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
        placeholder: 'Buscar por N° Interno...',
      },
      {
        columnId: 'manufacturer_plate',
        title: 'Placa fabricante',
        type: 'text' as const,
        placeholder: 'Buscar por placa...',
      },
      {
        columnId: 'invoice_number',
        title: 'N° Factura',
        type: 'text' as const,
        placeholder: 'Buscar por N° de factura...',
      },
      {
        columnId: 'composition',
        title: 'Composición',
        type: 'text' as const,
        placeholder: 'Buscar por composición...',
      },
      {
        columnId: 'year',
        title: 'Año',
        type: 'text' as const,
        placeholder: 'Buscar por año...',
      },
      {
        columnId: 'horometer',
        title: 'Horómetro',
        type: 'text' as const,
        placeholder: 'Buscar por horómetro...',
      },
      {
        columnId: 'initial_value',
        title: 'Valor inicial',
        type: 'text' as const,
        placeholder: 'Buscar por valor...',
      },

      // Filtros de rango de fechas
      {
        columnId: 'purchase_date',
        title: 'Fecha de compra',
        type: 'dateRange' as const,
      },
      {
        columnId: 'created_at',
        title: 'Creado',
        type: 'dateRange' as const,
      },
      {
        columnId: 'termination_date',
        title: 'Fecha de baja',
        type: 'dateRange' as const,
      },
    ],
    [makeFkFetchFacet, makeEnumFetchFacet]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['inactive-other-equipment-list']}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por serie, interno o placa del fabricante"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
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
