'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Circle, Eye, History, Play } from 'lucide-react';
import type { EquipmentOrderRow } from '../../lib/actions/vehicle-operations-actions';
import type { SectorProgress } from '../../lib/equipment-order-summary';
import { ORDER_STATUS_ICONS, ORDER_STATUS_VARIANTS, getOrderStatusLabel, isOrderStatus } from '../../lib/order-status';

const SECTOR_PROGRESS_LABELS: Record<SectorProgress, string> = {
  completed: 'Completado',
  in_progress: 'En progreso',
  pending: 'Pendiente',
};

const SECTOR_PROGRESS_ICONS = { completed: CheckCircle2, in_progress: Play, pending: Circle };

interface OrderColumnsOptions {
  onViewDetail: (order: EquipmentOrderRow) => void;
  onViewHistory: (order: EquipmentOrderRow) => void;
}

export function getEquipmentOrderColumns({
  onViewDetail,
  onViewHistory,
}: OrderColumnsOptions): ColumnDef<EquipmentOrderRow>[] {
  return [
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.order_number || '-'}</span>,
    },
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        if (!isOrderStatus(status)) return <Badge variant="outline">{getOrderStatusLabel(status)}</Badge>;

        const Icon = ORDER_STATUS_ICONS[status];
        return (
          <Badge variant={ORDER_STATUS_VARIANTS[status]} className="gap-1">
            <Icon className="h-3 w-3" />
            {getOrderStatusLabel(status)}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status ?? ''),
    },
    {
      accessorKey: 'workshop_entry_date',
      id: 'workshop_entry_date',
      meta: { title: 'Ingreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        return <span className="text-sm">{date ? formatArgentinaDay(date) : '-'}</span>;
      },
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Creada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creada" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span className="text-sm">{date ? formatArgentinaDay(date) : '-'}</span>;
      },
    },
    {
      // Los sectores son una relación 1:N de la orden (por sus ítems): no se ordena, sí se filtra.
      id: 'sector',
      accessorFn: (row) => row.sectors.map((sector) => sector.name).join(' → '),
      meta: { title: 'Sectores' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sectores" />,
      cell: ({ row }) => {
        const { sectors } = row.original;
        if (sectors.length === 0) return <Badge variant="outline">Sin asignar</Badge>;

        return (
          <div className="flex items-center gap-1">
            {sectors.map((sector, index) => {
              const Icon = SECTOR_PROGRESS_ICONS[sector.status];
              return (
                <Tooltip key={sector.id}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      {index > 0 && <span className="text-muted-foreground text-[10px]">&rarr;</span>}
                      <Badge
                        variant={
                          sector.status === 'completed'
                            ? 'secondary'
                            : sector.status === 'in_progress'
                              ? 'info'
                              : 'outline'
                        }
                        className={`text-[10px] gap-1 ${sector.status === 'completed' ? 'opacity-50 line-through' : ''}`}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {sector.name}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      {sector.name} — {SECTOR_PROGRESS_LABELS[sector.status]}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const { sectors } = row.original;
        if (sectors.length === 0) return value.includes(NULL_FILTER_VALUE);
        return sectors.some((sector) => value.includes(sector.id));
      },
    },
    {
      // Calculadas en el servidor a partir de los ítems de la orden: no tienen campo propio que ordenar o filtrar.
      accessorKey: 'itemsCount',
      id: 'itemsCount',
      meta: { title: 'Items' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => <span className="text-sm">{row.original.itemsCount}</span>,
    },
    {
      accessorKey: 'workOrdersCount',
      id: 'workOrdersCount',
      meta: { title: 'OTs' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="OTs" />,
      cell: ({ row }) => <span className="text-sm">{row.original.workOrdersCount}</span>,
    },
    {
      id: 'progress',
      accessorFn: (row) => `${row.progress}%`,
      meta: { title: 'Progreso' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Progreso" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-[100px]">
          <Progress value={row.original.progress} className="h-2 flex-1" aria-label="Progreso de la orden" />
          <span className="text-xs text-muted-foreground tabular-nums">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => onViewDetail(row.original)}>
            <Eye className="h-4 w-4 mr-1" />
            Detalle
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Ver historial completo"
                onClick={() => onViewHistory(row.original)}
                className="text-purple-600 hover:text-purple-700"
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver historial completo</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];
}
