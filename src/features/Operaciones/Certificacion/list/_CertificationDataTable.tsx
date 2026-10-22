'use client';

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DETAIL_QUERY_PREFIX } from '@/features/Operaciones/PartesDiarios/detail/constants';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useDailyReportFormStore } from '@/shared/store/useDailyReportFormStore';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { RowColorLegend } from '../../PartesDiarios/detail/components/RowColorLegend';
import {
  getCertificationRowsForExport,
  getCertificationRowsPaginated,
  type CertificationRow,
} from '../actions/queries.server';
import { BulkCertificacionModal } from '../components/BulkCertificacionModal';
import { certificationExportFormatters } from '../components/export-formatters';
import { getCertificationColumns, getCertificationRowClassName, type CertificationRowHandlers } from './columns';
import { CERTIFICATION_PARAM_NAMESPACE, CERTIFICATION_QUERY_KEY, DEFAULT_VISIBLE_FILTERS } from './constants';
import { useCertificationFacets } from './useCertificationFacets';

// Los modales pesados se cargan al abrirse, no con la tabla.
const HistoryDialog = dynamic(
  () =>
    import('@/features/Operaciones/PartesDiarios/detail/components/HistoryDialog').then((m) => ({
      default: m.HistoryDialog,
    })),
  { ssr: false }
);
const RemitosManagerModal = dynamic(
  () =>
    import('@/features/Operaciones/PartesDiarios/remitManager/components/RemitosManagerModal').then((m) => ({
      default: m.RemitosManagerModal,
    })),
  { ssr: false }
);

interface Props {
  data: CertificationRow[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

export function _CertificationDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const queryClient = useQueryClient();
  const { canUpdate } = usePermissions();
  const canEdit = canUpdate('comercial', 'daily_reports');
  const { openForCreate, openForEdit } = useDailyReportFormStore();

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCertificationRowsPaginated(params), []);

  // ── Filtros facetados (lazy-load) y estado de vista; `currentParams` hace que el export respete lo que se ve ──
  const { facetedFilters } = useCertificationFacets();
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: [],
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ── Estado de modales y selección ─────────────────────────────────────────
  const [historyRowId, setHistoryRowId] = useState<string | null>(null);
  const [remitosRow, setRemitosRow] = useState<{ id: string; customer: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<CertificationRow[]>([]);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedRows([]);
    setClearSelectionTrigger((value) => value + 1);
  }, []);

  const handlers: CertificationRowHandlers = useMemo(
    () => ({
      onEdit: (row) => openForEdit(row),
      onViewHistory: (row) => setHistoryRowId(row.id),
      onManageRemitos: (row) => setRemitosRow({ id: row.id, customer: row.customer }),
    }),
    [openForEdit]
  );

  const columns = useMemo(() => getCertificationColumns(canEdit, handlers), [canEdit, handlers]);

  const handleBulkSuccess = useCallback(() => {
    // La tabla y los conteos de los filtros dependen del estado de las líneas.
    queryClient.invalidateQueries({ queryKey: [...CERTIFICATION_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    queryClient.invalidateQueries({ queryKey: [DETAIL_QUERY_PREFIX, 'row-history'] });
    clearSelection();
  }, [queryClient, clearSelection]);

  const toolbarActions = (
    <PermissionGuard module="comercial" tab="daily_reports" action="create">
      <Button type="button" size="sm" onClick={openForCreate}>
        <Plus aria-hidden="true" />
        Crear línea
      </Button>
    </PermissionGuard>
  );

  const count = selectedRows.length;

  return (
    // Un único proveedor de tooltips para toda la tabla (las celdas no crean uno por fila).
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
        <div role="region" aria-label="Acciones sobre la selección">
          {/* Región viva SIEMPRE montada: una que aparece junto con su texto no se anuncia. */}
          <p role="status" className="sr-only">
            {count === 0 ? '' : count === 1 ? '1 línea seleccionada' : `${count} líneas seleccionadas`}
          </p>
          {canEdit && count > 0 ? (
            <div className="border-brand/40 bg-brand-subtle text-brand-subtle-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
              <span aria-hidden="true" className="mr-auto text-sm font-medium tabular-nums">
                {count === 1 ? '1 línea seleccionada' : `${count} líneas seleccionadas`}
              </span>
              <Button type="button" size="sm" onClick={() => setShowBulkModal(true)}>
                <CheckCircle2 aria-hidden="true" />
                Enviar a certificación
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                <X aria-hidden="true" />
                Limpiar selección
              </Button>
            </div>
          ) : null}
        </div>

        <RowColorLegend showDeviations={false} />

        <DataTable
          {...tableProps}
          columns={columns}
          data={data}
          totalRows={totalRows}
          queryFn={tableQueryFn}
          queryKey={[...CERTIFICATION_QUERY_KEY]}
          paramNamespace={CERTIFICATION_PARAM_NAMESPACE}
          showSearch
          mobileCards
          searchPlaceholder="Buscar por cliente, servicio, ítem, descripción, remito, empleado (legajo o nombre) o equipo..."
          emptyMessage="No se encontraron líneas para los filtros seleccionados."
          // Solo se puede certificar lo ejecutado.
          enableRowSelection={canEdit ? (row) => row.original.status === 'ejecutado' : false}
          showRowSelection={canEdit}
          onRowSelectionChange={setSelectedRows}
          clearSelectionTrigger={clearSelectionTrigger}
          toolbarActions={toolbarActions}
          rowClassName={getCertificationRowClassName}
          data-testid="certification-table"
          exportConfig={{
            fetchAllData: async () => unwrapExportResult(await getCertificationRowsForExport(currentParams)),
            options: {
              filename: 'partes-diarios-comercial',
              sheetName: 'Partes Diarios',
              title: 'Partes Diarios - Comercial',
            },
            formatters: certificationExportFormatters,
          }}
        />
      </div>

      {/* Historial de cambios de la línea */}
      <HistoryDialog
        open={historyRowId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryRowId(null);
        }}
        rowId={historyRowId}
      />

      {/* Gestión de remitos (líneas en certificación) */}
      {remitosRow ? (
        <RemitosManagerModal
          dailyReportRowId={remitosRow.id}
          customerName={remitosRow.customer}
          isOpen
          onClose={() => setRemitosRow(null)}
        />
      ) : null}

      {/* Actualización masiva a "En certificación" */}
      <BulkCertificacionModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedRows={selectedRows}
        onSuccess={handleBulkSuccess}
      />
    </TooltipProvider>
  );
}
