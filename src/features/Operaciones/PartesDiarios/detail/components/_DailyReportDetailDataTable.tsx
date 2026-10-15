'use client';

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { CalendarCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { useDailyReportDetailFormStore } from '../../store/dailyReportDetailFormStore';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { getDailyReportDetailForExport } from '../export.server';
import { getDailyReportDetailPaginated } from '../queries.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, type RowActionHandlers } from '../columns';
import { DETAIL_PARAM_NAMESPACE, DETAIL_PREFS_ID, DETAIL_QUERY_PREFIX } from '../constants';
import { detailExportFormatters } from '../lib/export-formatters';
import { canAssignRow } from '../lib/row-permissions';
import { useDailyReportDetailInvalidation } from '../hooks/useDailyReportDetail';
import { useDetailFacets } from '../hooks/useDetailFacets';
import { useRowFormCatalogs } from '../hooks/useRowFormCatalogs';
import { useValidationData } from '../hooks/useValidationData';
import type { DailyReportDetailRow } from '../types';

// Lightweight modals — regular imports
import { BulkEditModal } from './BulkEditModal';
import { DeleteRowDialog } from './DeleteRowDialog';
import { DetailSelectionBar } from './DetailSelectionBar';
import { RowColorLegend, getRowClassName } from './RowColorLegend';
import { ServiceDetailDialog } from './ServiceDetailDialog';

// Heavy modals — dynamic imports with ssr:false
const DailyReportRowForm = dynamic(
  () => import('./DailyReportRowForm').then((m) => ({ default: m.DailyReportRowForm })),
  { ssr: false }
);

const HistoryDialog = dynamic(() => import('./HistoryDialog').then((m) => ({ default: m.HistoryDialog })), {
  ssr: false,
});

const CloneRowsDialog = dynamic(() => import('./CloneRowsDialog').then((m) => ({ default: m.CloneRowsDialog })), {
  ssr: false,
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Only 3 filters visible by default */
const DEFAULT_VISIBLE_FILTERS = ['status', 'customer', 'working_day'];

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: DailyReportDetailRow[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  dailyReportId: string;
  /** ISO date string of the daily report — used for employee diagram deviation detection */
  reportDate: string;
  canUpdate: boolean;
  canDelete: boolean;
  canAssignResources: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _DailyReportDetailDataTable({
  data,
  totalRows,
  searchParams,
  dailyReportId,
  reportDate,
  canUpdate,
  canDelete,
  canAssignResources,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getDailyReportDetailPaginated(dailyReportId, params, reportDate),
    [dailyReportId, reportDate]
  );

  // ── Query invalidation ────────────────────────────────────────────────────
  const { invalidateDetail } = useDailyReportDetailInvalidation();

  // ── Filtros facetados (lazy-load) ─────────────────────────────────────────
  const { facetedFilters, allFilterIds } = useDetailFacets(dailyReportId);

  // ── Datos de validaciones de desvíos (empleados y equipos) ───────────────
  const {
    isLoading: loadingValidations,
    getEmployeeDeviation,
    getEquipmentDeviation,
    getRowDeviationCount,
  } = useValidationData(dailyReportId, reportDate);

  // ── Zustand store for DailyReportRowForm Sheet ────────────────────────────
  const { isOpen: isFormOpen, open: openForm } = useDailyReportDetailFormStore();

  // ── Modal state ───────────────────────────────────────────────────────────
  const [deleteRow, setDeleteRow] = useState<DailyReportDetailRow | null>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [historyRowId, setHistoryRowId] = useState<string | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showClone, setShowClone] = useState(false);

  // ── Bulk action state ─────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<DailyReportDetailRow[]>([]);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);

  const clearSelection = useCallback(() => {
    setSelectedRows([]);
    setClearSelectionTrigger((value) => value + 1);
  }, []);

  // ── Form catalog data — lazy-load on first open ───────────────────────────
  const catalogs = useRowFormCatalogs(isFormOpen, reportDate);

  // ── Row action handlers ───────────────────────────────────────────────────
  const handlers: RowActionHandlers = useMemo(
    () => ({
      onViewDetail: (row) => setDetailRowId(row.id),
      onEdit: (row) => openForm(row.id),
      onAssignResources: (row) => openForm(row.id, 'resources'),
      onHistory: (row) => setHistoryRowId(row.id),
      onDelete: (row) => setDeleteRow(row),
    }),
    [openForm]
  );

  // ── Permissions ───────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({ canUpdate, canDelete, canAssignResources }),
    [canUpdate, canDelete, canAssignResources]
  );

  // ── Deviation getters (estables para el memo de columnas) ─────────────────
  const deviationGetters = useMemo(
    () => ({
      getEmployeeDeviation,
      getEquipmentDeviation,
      getRowDeviationCount,
      loadingValidations,
    }),
    [getEmployeeDeviation, getEquipmentDeviation, getRowDeviationCount, loadingValidations]
  );

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visible by default ──────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility, allFilterIds]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns(permissions, handlers, reportDate, deviationGetters),
    [permissions, handlers, reportDate, deviationGetters]
  );

  // ── Row className — indicadores visuales por origen de la línea ───────────
  const rowClassName = useCallback((row: DailyReportDetailRow) => getRowClassName(row, reportDate), [reportDate]);

  // ── Toolbar: "Clonar todo" (con selección, Clonar vive en la barra de selección) ─────────
  const toolbarActions = useMemo(() => {
    if (!canUpdate || selectedRows.length > 0) return null;
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setShowClone(true)}>
        <CalendarCheck aria-hidden="true" />
        Clonar todo
      </Button>
    );
  }, [canUpdate, selectedRows.length]);

  // ── Elegibilidad de "Asignar recursos" por línea (misma regla que el menú ⋯) ─────────
  const isAssignable = useCallback(
    (row: DailyReportDetailRow) => canAssignRow(row, permissions, reportDate),
    [permissions, reportDate]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // Un único proveedor de tooltips para toda la tabla (las celdas no crean uno por fila).
    <TooltipProvider delayDuration={150}>
      <DetailSelectionBar
        selectedRows={selectedRows}
        canUpdate={canUpdate}
        canAssignResources={canAssignResources}
        isAssignable={isAssignable}
        onBulkEdit={() => setShowBulkEdit(true)}
        onAssign={(row) => openForm(row.id, 'resources')}
        onClone={() => setShowClone(true)}
        onClear={clearSelection}
      />
      <RowColorLegend />
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={[DETAIL_QUERY_PREFIX, dailyReportId]}
        onStateChange={handleStateChange}
        tableId={DETAIL_PREFS_ID}
        paramNamespace={DETAIL_PARAM_NAMESPACE}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        showFilterToggle={true}
        showSearch
        mobileCards
        searchPlaceholder="Buscar por descripción, remito o jornada..."
        emptyMessage="No hay registros en este parte diario"
        enableRowSelection={true}
        showRowSelection={true}
        onRowSelectionChange={setSelectedRows}
        clearSelectionTrigger={clearSelectionTrigger}
        toolbarActions={toolbarActions}
        rowClassName={rowClassName}
        data-testid="daily-report-detail-table"
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getDailyReportDetailForExport(dailyReportId, currentParams)),
          options: {
            filename: 'detalle-parte-diario',
            sheetName: 'Detalle Parte Diario',
            title: 'Detalle de Parte Diario',
          },
          formatters: detailExportFormatters,
        }}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <DeleteRowDialog
        open={deleteRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRow(null);
        }}
        row={deleteRow}
        dailyReportId={dailyReportId}
        onSuccess={invalidateDetail}
      />

      <ServiceDetailDialog
        open={detailRowId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRowId(null);
        }}
        rowId={detailRowId}
      />

      <HistoryDialog
        open={historyRowId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryRowId(null);
        }}
        rowId={historyRowId}
      />

      <BulkEditModal
        open={showBulkEdit}
        onOpenChange={setShowBulkEdit}
        selectedRows={selectedRows}
        dailyReportId={dailyReportId}
        onSuccess={() => {
          invalidateDetail();
          clearSelection();
        }}
      />

      <CloneRowsDialog
        open={showClone}
        onOpenChange={setShowClone}
        mode={selectedRows.length > 0 ? 'selected' : 'all'}
        selectedRows={selectedRows}
        dailyReportId={dailyReportId}
        reportDate={reportDate}
        onSuccess={() => {
          invalidateDetail();
          clearSelection();
        }}
      />

      {isFormOpen && (
        <DailyReportRowForm
          dailyReportId={dailyReportId}
          reportDate={reportDate}
          customers={catalogs.customers}
          employees={catalogs.employees}
          vehicles={catalogs.vehicles}
          otherEquipment={catalogs.otherEquipment}
          onSuccess={invalidateDetail}
        />
      )}
    </TooltipProvider>
  );
}
