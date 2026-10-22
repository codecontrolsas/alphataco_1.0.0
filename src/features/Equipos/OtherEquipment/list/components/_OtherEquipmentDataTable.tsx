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
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
  type SortItem,
} from '@/shared/components/common/DataTable/types';
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
import { Check, CircleOff, Plus, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
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
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        icon: icons[value],
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para booleanos con labels e iconos custom */
function buildBooleanFacetResult(
  trueLabel: string,
  falseLabel: string,
  trueIcon: LucideIcon,
  falseIcon: LucideIcon,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      { value: 'true', label: trueLabel, icon: trueIcon },
      { value: 'false', label: falseLabel, icon: falseIcon },
    ],
    counts,
  };
}

/** Construye FacetResult para FK/M:M: opciones del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

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
  // ─── Client-side navigation: estado reactivo para queries dependientes ──────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getOtherEquipmentPaginated(params), []);

  // Columnas ocultas por defecto (unir preferencias guardadas con las del sistema)
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Filtros visibles por defecto: solo los 3 mas comunes.
  // El resto se crean pero ocultos — el usuario los activa con el toggle de filtros.
  const DEFAULT_VISIBLE_FILTERS = ['condition', 'type', 'contractor_other_equipment', 'status'];
  const mergedFilterVisibility = useMemo(() => {
    // Si el usuario ya tiene preferencias guardadas, usarlas
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    // Caso contrario, solo mostrar los 3 filtros por defecto
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
      'type_of_contract',
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
      'has_certification',
      'certification_expiration_date',
      'certification_number',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories: cada filtro carga sus opciones al abrirse ────────

  // Factory para enums
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getOtherEquipmentSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  // Factory para booleanos
  const makeBooleanFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string, trueIcon: LucideIcon, falseIcon: LucideIcon) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getOtherEquipmentSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildBooleanFacetResult(trueLabel, falseLabel, trueIcon, falseIcon, result.counts);
      };
    },
    []
  );

  // Factory para FK / M:M
  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getOtherEquipmentSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // ─── Filtros facetados con lazy-load ────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Enums ───────────────────────────────────────────────────────────────
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
      {
        columnId: 'status',
        title: 'Documentación',
        fetchFacet: makeEnumFetchFacet('status', Object.values(status_type), otherEquipmentStatusLabels, {}),
      },
      {
        columnId: 'cost_type',
        title: 'Tipo de costo',
        fetchFacet: makeEnumFetchFacet('cost_type', Object.values(cost_type_enum), costTypeLabels, {}),
      },
      {
        columnId: 'currency',
        title: 'Moneda',
        fetchFacet: makeEnumFetchFacet('currency', Object.values(currency_enum), currencyLabels, {}),
      },
      {
        columnId: 'type_of_contract',
        title: 'Tipo de contrato',
        fetchFacet: makeEnumFetchFacet(
          'type_of_contract',
          Object.values(contract_type_vehicles_enum),
          contractTypeVehiclesLabels,
          {}
        ),
      },

      // ── Booleanos ───────────────────────────────────────────────────────────
      {
        columnId: 'has_certification',
        title: 'Posee certificación',
        fetchFacet: makeBooleanFetchFacet('has_certification', 'Sí', 'No', Check, X),
      },

      // ── FK UUID ─────────────────────────────────────────────────────────────
      { columnId: 'type', title: 'Tipo', fetchFacet: makeFkFetchFacet('type') },
      { columnId: 'sub_type', title: 'Subtipo', fetchFacet: makeFkFetchFacet('sub_type') },
      { columnId: 'sector', title: 'Sector', fetchFacet: makeFkFetchFacet('sector') },
      { columnId: 'owner', title: 'Propietario', fetchFacet: makeFkFetchFacet('owner') },
      { columnId: 'cost_center', title: 'Centro de costo', fetchFacet: makeFkFetchFacet('cost_center') },
      { columnId: 'linked_vehicle', title: 'Vinculado a', fetchFacet: makeFkFetchFacet('linked_vehicle') },

      // ── FK BigInt (brand, model — serializados a string en el server action) ─
      { columnId: 'brand', title: 'Marca', fetchFacet: makeFkFetchFacet('brand') },
      { columnId: 'model', title: 'Modelo', fetchFacet: makeFkFetchFacet('model') },

      // ── M:M ─────────────────────────────────────────────────────────────────
      {
        columnId: 'contractor_other_equipment',
        title: 'Afectado a',
        fetchFacet: makeFkFetchFacet('contractor_other_equipment', 'Sin afectar'),
      },

      // ── Filtros de texto libre por columna ───────────────────────────────────
      { columnId: 'serial_number', title: 'N° Serie', type: 'text' as const, placeholder: 'Buscar por N° Serie...' },
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
      { columnId: 'year', title: 'Año', type: 'text' as const, placeholder: 'Buscar por año...' },
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
      {
        columnId: 'certification_number',
        title: 'N° de certificación',
        type: 'text' as const,
        placeholder: 'Buscar por N° de certificación...',
      },

      // ── Filtros de rango de fechas ───────────────────────────────────────────
      { columnId: 'purchase_date', title: 'Fecha de compra', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
      { columnId: 'certification_expiration_date', title: 'Vencimiento de certificación', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

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
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['other-equipment-paginated']}
      onStateChange={handleStateChange}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      initialPageSize={initialPageSize}
      initialSorting={initialSorting}
      persistViewPreferences={true}
      enableColumnReorder={true}
      initialColumnOrder={initialColumnOrder}
      searchPlaceholder="Buscar por serie, interno o placa del fabricante"
      showSearch
      mobileCards
      showFilterToggle={true}
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
