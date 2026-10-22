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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import { preparteStatusBadges, preparteStatusLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { PreparteListItem } from './actions.server';

/** Etiquetas de estado: viven en `mappers.ts`; se re-exportan para quien ya las importaba de acá. */
export const PREPARTE_STATUS_LABELS: Record<string, string> = preparteStatusLabels;

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'customer',
  'service',
  'serviceItem',
  'sector',
  'area',
  'customerEquipment',
  'quantity',
  'tipo',
  'jornada',
  'start_time',
  'end_time',
  'reason',
  'confirmed_by',
  'rejectedBy',
  'cancelledBy',
  'reprogrammedBy',
  'observaciones',
  'preparteImage',
];

export interface PreparteConfirmation {
  confirmedBy: string;
  executionDate?: string;
}

export interface PreparteTableCallbacks {
  onView: (item: PreparteListItem) => void;
  onEdit: (item: PreparteListItem) => void;
  onDelete: (id: string) => Promise<void> | void;
  /** Abre el diálogo de confirmación del pedido (lo monta el manager, no cada fila). */
  onConfirmRequest: (item: PreparteListItem) => void;
  onBulkStatus: (items: PreparteListItem[]) => void;
}

interface GetColumnsOptions {
  permissionsMap: Record<string, boolean>;
  callbacks: PreparteTableCallbacks;
}

