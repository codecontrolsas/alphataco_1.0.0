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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Pencil, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import type { PreparteListItem } from './actions.server';

export const PREPARTE_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  reprogramado: 'Reprogramado',
  cancelado: 'Cancelado',
  rechazado: 'Rechazado',
  vencido: 'Vencido',
};

export const HIDDEN_COLUMNS_BY_DEFAULT = [
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

function statusBadgeVariant(
  status: PreparteListItem['status']
): NonNullable<React.ComponentProps<typeof Badge>['variant']> {
  if (status === 'confirmado') return 'success';
  if (status === 'cancelado' || status === 'rechazado' || status === 'vencido') return 'destructive';
  if (status === 'reprogramado') return 'warning';
  return 'default';
}

function ImageCell({ url }: { url: string | null }) {
  const [open, setOpen] = useState(false);
  if (!url) return <span className="text-muted-foreground">-</span>;

  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ver archivo adjunto">
              <Eye className="h-4 w-4" />
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
  const [executionDate, setExecutionDate] = useState(moment().format('YYYY-MM-DD'));
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
      ...(isExpired ? { executionDate } : {}),
    });
    setConfirmOpen(false);
    setConfirmedBy('');
  };

  return (
    <div className="flex items-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => callbacks.onView(item)} aria-label="Ver detalle">
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver detalle</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {canUpdate && isPending && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => callbacks.onEdit(item)} aria-label="Editar pedido">
                <Pencil className="h-4 w-4" />
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
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    data-testid={`eliminar-button-${item.numero_pedido}`}
                    aria-label="Eliminar pedido"
                  >
                    <Trash2 className="h-4 w-4" />
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
              <AlertDialogAction onClick={() => callbacks.onDelete(item.id)} className="bg-destructive">
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
                size="icon"
                disabled={!canConfirm}
                className="text-green-600 hover:text-green-700"
                onClick={() => setConfirmOpen(true)}
                data-testid={`confirmar-button-${item.numero_pedido}`}
                aria-label="Confirmar pedido"
              >
                <Check className="h-4 w-4" />
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
                <Input
                  id={`execution-date-${item.id}`}
                  type="date"
                  min={moment().format('YYYY-MM-DD')}
                  value={executionDate}
                  onChange={(event) => setExecutionDate(event.target.value)}
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
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
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
      accessorKey: 'requestDate',
      meta: { title: 'Fecha de solicitud' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de solicitud" />,
      cell: ({ row }) => formatPreparteDate(row.original.requestDate),
    },
    {
      accessorKey: 'executionDate',
      meta: { title: 'Fecha de ejecución', mobile: { role: 'field', priority: 1, label: 'Ejecución' } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de ejecución" />,
      cell: ({ row }) =>
        row.original.subject_to_availability && !row.original.executionDate ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
            Pendiente de fecha
          </Badge>
        ) : (
          formatPreparteDate(row.original.executionDate)
        ),
    },
    {
      accessorKey: 'numero_pedido',
      meta: { title: 'N° pedido', mobile: { role: 'title', priority: 1 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° pedido" />,
      cell: ({ row }) => row.original.numero_pedido || '-',
    },
    {
      accessorKey: 'status',
      meta: { title: 'Estado', mobile: { role: 'status' } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <Badge
          variant={statusBadgeVariant(row.original.status)}
          className={cn('whitespace-nowrap', row.original.status === 'pendiente' && 'bg-black text-white')}
          data-testid={`status-badge-${row.original.numero_pedido}`}
        >
          {row.original.status ? PREPARTE_STATUS_LABELS[row.original.status] : 'Sin estado'}
        </Badge>
      ),
      filterFn: (row, id, values: string[]) => values.includes(String(row.getValue(id))),
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customers?.name ?? '-',
      meta: { title: 'Cliente', mobile: { role: 'title', priority: 2 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => row.original.customers?.name || 'No encontrado',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.cliente_id),
    },
    {
      id: 'service',
      accessorFn: (row) => row.customer_services?.service_name ?? '-',
      meta: { title: 'Contrato', mobile: { role: 'subtitle' } },
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
      meta: { title: 'Ítem', mobile: { role: 'field', priority: 2 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ítem" />,
      cell: ({ row }) => row.original.service_items?.item_name || 'No encontrado',
      filterFn: (row, _id, values: string[]) => values.includes(row.original.item ?? '__null__'),
    },
    {
      accessorKey: 'quantity',
      meta: { title: 'Cantidad', mobile: { role: 'field', priority: 3 } },
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
      meta: { excludeFromExport: true },
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
