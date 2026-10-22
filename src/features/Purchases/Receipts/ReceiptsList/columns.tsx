import { Badge } from '@/components/ui/badge';
import {
  matchesAnyId,
  matchesId,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { DocumentLinkList, DocumentNumberLink } from '../../components/DocumentLinks';
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
const formatDateOnly = (value: Date | string | null) => (value ? formatDateOnlyAr(value) : '-');

export function getColumns(): ColumnDef<PurchaseReceiptListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      ...titled('Número'),
      cell: ({ row }) => (
        <DocumentNumberLink href={`/dashboard/purchases/receipts/${row.original.id}`}>
          {row.original.number}
        </DocumentNumberLink>
      ),
    },
    {
      id: 'received_on',
      accessorKey: 'received_on',
      ...titled('Fecha de recepción'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.received_on)}</span>,
    },
    {
      id: 'order',
      accessorFn: (row) => row.order.number,
      ...titled('Orden de compra'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/orders/${row.original.order.id}`}
          className="font-mono text-sm text-brand-ink hover:underline"
        >
          {row.original.order.number}
        </Link>
      ),
      filterFn: matchesId((r) => r.order.id),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      ...titled('Proveedor'),
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
              <Link
                href={`/dashboard/purchases/orders/${row.original.order.id}`}
                className="text-brand-ink font-mono hover:underline"
              >
                {row.original.order.number}
              </Link>
            </>
          }
        />
      ),
      filterFn: matchesId((r) => r.supplier.id),
    },
    {
      id: 'warehouse',
      accessorFn: (row) => row.warehouse?.name ?? NO_WAREHOUSE_LABEL,
      ...titled('Depósito'),
      cell: ({ row }) =>
        row.original.warehouse ? (
          <span>{row.original.warehouse.name}</span>
        ) : (
          <span className="text-muted-foreground">{NO_WAREHOUSE_LABEL}</span>
        ),
      filterFn: matchesNullableId((r) => r.warehouse?.id),
    },
    {
      id: 'delivery_note',
      accessorKey: 'delivery_note',
      ...titled('Remito'),
      cell: ({ row }) => <span>{row.original.delivery_note ?? '-'}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => RECEIPT_STATUS_LABELS[statusOf(row)],
      ...titled('Estado'),
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
      ...titled('Solicitudes de origen'),
      // M:M (via lineas): no ordenable.
      enableSorting: false,
      cell: ({ row }) => (
        <DocumentLinkList
          items={row.original.requests}
          basePath="/dashboard/purchases/requests"
          className="max-w-[220px]"
        />
      ),
      filterFn: matchesAnyId((r) => r.requests.map((x) => x.id)),
    },
    {
      id: 'creator',
      accessorFn: (row) => row.creator.name,
      ...titled('Creó'),
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: matchesId((r) => r.creator.id),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Fecha de alta'),
      cell: ({ row }) => <span>{formatDateTime(row.original.created_at)}</span>,
    },
  ];
}
