import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { RECEIPT_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import type { PurchaseReceiptListItem } from './actions.server';
import { RECEIPT_STATUS_ACTIVE, RECEIPT_STATUS_CANCELLED } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['order', 'created_at', 'creator'];

/** Etiquetas e íconos del estado (derivado de `cancelled_at`): salen de `lib/status-presentation.ts`. */
export const RECEIPT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(RECEIPT_STATUS_UI).map(([value, ui]) => [value, ui.label])
);
export const receiptStatusIcons: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(RECEIPT_STATUS_UI).map(([value, ui]) => [value, ui.icon])
);

export const NO_WAREHOUSE_LABEL = 'Sin depósito (servicios)';

const statusOf = (row: PurchaseReceiptListItem) => (row.cancelled ? RECEIPT_STATUS_CANCELLED : RECEIPT_STATUS_ACTIVE);
/** Timestamps: dia en hora argentina, igual en el servidor y en cualquier navegador. */
const formatDateTime = (value: Date | string | null) => (value ? formatArgentinaDay(value) : '-');
/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un dia. */
const formatDateOnly = (value: Date | string | null) =>
  value ? formatDateAr(new Date(value).toISOString().slice(0, 10)) : '-';

export function getColumns(): ColumnDef<PurchaseReceiptListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/receipts/${row.original.id}`}
          className="font-mono text-sm font-medium text-brand-ink hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'received_on',
      accessorKey: 'received_on',
      meta: { title: 'Fecha de recepción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de recepción" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.received_on)}</span>,
    },
    {
      id: 'order',
      accessorFn: (row) => row.order.number,
      meta: { title: 'Orden de compra' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Orden de compra" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/orders/${row.original.order.id}`}
          className="font-mono text-sm text-brand-ink hover:underline"
        >
          {row.original.order.number}
        </Link>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.order.id),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => (
        <StackedCell
          maxWidthClass="max-w-[260px]"
          primary={
            <Link
              href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`}
              className="text-brand-ink hover:underline"
            >
              {row.original.supplier.name}
            </Link>
          }
          secondary={
            <>
              OC{' '}
              <Link href={`/dashboard/purchases/orders/${row.original.order.id}`} className="text-brand-ink font-mono hover:underline">
                {row.original.order.number}
              </Link>
            </>
          }
        />
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.supplier.id),
    },
    {
      id: 'warehouse',
      accessorFn: (row) => row.warehouse?.name ?? NO_WAREHOUSE_LABEL,
      meta: { title: 'Depósito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Depósito" />,
      cell: ({ row }) =>
        row.original.warehouse ? (
          <span>{row.original.warehouse.name}</span>
        ) : (
          <span className="text-muted-foreground">{NO_WAREHOUSE_LABEL}</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.warehouse?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'delivery_note',
      accessorKey: 'delivery_note',
      meta: { title: 'Remito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Remito" />,
      cell: ({ row }) => <span>{row.original.delivery_note ?? '-'}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => RECEIPT_STATUS_LABELS[statusOf(row)],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const ui = RECEIPT_STATUS_UI[statusOf(row.original)];
        const Icon = ui.icon;
        return (
          <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(statusOf(row.original)),
    },
    {
      id: 'requests',
      accessorFn: (row) => row.requests.map((r) => r.number).join(', '),
      meta: { title: 'Solicitudes de origen' },
      // M:M (via lineas): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitudes de origen" />,
      cell: ({ row }) => (
        <div className="flex max-w-[220px] flex-wrap gap-x-2">
          {row.original.requests.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/purchases/requests/${r.id}`}
              className="font-mono text-sm text-brand-ink hover:underline"
            >
              {r.number}
            </Link>
          ))}
        </div>
      ),
      filterFn: (row, _id, value: string[]) => row.original.requests.some((r) => value.includes(r.id)),
    },
    {
      id: 'creator',
      accessorFn: (row) => row.creator.name,
      meta: { title: 'Creó' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creó" />,
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.creator.id),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{formatDateTime(row.original.created_at)}</span>,
    },
  ];
}
