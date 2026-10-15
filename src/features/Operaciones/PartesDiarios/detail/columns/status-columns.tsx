'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportRowStatusBadges, dailyReportRowStatusLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, CircleDashed, Info } from 'lucide-react';
import { DAILY_REPORT_ROW_STATUS_ICONS } from '../../lib/daily-report-status-ui';
import { remitNumbersOf } from '../../remitManager/lib/remit-numbers';
import type { DailyReportDetailRow } from '../types';
import { RowActionsCell } from './row-actions-cell';
import type { Permissions, RowActionHandlers } from './types';

// ============================================================================
// COLUMNAS — Jornada/horarios, estado, descripción, remito, completados
// ============================================================================

export function getStatusColumns(): ColumnDef<DailyReportDetailRow>[] {
  return [
    // ── Jornada (texto — valores discretos como turnos o fechas) ─────────────
    {
      accessorKey: 'working_day',
      meta: { title: 'Jornada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jornada" />,
      cell: ({ row }) =>
        row.original.working_day ? (
          <span>{row.original.working_day}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Hora Inicio (texto) ───────────────────────────────────────────────────
    {
      accessorKey: 'start_time',
      meta: { title: 'Hora Inicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora Inicio" />,
      cell: ({ row }) => {
        const val = row.original.start_time;
        if (!val) return <span className="text-muted-foreground">-</span>;
        // start_time is a Time(6) stored as Date by Prisma — format as HH:mm
        const d = new Date(val as unknown as string);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return <span className="font-mono tabular-nums">{`${hh}:${mm}`}</span>;
      },
      // filterFn not needed for text filters
    },

    // ── Hora Fin (texto) ──────────────────────────────────────────────────────
    {
      accessorKey: 'end_time',
      meta: { title: 'Hora Fin' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora Fin" />,
      cell: ({ row }) => {
        const val = row.original.end_time;
        if (!val) return <span className="text-muted-foreground">-</span>;
        const d = new Date(val as unknown as string);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return <span className="font-mono tabular-nums">{`${hh}:${mm}`}</span>;
      },
    },

    // ── Estado (enum NOT NULL) ────────────────────────────────────────────────
    {
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const val = row.original.status;
        const label = dailyReportRowStatusLabels[val] ?? val;
        const variant = dailyReportRowStatusBadges[val] ?? 'default';

        // Ejecutado parcial: jornada 24h, no completamente ejecutado, pero al menos un turno completado
        const is24Hours = row.original.working_day?.toLowerCase() === 'jornada 24 horas';
        const completedDay = row.original.completed_day;
        const completedNight = row.original.completed_night;
        if (is24Hours && val !== 'ejecutado' && (completedDay || completedNight)) {
          return (
            <Badge variant="info">
              <CircleDashed aria-hidden="true" />
              Ejecutado parcial
            </Badge>
          );
        }
        const Icon = DAILY_REPORT_ROW_STATUS_ICONS[val];

        // Cancelado con motivo → tooltip
        if (val === 'cancelado' && row.original.cancel_reason) {
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={variant}>
                    {Icon && <Icon aria-hidden="true" />}
                    {label}
                    <Info aria-label="Ver motivo" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{row.original.cancel_reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return (
          <Badge variant={variant}>
            {Icon && <Icon aria-hidden="true" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string;
        return value.includes(val);
      },
    },

    // ── Descripción (texto nullable) ──────────────────────────────────────────
    {
      accessorKey: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const val = row.original.description;
        if (!val) return <span className="text-muted-foreground">-</span>;
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

    // ── Remitos (1:N, tabla `remitos`) ────────────────────────────────────────
    // Mantiene el id `remit_number` para no perder el filtro ni las preferencias guardadas.
    // Sin orden: una línea puede tener varios remitos (misma regla que las columnas M:M).
    {
      id: 'remit_number',
      accessorFn: (row) => remitNumbersOf(row).join(', '),
      meta: { title: 'Remitos' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Remitos" />,
      cell: ({ row }) => {
        const numbers = remitNumbersOf(row.original);
        if (numbers.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {numbers.map((number) => (
              <Badge key={number} variant="outline" className="font-mono tabular-nums">
                {number}
              </Badge>
            ))}
          </div>
        );
      },
    },

    // ── Completado Día (booleano nullable) ────────────────────────────────────
    {
      accessorKey: 'completed_day',
      meta: { title: 'Completado Día' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Completado Día" />,
      cell: ({ row }) => {
        const val = row.original.completed_day;
        if (val === null || val === undefined) {
          return <span className="text-muted-foreground">-</span>;
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
    },

    // ── Completado Noche (booleano nullable) ──────────────────────────────────
    {
      accessorKey: 'completed_night',
      meta: { title: 'Completado Noche' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Completado Noche" />,
      cell: ({ row }) => {
        const val = row.original.completed_night;
        if (val === null || val === undefined) {
          return <span className="text-muted-foreground">-</span>;
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
    },
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
