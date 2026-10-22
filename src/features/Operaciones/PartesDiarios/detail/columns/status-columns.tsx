'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportRowStatusLabels, dailyReportRowStatusTones } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Info } from 'lucide-react';
import type { DailyReportDetailRow } from '../types';
import { RowActionsCell } from './row-actions-cell';
import type { Permissions, RowActionHandlers } from './types';

// ============================================================================
// COLUMNAS — Jornada/horarios, estado, descripción, remito, completados
// ============================================================================

/** Columna booleana nullable "Completado" (día o noche): sí / no, o "—" si el campo no está cargado. */
function completedColumn(key: 'completed_day' | 'completed_night', title: string): ColumnDef<DailyReportDetailRow> {
  return {
    accessorKey: key,
    ...titled(title),
    cell: ({ row }) => {
      const val = row.original[key];
      if (val === null || val === undefined) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      return (
        <Badge variant={val ? 'success' : 'secondary'}>
          {val ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Sí
            </span>
          ) : (
            'No'
          )}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
  };
}

export function getStatusColumns(): ColumnDef<DailyReportDetailRow>[] {
  return [
    // ── Jornada (texto — valores discretos como turnos o fechas) ─────────────
    {
      accessorKey: 'working_day',
      ...titled('Jornada'),
      cell: ({ row }) => <span>{row.original.working_day ?? '—'}</span>,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Hora Inicio (texto) ───────────────────────────────────────────────────
    {
      accessorKey: 'start_time',
      ...titled('Hora Inicio'),
      cell: ({ row }) => {
        const val = row.original.start_time;
        if (!val) return <span className="text-muted-foreground text-xs">—</span>;
        // start_time is a Time(6) stored as Date by Prisma — format as HH:mm
        const d = new Date(val as unknown as string);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return <span>{`${hh}:${mm}`}</span>;
      },
      // filterFn not needed for text filters
    },

    // ── Hora Fin (texto) ──────────────────────────────────────────────────────
    {
      accessorKey: 'end_time',
      ...titled('Hora Fin'),
      cell: ({ row }) => {
        const val = row.original.end_time;
        if (!val) return <span className="text-muted-foreground text-xs">—</span>;
        const d = new Date(val as unknown as string);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return <span>{`${hh}:${mm}`}</span>;
      },
    },

    // ── Estado (enum NOT NULL) ────────────────────────────────────────────────
    {
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => {
        const val = row.original.status;
        const label = dailyReportRowStatusLabels[val] ?? val;
        const variant = dailyReportRowStatusTones[val] ?? 'default';

        // Ejecutado parcial: jornada 24h, no completamente ejecutado, pero al menos un turno completado
        const is24Hours = row.original.working_day?.toLowerCase() === 'jornada 24 horas';
        const completedDay = row.original.completed_day;
        const completedNight = row.original.completed_night;
        if (is24Hours && val !== 'ejecutado' && (completedDay || completedNight)) {
          return <Badge variant="info">Ejecutado parcial</Badge>;
        }

        // Cancelado con motivo → tooltip
        if (val === 'cancelado' && row.original.cancel_reason) {
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={variant} className="inline-flex items-center gap-1">
                    {label}
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs bg-black text-white rounded-lg p-2">
                  <p>{row.original.cancel_reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return <Badge variant={variant}>{label}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string;
        return value.includes(val);
      },
    },

    // ── Descripción (texto nullable) ──────────────────────────────────────────
    {
      accessorKey: 'description',
      ...titled('Descripción'),
      cell: ({ row }) => {
        const val = row.original.description;
        if (!val) return <span className="text-muted-foreground text-xs">—</span>;
        const truncated = val.length > 60 ? `${val.slice(0, 60)}…` : val;
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm cursor-default">{truncated}</span>
              </TooltipTrigger>
              {val.length > 60 && (
                <TooltipContent className="max-w-xs text-xs">
                  <p>{val}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },

    // ── Nro Remito (texto nullable) ───────────────────────────────────────────
    {
      accessorKey: 'remit_number',
      ...titled('Nro Remito'),
      cell: ({ row }) => <span>{row.original.remit_number ?? '—'}</span>,
    },

    completedColumn('completed_day', 'Completado Día'),
    completedColumn('completed_night', 'Completado Noche'),
  ];
}

// ============================================================================
// COLUMNA — Acciones
// ============================================================================

export function getActionsColumn(
  permissions: Permissions,
  handlers: RowActionHandlers,
  reportDate: string
): ColumnDef<DailyReportDetailRow> {
  return {
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <RowActionsCell row={row.original} permissions={permissions} handlers={handlers} reportDate={reportDate} />
    ),
  };
}