export function formatPreparteType(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getPreparteReason(item: PreparteListItem): string {
  if (item.status === 'cancelado') return item.cancel_reason || '-';
  if (item.status === 'rechazado') return item.rejected_reason || '-';
  if (item.status === 'reprogramado') return item.reprogram_reason || '-';
  return '-';
}

function ImageCell({ url }: { url: string | null }) {
  const [open, setOpen] = useState(false);
  if (!url) return <span className="text-muted-foreground">-</span>;

  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Ver archivo adjunto del pedido"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ver {isPdf ? 'documento' : 'imagen'}</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>{isPdf ? 'Documento PDF' : 'Imagen subida del pedido'}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[75vh] w-full items-center justify-center overflow-auto">
            {isPdf ? (
              <iframe src={url} title="Documento del pedido" className="h-[70vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Adjunto del pedido" className="max-h-[70vh] max-w-full object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionsCell({ item, callbacks, canUpdate, canDelete }: {
  item: PreparteListItem;
  callbacks: PreparteTableCallbacks;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const isPending = item.status === 'pendiente';
  const isExpired = item.status === 'vencido';
  const canConfirm =
    canUpdate &&
    (isPending || isExpired) &&
    Boolean(item.executionDate) &&
    !(item.subject_to_availability && !item.executionDate);
  const orderLabel = item.numero_pedido ?? '';

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => callbacks.onView(item)}
            aria-label={`Ver detalle del pedido ${orderLabel}`.trim()}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ver detalle</TooltipContent>
      </Tooltip>

      {canUpdate && isPending && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => callbacks.onEdit(item)}
              aria-label={`Editar pedido ${orderLabel}`.trim()}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar</TooltipContent>
        </Tooltip>
      )}

      {canDelete && isPending && (
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  data-testid={`eliminar-button-${item.numero_pedido}`}
                  aria-label={`Eliminar pedido ${orderLabel}`.trim()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Eliminar</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El pedido será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => callbacks.onDelete(item.id)} className="bg-destructive">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canUpdate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canConfirm}
              className="text-ok hover:text-ok"
              onClick={() => callbacks.onConfirmRequest(item)}
              data-testid={`confirmar-button-${item.numero_pedido}`}
              aria-label={`Confirmar pedido ${orderLabel}`.trim()}
            >
              <Check className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{item.status === 'confirmado' ? 'Ya confirmado' : 'Confirmar pedido'}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function getColumns({ permissionsMap, callbacks }: GetColumnsOptions): ColumnDef<PreparteListItem>[] {
  const canUpdate = permissionsMap['operaciones:preparte:update'] === true;
  const canDelete = permissionsMap['operaciones:preparte:delete'] === true;

  const columns: ColumnDef<PreparteListItem>[] = [];
  if (canUpdate) {
    columns.push({
      id: 'select',
      meta: { excludeFromExport: true },
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          aria-label="Seleccionar todos los pedidos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          aria-label="Seleccionar pedido"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    });
  }

  columns.push(
    {
      accessorKey: 'numero_pedido',
      meta: { title: 'N° pedido' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° pedido" />,
      cell: ({ row }) =>
        row.original.numero_pedido ? (
          <button
            type="button"
            onClick={() => callbacks.onView(row.original)}
            aria-label={`Ver detalle del pedido ${row.original.numero_pedido}`}
            className="focus-visible:ring-ring rounded-sm text-left font-mono text-sm font-semibold tabular-nums hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {row.original.numero_pedido}
          </button>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'requestDate',
      meta: { title: 'Fecha de solicitud' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitud" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{formatCalendarDate(row.original.requestDate)}</span>
      ),
    },
    {
      accessorKey: 'executionDate',
      meta: { title: 'Fecha de ejecución' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ejecución" />,
      cell: ({ row }) =>
        row.original.subject_to_availability && !row.original.executionDate ? (
          <Badge variant="outline">A disponibilidad</Badge>
        ) : (
          <span className="font-mono text-sm tabular-nums">{formatCalendarDate(row.original.executionDate)}</span>
        ),
    },
    {
      id: 'order_customer',
      meta: { title: 'Cliente y contrato', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => (
        <StackedCell
          primary={row.original.customers?.name || 'No encontrado'}
          secondary={row.original.customer_services?.service_name}
          maxWidthClass="max-w-[260px]"
        />
      ),
      enableSorting: false,
    },
    {
      id: 'order_item',
      meta: { title: 'Ítem y cantidad', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ítem" />,
      cell: ({ row }) => {
        const { quantity, tipo } = row.original;
        const type = tipo ? formatPreparteType(tipo) : '';
        const detail = quantity != null ? `${quantity} × ${type || 'unidad'}` : type;
        return (
          <StackedCell
            primary={row.original.service_items?.item_name || 'No encontrado'}
            secondary={detail}
            maxWidthClass="max-w-[260px]"
          />
        );
      },
      enableSorting: false,
    },
    {
      id: 'order_shift',
      meta: { title: 'Jornada y horario', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jornada" />,
      cell: ({ row }) => {
        const { jornada, start_time, end_time } = row.original;
        const schedule = start_time && end_time ? `${start_time}–${end_time}` : start_time || end_time || '';
        return <StackedCell primary={jornada || '-'} secondary={schedule} maxWidthClass="max-w-[180px]" />;
      },
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={status ? (preparteStatusBadges[status] ?? 'default') : 'outline'}
            className="whitespace-nowrap"
            data-testid={`status-badge-${row.original.numero_pedido}`}
          >
            {status ? (preparteStatusLabels[status] ?? status) : 'Sin estado'}
          </Badge>
        );
      },
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customers?.name ?? '-',
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => row.original.customers?.name || 'No encontrado',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.cliente_id),
    },
    {
      id: 'service',
      accessorFn: (row) => row.customer_services?.service_name ?? '-',
      meta: { title: 'Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contrato" />,
      cell: ({ row }) => row.original.customer_services?.service_name || 'No encontrado',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.contrato_id),
    },
    {
      id: 'sector',
      accessorFn: (row) => row.service_sectors?.sectors?.name ?? '-',
      meta: { title: 'Sector (cliente)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector (cliente)" />,
      cell: ({ row }) => row.original.service_sectors?.sectors?.name || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.sector_service_id ?? '__null__'),
    },
    {
      id: 'area',
      accessorFn: (row) => row.service_areas?.areas_cliente?.nombre ?? '-',
      meta: { title: 'Área (cliente)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Área (cliente)" />,
      cell: ({ row }) => row.original.service_areas?.areas_cliente?.nombre || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.areas_service_id ?? '__null__'),
    },
    {
      id: 'customerEquipment',
      accessorFn: (row) => row.equipos_clientes?.name ?? '-',
      meta: { title: 'Equipo cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo cliente" />,
      cell: ({ row }) => row.original.equipos_clientes?.name || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.equipos_cliente ?? '__null__'),
    },
    {
      id: 'serviceItem',
      accessorFn: (row) => row.service_items?.item_name ?? '-',
      meta: { title: 'Ítem' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ítem" />,
      cell: ({ row }) => row.original.service_items?.item_name || 'No encontrado',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.item ?? '__null__'),
    },
    {
      accessorKey: 'quantity',
      meta: { title: 'Cantidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad" />,
      cell: ({ row }) => row.original.quantity ?? '-',
    },
    {
      accessorKey: 'tipo',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => formatPreparteType(row.original.tipo),
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      accessorKey: 'jornada',
      meta: { title: 'Jornada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jornada" />,
      cell: ({ row }) => row.original.jornada || '-',
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      accessorKey: 'start_time',
      meta: { title: 'Hora de inicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora de inicio" />,
      cell: ({ row }) => row.original.start_time || '-',
    },
    {
      accessorKey: 'end_time',
      meta: { title: 'Hora de fin' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora de fin" />,
      cell: ({ row }) => row.original.end_time || '-',
    },
    {
      accessorKey: 'solicitante',
      meta: { title: 'Solicitante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitante" />,
      cell: ({ row }) => row.original.solicitante || '-',
    },
    {
      id: 'reason',
      accessorFn: getPreparteReason,
      meta: { title: 'Motivo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo" />,
      cell: ({ row }) => {
        const reason = getPreparteReason(row.original);
        return <div className="max-w-[320px] truncate" title={reason}>{reason}</div>;
      },
      enableSorting: false,
    },
    {
      accessorKey: 'confirmed_by',
      meta: { title: 'Confirmado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Confirmado por" />,
      cell: ({ row }) => row.original.confirmed_by || '-',
    },
    {
      id: 'rejectedBy',
      accessorFn: (row) => row.rejected_by_profile?.fullname ?? '-',
      meta: { title: 'Rechazado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rechazado por" />,
      cell: ({ row }) => row.original.rejected_by_profile?.fullname || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.rejected_by ?? '__null__'),
      enableSorting: false,
    },
    {
      id: 'cancelledBy',
      accessorFn: (row) => row.cancelled_by_profile?.fullname ?? '-',
      meta: { title: 'Cancelado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cancelado por" />,
      cell: ({ row }) => row.original.cancelled_by_profile?.fullname || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.cancelled_by ?? '__null__'),
      enableSorting: false,
    },
    {
      id: 'reprogrammedBy',
      accessorFn: (row) => row.reprogrammed_by_profile?.fullname ?? '-',
      meta: { title: 'Reprogramado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reprogramado por" />,
      cell: ({ row }) => row.original.reprogrammed_by_profile?.fullname || '-',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.reprogrammed_by ?? '__null__'),
      enableSorting: false,
    },
    {
      accessorKey: 'observaciones',
      meta: { title: 'Observaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
      cell: ({ row }) => {
        const observations = row.original.observaciones || '-';
        return <div className="max-w-[360px] truncate" title={observations}>{observations}</div>;
      },
    },
    {
      accessorKey: 'preparteImage',
      meta: { title: 'Imagen' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Imagen" />,
      cell: ({ row }) => <ImageCell url={row.original.preparteImage} />,
      enableSorting: false,
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: 'Acciones' },
      header: 'Acciones',
      cell: ({ row }) => (
        <ActionsCell item={row.original} callbacks={callbacks} canUpdate={canUpdate} canDelete={canDelete} />
      ),
      enableSorting: false,
      enableHiding: false,
    }
  );

  return columns;
}
