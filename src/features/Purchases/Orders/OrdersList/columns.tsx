'use client';

import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { PriceText } from '../../components/PriceText';
import { PurchaseOrderStatusBadge } from '../components/PurchaseOrderStatusBadge';
import type { PurchaseOrderListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['sent_at', 'creator', 'approver'];

/** Timestamps (alta, envío): fecha y hora argentinas. */
const formatDateTime = (value: Date | string | null) => (value ? formatArgentinaDateTime(value) : '-');
/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un día. */
const formatDateOnly = (value: Date | string | null) =>
  value ? formatDateAr(new Date(value).toISOString().slice(0, 10)) : '-';

export function getColumns({ canViewPrices }: { canViewPrices: boolean }): ColumnDef<PurchaseOrderListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/orders/${row.original.id}`}
          className="font-mono text-sm font-medium text-brand-ink hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => (
        <Link href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`} className="block hover:underline">
          <StackedCell primary={row.original.supplier.name} secondary={`CUIT ${row.original.supplier.cuit}`} />
        </Link>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.supplier.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <PurchaseOrderStatusBadge status={row.original.status} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{formatDateTime(row.original.created_at)}</span>,
    },
    {
      id: 'delivery_date',
      accessorKey: 'delivery_date',
      meta: { title: 'Fecha de entrega' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de entrega" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.delivery_date)}</span>,
    },
    {
      id: 'sent_at',
      accessorKey: 'sent_at',
      meta: { title: 'Enviada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Enviada" />,
      cell: ({ row }) => <span>{formatDateTime(row.original.sent_at)}</span>,
    },
    {
      id: 'total',
      accessorKey: 'total',
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      // Sin `view_prices` el servidor ignora el orden por total.
      enableSorting: canViewPrices,
      cell: ({ row }) => <PriceText value={row.original.total} canViewPrices={canViewPrices} />,
    },
    {
      id: 'requests',
      accessorFn: (row) => row.requests.map((r) => r.number).join(', '),
      meta: { title: 'Solicitudes de origen' },
      // M:M (via lineas): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitudes de origen" />,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-x-2">
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
      cell: ({ row }) => <StackedCell primary={row.original.creator.name} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.creator.id),
    },
    {
      id: 'approver',
      accessorFn: (row) => row.approver?.name ?? '',
      meta: { title: 'Aprobó' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aprobó" />,
      cell: ({ row }) => <span>{row.original.approver?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.approver?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
  ];
}
