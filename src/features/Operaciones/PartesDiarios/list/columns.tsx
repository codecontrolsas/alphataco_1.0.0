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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StackedCell } from '@/features/Operaciones/shared/components/StackedCell';
import { SegmentedProgress } from '@/features/Operaciones/shared/components/SegmentedProgress';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { formatCalendarDate, formatWeekday } from '@/shared/utils/calendar-date';
import { dailyReportStatusLabels, dailyReportStatusTones } from '@/shared/utils/mappers';
import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteDailyReport } from '../actions/mutations.server';
import { DAILY_REPORTS_QUERY_KEY } from './constants';
import { buildProgressSegments, summarizeStatusCountMap } from '../lib/status-progress';
import type { DailyReportListItem } from './actions.server';

// Columnas ocultas por defecto (visibilidad inicial)
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['creation_date'];

// Tipo de permisos recibidos desde el servidor
type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ── Helpers de presentación ───────────────────────────────────────────────────

/** Resumen de líneas por estado y avance de un parte (fórmula compartida con el detalle). */
function getSummary(row: DailyReportListItem) {
  return summarizeStatusCountMap(Object.entries(row.statusCounts));
}

// ── Cell de eliminación con confirmación ──────────────────────────────────────
function DeleteDailyReportCell({ row }: { row: { original: DailyReportListItem } }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const hasRows = getSummary(row.original).total > 0;
  const dateLabel = formatCalendarDate(row.original.date);

  const handleDelete = async () => {
    toast.promise(
      async () => {
        const result = await deleteDailyReport(row.original.id);
        // La acción devuelve el motivo en vez de lanzar: sin esto la pantalla decía "eliminado" aunque no se hubiera borrado.
        if (!result.success) throw new Error(result.message);
        // El prefijo ['daily-reports'] incluye la tabla (['daily-reports', 'list', …]).
        queryClient.invalidateQueries({ queryKey: [...DAILY_REPORTS_QUERY_KEY] });
        queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
        // Las tarjetas de arriba son Server Components: se refrescan con la ruta.
        router.refresh();
      },
      {
        loading: 'Eliminando parte diario...',
        success: 'Parte diario eliminado correctamente',
        error: 'Error al eliminar el parte diario',
      }
    );
  };

  // Un botón deshabilitado no recibe foco ni hover: el motivo va en un tooltip sobre un `span` enfocable.
  if (hasRows) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                className="text-danger hover:text-danger"
                disabled
                aria-label={`Eliminar el parte del ${dateLabel} (no disponible: tiene líneas)`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="max-w-xs text-xs">No se puede eliminar un parte con líneas.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-danger hover:text-danger"
          aria-label={`Eliminar el parte del ${dateLabel}`}
          title="Eliminar parte diario"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar el parte del {dateLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El parte diario será eliminado permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className={buttonVariants({ variant: 'destructive' })}>
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Definición de columnas ────────────────────────────────────────────────────
export function getColumns(permissions: Permissions): ColumnDef<DailyReportListItem>[] {
  const canDelete = permissions.hasPermission('operaciones', 'dailyreportstable', 'delete');

  return [
    // ── Fecha del parte diario (apilada con el día de la semana) ────────────
    {
      accessorKey: 'date',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => (
        <StackedCell
          mono
          primary={formatCalendarDate(row.original.date)}
          secondary={formatWeekday(row.original.date)}
          maxWidthClass="max-w-[160px]"
        />
      ),
    },

    // ── Estado del parte diario (enum) ─────────────────────────────────────
    {
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        const label = dailyReportStatusLabels[status] ?? status.replaceAll('_', ' ');
        const variant = dailyReportStatusTones[status] ?? 'default';
        return (
          <Badge variant={variant} className="whitespace-nowrap">
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },

    // ── Líneas (virtual — total de dailyreportrows) ────────────────────────
    {
      id: 'total',
      meta: { title: 'Líneas', excludeFromExport: true },
      enableSorting: false,
      accessorFn: (row) => getSummary(row).total,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Líneas" />,
      cell: ({ row }) => <span className="font-mono tabular-nums">{getSummary(row.original).total}</span>,
    },

    // ── Pendientes (virtual — líneas con status pendiente) ─────────────────
    {
      id: 'pendientes',
      meta: { title: 'Pendientes', excludeFromExport: true },
      enableSorting: false,
      accessorFn: (row) => getSummary(row).pending,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pendientes" />,
      cell: ({ row }) => {
        const count = getSummary(row.original).pending;
        return count > 0 ? (
          <Badge variant="warning" className="font-mono tabular-nums">
            {count}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },

    // ── Sin recursos (virtual — líneas con status sin_recursos_asignados) ──
    {
      id: 'sin_recursos',
      meta: { title: 'Sin recursos', excludeFromExport: true },
      enableSorting: false,
      accessorFn: (row) => getSummary(row).withoutResources,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sin recursos" />,
      cell: ({ row }) => {
        const count = getSummary(row.original).withoutResources;
        return count > 0 ? (
          <Badge variant="destructive" className="font-mono tabular-nums">
            {count}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },

    // ── Avance (virtual — barra segmentada) ────────────────────────────────
    {
      id: 'progress',
      meta: { title: 'Avance', excludeFromExport: true },
      enableSorting: false,
      accessorFn: (row) => getSummary(row).percent,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Avance" />,
      cell: ({ row }) => {
        const summary = getSummary(row.original);
        if (summary.progressTotal <= 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex min-w-[140px] max-w-[200px] flex-col gap-1">
            <SegmentedProgress
              label="Avance del parte"
              total={summary.progressTotal}
              segments={buildProgressSegments(summary, 'executable')}
            />
            <span className="text-muted-foreground text-xs tabular-nums">
              {summary.progressDone} de {summary.progressTotal} · {summary.percent}%
            </span>
          </div>
        );
      },
    },

    // ── Fecha de creación (oculta por defecto) ─────────────────────────────
    {
      accessorKey: 'creation_date',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.creation_date ? formatCalendarDate(row.original.creation_date) : '—'}
        </span>
      ),
    },

    // ── Activo (solo lectura: no hay mutación de is_active) ────────────────
    {
      accessorKey: 'is_active',
      meta: { title: 'Activo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Activo" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val == null) return value.includes('true');
        return value.includes(String(val));
      },
    },

    // ── Acciones (abrir + eliminar) ────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/operations/${row.original.id}`}
              aria-label={`Abrir el parte del ${formatCalendarDate(row.original.date)}`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir
            </Link>
          </Button>
          {canDelete && <DeleteDailyReportCell row={row} />}
        </div>
      ),
    },
  ];
}
