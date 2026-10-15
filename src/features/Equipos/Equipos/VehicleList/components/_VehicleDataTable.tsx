'use client';

import { Button } from '@/components/ui/button';
import {
  buildBooleanFacetResult,
  buildEnumFacetResult,
  buildFkFacetResult,
  formatDbDate,
  formatTimestampDay,
} from '@/features/Equipos/lib/vehicle-list-client';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import {
  condition_enum,
  contract_type_vehicles_enum,
  cost_type_enum,
  currency_enum,
  status_type,
} from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
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
import { useCallback, useMemo, useState } from 'react';
import {
  getAllVehiclesForExport,
  getVehicleSingleFacet,
  getVehiclesPaginated,
  type VehicleListItem,
} from '../actions/actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, conditionIcons } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: VehicleListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['condition', 'type', 'contractor_equipment'];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _VehicleDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ─── Client-side navigation mode ─────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getVehiclesPaginated(params), []);

  // ─── Lazy-load facet factories ────────────────────────────────────────────

  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      },
    []
  );

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon | undefined>
    ) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, result.counts, icons);
      },
    []
  );

  const makeBooleanFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string, trueIcon: LucideIcon, falseIcon: LucideIcon) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildBooleanFacetResult(trueLabel, falseLabel, trueIcon, falseIcon, result.counts);
      },
    []
  );

  // Columnas ocultas por defecto (unir preferencias guardadas con las del sistema)
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── Filtros facetados — lazy-load con fetchFacet ─────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
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

      // owner (FK UUID nullable)
      {
        columnId: 'owner',
        title: 'Propietario',
        fetchFacet: makeFkFetchFacet('owner'),
      },

      // sector (FK UUID nullable → hierarchy)
      {
        columnId: 'sector',
        title: 'Sector',
        fetchFacet: makeFkFetchFacet('sector'),
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

      // has_certification (boolean)
      {
        columnId: 'has_certification',
        title: 'Posee certificación',
        fetchFacet: makeBooleanFetchFacet('has_certification', 'Sí', 'No', Check, X),
      },

      // Filtros de texto libre por columna
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
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
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
        placeholder: 'Buscar por N° Interno...',
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
      {
        columnId: 'checklist_count',
        title: 'Cantidad de Checklist',
        type: 'text' as const,
        placeholder: 'Ej: 0 = sin checklist...',
      },
      {
        columnId: 'certification_number',
        title: 'N° de certificación',
        type: 'text' as const,
        placeholder: 'Buscar por N° de certificación...',
      },

      // Filtros de rango de fechas
      {
        columnId: 'contract_expiration_date',
        title: 'Vencimiento contrato',
        type: 'dateRange' as const,
      },
      {
        columnId: 'contract_start_date',
        title: 'Inicio contrato',
        type: 'dateRange' as const,
      },
      {
        columnId: 'created_at',
        title: 'Creado',
        type: 'dateRange' as const,
      },
      {
        columnId: 'last_checklist_date',
        title: 'Último Checklist',
        type: 'dateRange' as const,
      },
      {
        columnId: 'certification_expiration_date',
        title: 'Vencimiento de certificación',
        type: 'dateRange' as const,
      },
    ],
    [makeFkFetchFacet, makeEnumFetchFacet, makeBooleanFetchFacet]
  );

  // Filtros visibles por defecto: solo los 3 más comunes (condición, tipo, afectación).
  // El resto existe pero oculto — el usuario lo activa con el toggle de filtros.
  const mergedFilterVisibility = useMemo(() => {
    // Si el usuario ya tiene preferencias guardadas, usarlas
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

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
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['vehicles-list']}
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
