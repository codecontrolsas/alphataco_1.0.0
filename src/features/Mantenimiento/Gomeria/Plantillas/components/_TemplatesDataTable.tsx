'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { Plus } from 'lucide-react';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { deleteTemplate } from '../actions/template-crud.server';
import {
  getTemplatesForExport,
  getTemplatesPaginated,
  type TemplateListItem,
} from '../actions/actions.server';
import { TemplateAssignDialog } from './TemplateAssignDialog';
import { TemplateForm } from './TemplateForm';
import { computePositionCount, getColumns, templateSizesStatusLabels } from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['name', 'created_at'];

const ALL_FILTER_IDS = ['name', 'description', 'created_at'];

// ============================================================================
// TYPES
// ============================================================================

interface TemplatesDataTableProps {
  data: TemplateListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _TemplatesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: TemplatesDataTableProps) {
  // ─── Permissions ──────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const queryClient = useQueryClient();
  const canCreate = permissions.hasPermission('mantenimiento', 'plantillas_cubiertas', 'create');

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateListItem | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Assign dialog state
  const [assigningTemplate, setAssigningTemplate] = useState<TemplateListItem | null>(null);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTemplatesPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(
        permissions,
        (t) => setEditingTemplate(t),
        (t) => setDeletingTemplate(t),
        (t) => setAssigningTemplate(t)
      ),
    [permissions]
  );

  // ─── Filter visibility ────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── Faceted filters (text + dateRange only for templates) ───────────────
  const facetedFilters = useMemo(
    () => [
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    []
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = canCreate ? (
    <Button variant="brand" size="sm" onClick={() => setShowCreateForm(true)}>
      <Plus className="mr-2 size-4" />
      Nueva plantilla
    </Button>
  ) : undefined;

  // ─── Delete handler ───────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (!deletingTemplate) return;
    setIsDeleting(true);
    try {
      await deleteTemplate(deletingTemplate.id);
      toast.success('Plantilla eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['tire-templates'] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      setDeletingTemplate(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar la plantilla');
    } finally {
      setIsDeleting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        toolbarActions={toolbarActions}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={['tire-templates']}
        onStateChange={handleStateChange}
        emptyMessage="No hay plantillas registradas"
        searchPlaceholder="Buscar por nombre..."
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getTemplatesForExport(currentParams)),
          options: {
            filename: 'plantillas-cubiertas',
            sheetName: 'Plantillas',
            title: 'Plantillas de Cubiertas',
          },
          formatters: {
            created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
            axle_count: (_value, row) => String(row._count?.axles ?? 0),
            position_count: (_value, row) => String(computePositionCount(row)),
            sizes_status: (value) => templateSizesStatusLabels[value as string] ?? String(value ?? '-'),
            description: (value) => (value ? String(value) : '-'),
          },
        }}
      />

      {/* ─── Create template form ───────────────────────────────────────── */}
      <TemplateForm open={showCreateForm} onOpenChange={setShowCreateForm} queryKey={['tire-templates']} />

      {/* ─── Edit template form ─────────────────────────────────────────── */}
      <TemplateForm
        open={editingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate ?? undefined}
        queryKey={['tire-templates']}
      />

      {/* ─── Delete confirmation dialog ──────────────────────────────────── */}
      <AlertDialog
        open={deletingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la plantilla <strong>{deletingTemplate?.name}</strong>. Esta acción no se puede deshacer. Si
              la plantilla está asignada a vehículos, no podrá eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Assign template to vehicle dialog ───────────────────────────── */}
      <TemplateAssignDialog
        templateId={assigningTemplate?.id ?? ''}
        templateName={assigningTemplate?.name ?? ''}
        open={assigningTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setAssigningTemplate(null);
        }}
      />
    </>
  );
}
