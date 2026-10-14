'use client';

import { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { CriticalDeviationsRepairModal } from '@/features/Mantenimiento/shared/components/critical-deviations-repair-modal';
import { Logger } from '@/lib/logger';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableFilterOption,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQueryClient } from '@tanstack/react-query';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllEquipmentsWithDeviationsForExport,
  getEquipmentsWithDeviationsPaginated,
  getEquipmentsWithDeviationsSingleFacet,
  type EquipmentWithDeviationsListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

const logger = new Logger('_EquiposConDesviosDataTable');

const QUERY_KEY = ['equipments-with-deviations-list'];

type Deviation = {
  id: string;
  item_code: string;
  item_label: string;
  section_code: string | null;
  is_critical: boolean;
  checklistAnswerId: string | null;
  created_at: string;
};

interface Props {
  data: EquipmentWithDeviationsListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// HELPERS — FacetResult builder
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

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _EquiposConDesviosDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const queryClient = useQueryClient();

  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deviations, setDeviations] = useState<Deviation[]>([]);

  // ─── Client-side navigation mode ─────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentsWithDeviationsPaginated(params), []);

  // ─── Lazy-load facet factory (solo columnas FK) ───────────────────────────
  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEquipmentsWithDeviationsSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    []
  );

  // ─── Modal de resolución de desvíos críticos ─────────────────────────────
  const handleResolveDeviations = useCallback(async (equipmentId: string) => {
    try {
      // Mismo criterio que la agregación de la tabla: solo desvíos que todavía
      // no pertenecen a ninguna solicitud.
      const pendingDeviations = await getPendingDeviations(equipmentId, { onlyWithoutRequest: true });
      setDeviations(
        pendingDeviations.map((d) => ({
          id: d.id,
          item_code: d.item_code,
          item_label: d.item_label,
          section_code: d.section_code,
          is_critical: d.is_critical ?? false,
          checklistAnswerId: d.checklist_answer_id,
          created_at: d.created_at?.toISOString() ?? new Date().toISOString(),
        }))
      );
      setSelectedEquipmentId(equipmentId);
      setShowModal(true);
    } catch (error) {
      logger.error('Error loading deviations', { data: { error } });
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setSelectedEquipmentId(null);
    setDeviations([]);
    // Refrescar la tabla: los desvíos resueltos ya no deben aparecer
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(handleResolveDeviations), [handleResolveDeviations]);

  // Columnas ocultas por defecto (unir preferencias guardadas con las del sistema)
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Filtros visibles por defecto: los que el cliente pidió priorizar (ticket 672).
  const DEFAULT_VISIBLE_FILTERS = ['type', 'sub_type', 'sector'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['type_of_vehicle', 'type', 'sub_type', 'sector', 'domain', 'serie', 'intern_number'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── Filtros facetados — lazy-load con fetchFacet ─────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'type_of_vehicle',
        title: 'Categoría',
        fetchFacet: makeFkFetchFacet('type_of_vehicle'),
      },
      {
        columnId: 'type',
        title: 'Tipo de Unidad',
        fetchFacet: makeFkFetchFacet('type'),
      },
      {
        columnId: 'sub_type',
        title: 'Subtipo de Unidad',
        fetchFacet: makeFkFetchFacet('sub_type'),
      },
      {
        columnId: 'sector',
        title: 'Sector',
        fetchFacet: makeFkFetchFacet('sector'),
      },
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
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
    ],
    [makeFkFetchFacet]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={QUERY_KEY}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por dominio, serie, N° interno..."
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        tableId={tableId}
        paramNamespace={tableId}
        showFilterToggle={true}
        emptyMessage="No hay equipos con desvíos pendientes."
        data-testid="equipments-with-deviations-table"
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getAllEquipmentsWithDeviationsForExport(currentParams)),
          options: {
            filename: 'equipos-con-desvios',
            title: 'Equipos con Desvíos Pendientes',
            sheetName: 'Equipos con Desvíos',
          },
          formatters: {
            last_deviation_date: (val) => (val ? formatArgentinaDateTime(val as string) : ''),
          },
        }}
      />

      {showModal && selectedEquipmentId && (
        <CriticalDeviationsRepairModal
          isOpen={showModal}
          onClose={handleCloseModal}
          onComplete={handleCloseModal}
          deviations={deviations}
          equipmentId={selectedEquipmentId}
        />
      )}
    </>
  );
}
