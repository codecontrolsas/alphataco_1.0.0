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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Check, Eye, Paperclip, Pencil, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { PREPARTE_STATUS_LABELS, PREPARTE_STATUS_UI } from '../lib/preparte-status-ui';
import type { PreparteListItem } from './actions.server';

export { PREPARTE_STATUS_LABELS };

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  // Su dato ya se ve en la columna compuesta 'order'
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
  onConfirm: (item: PreparteListItem, confirmation: PreparteConfirmation) => Promise<void> | void;
  onBulkStatus: (items: PreparteListItem[]) => void;
}

interface GetColumnsOptions {
  permissionsMap: Record<string, boolean>;
  callbacks: PreparteTableCallbacks;
}

export function formatPreparteDate(value: string | null | undefined): string {
  return value ? moment.utc(value).format('DD/MM/YYYY') : '-';
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

function EmptyCell() {
  return <span className="text-muted-foreground">-</span>;
}

/** Texto plano o `-` atenuado si no hay valor. */
function TextCell({ value }: { value: string | number | null | undefined }) {
  if (value == null || value === '') return <EmptyCell />;
  return <>{value}</>;
}

/** Fecha de una columna `@db.Date` (medianoche UTC) en monoespaciada. */
function DateCell({ value }: { value: string | null | undefined }) {
  if (!value) return <EmptyCell />;
  return <span className="font-mono tabular-nums">{formatPreparteDate(value)}</span>;
}

/** Hora (HH:mm) en monoespaciada. */
function TimeCell({ value }: { value: string | null | undefined }) {
  if (!value) return <EmptyCell />;
  return <span className="font-mono tabular-nums">{value}</span>;
}

/** Badge del estado del pedido: label, ícono y color salen de `PREPARTE_STATUS_UI`. */
export function PreparteStatusBadge({
  status,
  'data-testid': testId,
}: {
  status: PreparteListItem['status'];
  'data-testid'?: string;
}) {
  if (!status) return <Badge variant="outline">Sin estado</Badge>;
  const ui = PREPARTE_STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <Badge variant={ui.variant} data-testid={testId}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}

function ImageCell({ url }: { url: string | null }) {
  const [open, setOpen] = useState(false);
  if (!url) return <EmptyCell />;

  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Ver archivo adjunto">
              <Paperclip className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver {isPdf ? 'documento' : 'imagen'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedBy, setConfirmedBy] = useState('');
  const [executionDate, setExecutionDate] = useState<Date | undefined>(() => moment().startOf('day').toDate());
  const isPending = item.status === 'pendiente';
  const isExpired = item.status === 'vencido';
  const canConfirm =
    canUpdate &&
    (isPending || isExpired) &&
    Boolean(item.executionDate) &&
    !(item.subject_to_availability && !item.executionDate);

  const submitConfirmation = async () => {
    if (!confirmedBy.trim()) return;
    await callbacks.onConfirm(item, {
      confirmedBy: confirmedBy.trim(),
      ...(isExpired && executionDate ? { executionDate: moment(executionDate).format('YYYY-MM-DD') } : {}),
    });
    setConfirmOpen(false);
    setConfirmedBy('');
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => callbacks.onView(item)} aria-label="Ver detalle">
              <Eye className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver detalle</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {canUpdate && isPending && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => callbacks.onEdit(item)} aria-label="Editar pedido">
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Editar</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {canDelete && isPending && (
        <AlertDialog>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-danger-subtle-foreground hover:text-danger-subtle-foreground"
                    data-testid={`eliminar-button-${item.numero_pedido}`}
                    aria-label="Eliminar pedido"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Eliminar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El pedido será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => callbacks.onDelete(item.id)}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canUpdate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!canConfirm}
                className="text-ok-subtle-foreground hover:text-ok-subtle-foreground"
                onClick={() => setConfirmOpen(true)}
                data-testid={`confirmar-button-${item.numero_pedido}`}
                aria-label="Confirmar pedido"
              >
                <Check className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{item.status === 'confirmado' ? 'Ya confirmado' : 'Confirmar pedido'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isExpired ? 'Confirmar pedido vencido' : '¿Confirmar pedido?'}</DialogTitle>
            <DialogDescription>
              El pedido se enviará al parte diario correspondiente a la fecha de ejecución.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isExpired && (
              <div className="space-y-2">
                <Label htmlFor={`execution-date-${item.id}`}>Fecha de ejecución</Label>
                <EnhancedDatePicker
                  id={`execution-date-${item.id}`}
                  date={executionDate}
                  setDate={setExecutionDate}
                  minDate={moment().startOf('day').toDate()}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`confirmed-by-${item.id}`}>Confirmado por</Label>
              <Input
                id={`confirmed-by-${item.id}`}
                value={confirmedBy}
                onChange={(event) => setConfirmedBy(event.target.value)}
                placeholder="Ingrese el nombre de quien confirma"
                data-testid="confirmado-por-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitConfirmation}
              disabled={!confirmedBy.trim() || (isExpired && !executionDate)}
              data-testid="confirmar-modal-button"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => callbacks.onView(row.original)}
          className="text-foreground hover:text-brand-ink font-mono font-semibold tabular-nums hover:underline"
        >
          {row.original.numero_pedido || 'Sin número'}
        </button>
      ),
    },
    {
      // Identidad compuesta: cliente arriba; contrato e ítem debajo
      id: 'order',
      accessorFn: (row) => row.customers?.name ?? '',
      meta: { title: 'Pedido', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido" />,
      cell: ({ row }) => {
        const item = row.original;
        const details = [item.customer_services?.service_name, item.service_items?.item_name]
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="max-w-[360px] min-w-0">
            <div className="text-foreground truncate font-semibold">{item.customers?.name || 'Cliente no encontrado'}</div>
            {details && <div className="text-muted-foreground truncate text-sm">{details}</div>}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <PreparteStatusBadge
          status={row.original.status}
          data-testid={`status-badge-${row.original.numero_pedido}`}
        />
      ),
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      accessorKey: 'executionDate',
      meta: { title: 'Fecha de ejecución' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de ejecución" />,
      cell: ({ row }) =>
        row.original.subject_to_availability && !row.original.executionDate ? (
          <Badge variant="warning">
            <CalendarClock aria-hidden="true" />
            Pendiente de fecha
          </Badge>
        ) : (
          <DateCell value={row.original.executionDate} />
        ),
    },
    {
      accessorKey: 'requestDate',
      meta: { title: 'Fecha de solicitud' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de solicitud" />,
      cell: ({ row }) => <DateCell value={row.original.requestDate} />,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customers?.name ?? '-',
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => <TextCell value={row.original.customers?.name} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.cliente_id),
    },
    {
      id: 'service',
      accessorFn: (row) => row.customer_services?.service_name ?? '-',
      meta: { title: 'Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contrato" />,
      cell: ({ row }) => <TextCell value={row.original.customer_services?.service_name} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.contrato_id),
    },
    {
      id: 'serviceItem',
      accessorFn: (row) => row.service_items?.item_name ?? '-',
      meta: { title: 'Ítem' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ítem" />,
      cell: ({ row }) => <TextCell value={row.original.service_items?.item_name} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.item ?? '__null__'),
    },
    {
      id: 'sector',
      accessorFn: (row) => row.service_sectors?.sectors?.name ?? '-',
      meta: { title: 'Sector (cliente)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector (cliente)" />,
      cell: ({ row }) => <TextCell value={row.original.service_sectors?.sectors?.name} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.sector_service_id ?? '__null__'),
    },
    {
      id: 'area',
      accessorFn: (row) => row.service_areas?.areas_cliente?.nombre ?? '-',
      meta: { title: 'Área (cliente)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Área (cliente)" />,
      cell: ({ row }) => <TextCell value={row.original.service_areas?.areas_cliente?.nombre} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.areas_service_id ?? '__null__'),
    },
    {
      id: 'customerEquipment',
      accessorFn: (row) => row.equipos_clientes?.name ?? '-',
      meta: { title: 'Equipo cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo cliente" />,
      cell: ({ row }) => <TextCell value={row.original.equipos_clientes?.name} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.equipos_cliente ?? '__null__'),
    },
    {
      accessorKey: 'quantity',
      meta: { title: 'Cantidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad" />,
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.quantity ?? '-'}</span>,
    },
    {
      accessorKey: 'tipo',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => <TextCell value={row.original.tipo ? formatPreparteType(row.original.tipo) : null} />,
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      accessorKey: 'jornada',
      meta: { title: 'Jornada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jornada" />,
      cell: ({ row }) => <TextCell value={row.original.jornada} />,
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      accessorKey: 'start_time',
      meta: { title: 'Hora de inicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora de inicio" />,
      cell: ({ row }) => <TimeCell value={row.original.start_time} />,
    },
    {
      accessorKey: 'end_time',
      meta: { title: 'Hora de fin' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hora de fin" />,
      cell: ({ row }) => <TimeCell value={row.original.end_time} />,
    },
    {
      accessorKey: 'solicitante',
      meta: { title: 'Solicitante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitante" />,
      cell: ({ row }) => <TextCell value={row.original.solicitante} />,
    },
    {
      id: 'reason',
      accessorFn: getPreparteReason,
      meta: { title: 'Motivo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo" />,
      cell: ({ row }) => {
        const reason = getPreparteReason(row.original);
        if (reason === '-') return <EmptyCell />;
        return (
          <div className="max-w-[320px] truncate" title={reason}>
            {reason}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'confirmed_by',
      meta: { title: 'Confirmado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Confirmado por" />,
      cell: ({ row }) => <TextCell value={row.original.confirmed_by} />,
    },
    {
      id: 'rejectedBy',
      accessorFn: (row) => row.rejected_by_profile?.fullname ?? '-',
      meta: { title: 'Rechazado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rechazado por" />,
      cell: ({ row }) => <TextCell value={row.original.rejected_by_profile?.fullname} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.rejected_by ?? '__null__'),
      enableSorting: false,
    },
    {
      id: 'cancelledBy',
      accessorFn: (row) => row.cancelled_by_profile?.fullname ?? '-',
      meta: { title: 'Cancelado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cancelado por" />,
      cell: ({ row }) => <TextCell value={row.original.cancelled_by_profile?.fullname} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.cancelled_by ?? '__null__'),
      enableSorting: false,
    },
    {
      id: 'reprogrammedBy',
      accessorFn: (row) => row.reprogrammed_by_profile?.fullname ?? '-',
      meta: { title: 'Reprogramado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reprogramado por" />,
      cell: ({ row }) => <TextCell value={row.original.reprogrammed_by_profile?.fullname} />,
      filterFn: (row, _id, values: string[]) => values.includes(row.original.reprogrammed_by ?? '__null__'),
      enableSorting: false,
    },
    {
      accessorKey: 'observaciones',
      meta: { title: 'Observaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
      cell: ({ row }) => {
        const observations = row.original.observaciones;
        if (!observations) return <EmptyCell />;
        return (
          <div className="max-w-[360px] truncate" title={observations}>
            {observations}
          </div>
        );
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
      meta: { excludeFromExport: true, title: '' },
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <ActionsCell item={row.original} callbacks={callbacks} canUpdate={canUpdate} canDelete={canDelete} />
      ),
      enableSorting: false,
      enableHiding: false,
    }
  );

  return columns;
}
