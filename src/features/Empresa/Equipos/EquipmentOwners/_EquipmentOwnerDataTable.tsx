'use client';

import { Button } from '@/components/ui/button';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import { EquipmentOwnerForm } from './EquipmentOwnerForm';
import { VehiclesByOwnerList } from './VehiclesByOwnerList';
import { HIDDEN_COLUMNS_BY_DEFAULT, getEquipmentOwnerColumns } from './columns';
import { VehiclesByOwnerTableSkeleton } from './fallback/EquipmentOwnerTableSkeleton';
import type { EquipmentOwnerListItem } from './lib/owners-types';
import {
  getAllEquipmentOwnersForExport,
  getEquipmentOwnerSingleFacet,
  getEquipmentOwnersPaginated,
} from './owners.server';

// ============================================================================
// PROPS
// ============================================================================

interface EquipmentOwnerDataTableProps {
  data: EquipmentOwnerListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name'];

/** Al montarse el detalle de equipos del titular, lleva la vista hasta él (respeta `prefers-reduced-motion`). */
function scrollIntoViewOnMount(element: HTMLElement | null) {
  if (!element) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

// ============================================================================
// CLIENT COMPONENT — orquesta tabla principal + form + vista equipos del titular
// ============================================================================

export function _EquipmentOwnerDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: EquipmentOwnerDataTableProps) {
  // ── Permisos ──────────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'titulares', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'titulares', 'update');

  // ── Estado local: edición (Sheet) y detalle de equipos del titular ────────
  const [editingOwner, setEditingOwner] = useState<EquipmentOwnerListItem | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; name: string } | null>(null);

  const handleFormReset = useCallback(() => {
    setEditingOwner(null);
  }, []);

  const sheet = useCatalogSheet<EquipmentOwnerListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setEditingOwner,
    onOpenCreate: handleFormReset,
    onClosed: handleFormReset,
  });
  const handleEdit = sheet.openEdit;

  const handleViewEquipment = useCallback((item: EquipmentOwnerListItem) => {
    setSelectedOwner({ id: item.id, name: item.name });
  }, []);

  const handleCloseSecondaryTable = useCallback(() => {
    setSelectedOwner(null);
  }, []);

  // ── Columnas ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getEquipmentOwnerColumns(permissions, handleEdit, handleViewEquipment),
    [permissions, handleEdit, handleViewEquipment]
  );

  // ── Client-side navigation ────────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentOwnersPaginated(params), []);

  // ── Lazy-load facets ──────────────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentOwnerSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map<string, number>() };
    return buildActiveFacetResult(result.counts);
  }, []);

  const facetedFilters = useMemo(
    () => [
      { columnId: 'is_active', title: 'Estado', fetchFacet: fetchIsActiveFacet },
      { columnId: 'name', title: 'Nombre', type: 'text' as const },
      { columnId: 'cuit', title: 'CUIT', type: 'text' as const },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    [fetchIsActiveFacet]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const mergedColumnVisibility = useMemo(
    () => ({
      ...Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false])),
      ...initialColumnVisibility,
    }),
    [initialColumnVisibility]
  );

  // ── Tabla principal ───────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['equipment-owners-list']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo titular" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      searchPlaceholder="Buscar por nombre o CUIT..."
      emptyMessage="No hay titulares de equipos registrados"
      showFilterToggle={true}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEquipmentOwnersForExport(currentParams)),
        options: {
          filename: 'titulares-de-equipos',
          sheetName: 'Titulares de Equipos',
          title: 'Titulares de Equipos',
        },
        formatters: {
          equipment_owner_contract_types: (val: unknown) => {
            if (!Array.isArray(val)) return '';
            return (val as Array<{ contract_type: string }>).map((ct) => ct.contract_type).join(', ');
          },
          is_active: (val: unknown) => activeStatusLabel(val),
          created_at: (val: unknown) => (val ? formatArgentinaDay(val as string | Date) : '-'),
        },
      }}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CatalogTableSurface>{table}</CatalogTableSurface>

      {selectedOwner ? (
        <CatalogTableSurface
          key={selectedOwner.id}
          id="equipos-del-titular"
          title={`Equipos de: ${selectedOwner.name}`}
          description="Equipos registrados para este titular"
        >
          <div ref={scrollIntoViewOnMount} className="mb-3 flex justify-end scroll-mt-20">
            <Button type="button" variant="outline" size="sm" onClick={handleCloseSecondaryTable}>
              Cerrar detalle
            </Button>
          </div>
          <Suspense fallback={<VehiclesByOwnerTableSkeleton />}>
            <VehiclesByOwnerList
              ownerId={selectedOwner.id}
              ownerName={selectedOwner.name}
              searchParams={searchParams}
            />
          </Suspense>
        </CatalogTableSurface>
      ) : null}

      <CatalogFormSheet
        sheet={sheet}
        getKey={(owner) => owner.id}
        title={{ create: 'Nuevo titular', edit: 'Editar titular' }}
        size="lg"
      >
        {({ close }) => <EquipmentOwnerForm initialData={editingOwner} onReset={close} isEditing={!!editingOwner} />}
      </CatalogFormSheet>
    </div>
  );
}
