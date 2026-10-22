'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ORDER_STATUS_UI, TONE_TO_BADGE, type BadgeVariant } from '@/features/Mantenimiento/lib/status-presentation';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { Wrench } from 'lucide-react';
import moment from 'moment';
import type { OtherEquipmentMaintenanceOrder } from './actions.server';

// ============================================================================
// LABELS
// ============================================================================

type StatusConfig = {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
};

/** Misma fuente que el resto de Mantenimiento (`lib/status-presentation`): el legajo no inventa vocabulario propio */
const STATUS_CONFIG: Record<string, StatusConfig> = Object.fromEntries(
  Object.entries(ORDER_STATUS_UI).map(([status, ui]) => [
    status,
    { label: ui.label, variant: TONE_TO_BADGE[ui.tone], icon: ui.icon },
  ])
);

const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  preventive: 'Preventivo',
  manual: 'Carga manual',
};

/** Columnas de contexto: útiles al investigar, ruido en el uso diario */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'description'];

// ============================================================================
// HELPERS
// ============================================================================

function itemLabels(order: OtherEquipmentMaintenanceOrder): string[] {
  return order.maintenance_order_items
    .map((item) => item.types_of_repairs?.name ?? item.description ?? '')
    .filter((label): label is string => label.length > 0);
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getOtherEquipmentMaintenanceColumns(): ColumnDef<OtherEquipmentMaintenanceOrder>[] {
  return [
    {
      id: 'order_number',
      accessorKey: 'order_number',
      ...titled('N° Orden'),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium tabular-nums">{row.original.order_number || '—'}</span>
      ),
    },

    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => {
        const status = row.original.status ?? '';
        const config = STATUS_CONFIG[status];
        if (!config) return <Badge variant="secondary">{status || 'Sin estado'}</Badge>;
        const Icon = config.icon;
        return (
          <Badge variant={config.variant} className="gap-1">
            <Icon aria-hidden="true" className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status ?? ''),
    },

    {
      id: 'source',
      accessorFn: (row) => row.maintenance_requests?.source ?? 'manual',
      ...titled('Origen'),
      cell: ({ row }) => {
        const source = row.original.maintenance_requests?.source ?? 'manual';
        return <span className="text-sm">{SOURCE_LABELS[source] ?? source}</span>;
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.maintenance_requests?.source ?? 'manual'),
    },

    {
      id: 'items',
      accessorFn: (row) => itemLabels(row).join(' '),
      meta: { title: 'Reparaciones' },
      header: 'Reparaciones',
      enableSorting: false,
      cell: ({ row }) => {
        const labels = itemLabels(row.original);
        if (labels.length === 0) return <span className="text-muted-foreground">—</span>;
        if (labels.length === 1) {
          return <span className="block max-w-[260px] truncate text-sm">{labels[0]}</span>;
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default gap-1">
                <Wrench aria-hidden="true" className="h-3 w-3" />
                {labels.length} reparaciones
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <ul className="list-disc space-y-0.5 pl-4">
                {labels.map((label, i) => (
                  <li key={i}>{label}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        );
      },
    },

    {
      id: 'scheduled_date',
      accessorKey: 'scheduled_date',
      ...titled('Fecha Planificada'),
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        // Sin fecha asignada todavía: no es lo mismo que "no tiene"
        return <span className="tabular-nums">{date ? moment.utc(date).format('DD/MM/YYYY') : 'Sin asignar'}</span>;
      },
    },

    {
      id: 'workshop_entry_date',
      accessorKey: 'workshop_entry_date',
      ...titled('Ingreso a Taller'),
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        return <span className="tabular-nums">{date ? formatArgentinaDay(date) : '—'}</span>;
      },
    },

    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Creada'),
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span className="tabular-nums">{date ? formatArgentinaDay(date) : '—'}</span>;
      },
    },

    {
      id: 'description',
      accessorFn: (row) => row.description ?? row.maintenance_requests?.description ?? '',
      ...titled('Descripción'),
      enableSorting: false,
      cell: ({ row }) => {
        const value = row.original.description ?? row.original.maintenance_requests?.description ?? '';
        if (!value) return <span className="text-muted-foreground">—</span>;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[280px] truncate text-sm">{value}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{value}</TooltipContent>
          </Tooltip>
        );
      },
    },
  ];
}
