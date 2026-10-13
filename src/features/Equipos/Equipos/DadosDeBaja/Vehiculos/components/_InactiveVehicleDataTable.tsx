'use client';

import {
  condition_enum,
  contract_type_vehicles_enum,
  cost_type_enum,
  currency_enum,
  status_type,
  termination_reason_enum,
} from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableFilterOption,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { conditionIcons } from '../../../VehicleList/columns';
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
// HELPERS — FacetResult builders
// ============================================================================

function buildFkFacetResult(
  resolvedOptions: { value: string; label: string }[] | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  const options: DataTableFilterOption[] = (resolvedOptions ?? []).map((o) => ({ value: o.value, label: o.label }));
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

export function _InactiveVehicleDataTable({
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

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInactiveVehiclesPaginated(params), []);

  // ─── Lazy-load facet factories ────────────────────────────────────────────

  // Factory para filtros FK (opciones resueltas desde el servidor)
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getInactiveVehicleSingleFacet(columnId, params);
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
        const result = await getInactiveVehicleSingleFacet(columnId, params);
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

  // Filtros visibles por defecto: solo los 3 más comunes para vehículos dados de baja.
  const DEFAULT_VISIBLE_FILTERS = ['condition', 'reason_for_termination', 'type'];
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
      'cost_type',
      'currency',
      'type_of_contract',
      'reason_for_termination',
      'sector',
      'owner',
      'cost_center',
      'contractor_equipment',
      'domain',
      'intern_number',
      'chassis',
      'engine',
      'serie',
      'contract_number',
      'year',
      'kilometer',
      'engine_hours',
      'price',
      'termination_date',
      'contract_start_date',
      'contract_expiration_date',
      'created_at',
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

      // condition (enum nullable) — con iconos que coinciden con las celdas
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

      // type_of_contract (enum nullable)
      {
        columnId: 'type_of_contract',
        title: 'Tipo de contrato',
        fetchFacet: makeEnumFetchFacet(
          'type_of_contract',
          Object.values(contract_type_vehicles_enum),
          contractTypeVehiclesLabels
        ),
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

      // contractor_equipment (M:M → customers)
      {
        columnId: 'contractor_equipment',
        title: 'Afectaciones',
        fetchFacet: makeFkFetchFacet('contractor_equipment', 'Sin afectar'),
      },

      // Filtros de texto libre por columna
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
      },
      {
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
        placeholder: 'Buscar por N° Interno...',
      },
      {
        columnId: 'chassis',
        title: 'Chassis',
        type: 'text' as const,
        placeholder: 'Buscar por chassis...',
      },
      {
        columnId: 'engine',
        title: 'Motor',
        type: 'text' as const,
        placeholder: 'Buscar por motor...',
      },
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie...',
      },
      {
        columnId: 'contract_number',
        title: 'N° Contrato',
        type: 'text' as const,
        placeholder: 'Buscar por N° de contrato...',
      },
      {
        columnId: 'year',
        title: 'Año',
        type: 'text' as const,
        placeholder: 'Buscar por año...',
      },
      {
        columnId: 'kilometer',
        title: 'Kilómetros',
        type: 'text' as const,
        placeholder: 'Buscar por kilómetros...',
      },
      {
        columnId: 'engine_hours',
        title: 'Horómetro',
        type: 'text' as const,
        placeholder: 'Buscar por horómetro...',
      },
      {
        columnId: 'price',
        title: 'Precio',
        type: 'text' as const,
        placeholder: 'Buscar por precio...',
      },

      // Filtros de rango de fechas
      {
        columnId: 'termination_date',
        title: 'Fecha de baja',
        type: 'dateRange' as const,
      },
      {
        columnId: 'contract_start_date',
        title: 'Inicio de contrato',
        type: 'dateRange' as const,
      },
      {
        columnId: 'contract_expiration_date',
        title: 'Vencimiento de contrato',
        type: 'dateRange' as const,
      },
      {
        columnId: 'created_at',
        title: 'Creado',
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
      queryKey={['inactive-vehicles-list']}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por dominio, interno, chasis o motor"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay vehículos dados de baja"
      data-testid="inactive-vehicles-table"
      exportConfig={{
        fetchAllData: () => getAllInactiveVehiclesForExport(currentParams),
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
          termination_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          contract_start_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          contract_expiration_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          created_at: (val) => (val ? moment(val as string).format('DD/MM/YYYY') : ''),
          price: (val) => (val != null ? String(val) : ''),
        },
      }}
    />
  );
}
