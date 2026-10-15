'use client';

import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import { PriceText } from '../../components/PriceText';
import { PurchaseQuoteStatusBadge } from '../components/PurchaseQuoteStatusBadge';
import type { PurchaseQuoteListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['sent_at', 'creator'];

/** Timestamps: dia en hora argentina, igual en el servidor y en cualquier navegador. */
const formatDateTime = (value: Date | string | null) => (value ? formatArgentinaDay(value) : '-');
/** Columnas DATE (sin hora): se leen en UTC para no correr un dia. */
const formatDateOnly = (value: Date | string | null) => (value ? moment.utc(value).format('DD/MM/YYYY') : '-');

const isExpired = (value: Date | string | null) =>
  value != null && moment.utc(value).format('YYYY-MM-DD') < argentinaDate();

export function getColumns({ canViewPrices }: { canViewPrices: boolean }): ColumnDef<PurchaseQuoteListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/quotes/${row.original.id}`}
          className="text-brand-ink font-mono text-sm font-medium hover:underline"
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
        <StackedCell
          primary={
            <Link
              href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`}
              className="text-brand-ink hover:underline"
            >
              {row.original.supplier.name}
            </Link>
          }
        />
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.supplier.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <PurchaseQuoteStatusBadge status={row.original.status} />,
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
      id: 'sent_at',
      accessorKey: 'sent_at',
      meta: { title: 'Enviada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Enviada" />,
      cell: ({ row }) => <span>{formatDateTime(row.original.sent_at)}</span>,
    },
    {
      id: 'received_at',
      accessorKey: 'received_at',
      meta: { title: 'Respondida' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Respondida" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.received_at)}</span>,
    },
    {
      id: 'valid_until',
      accessorKey: 'valid_until',
      meta: { title: 'Validez' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Validez" />,
      cell: ({ row }) => {
        const value = row.original.valid_until;
        if (!value) return <span>-</span>;
        return isExpired(value) ? (
          <span className="text-danger-subtle-foreground">{formatDateOnly(value)} (vencida)</span>
        ) : (
          <span>{formatDateOnly(value)}</span>
        );
      },
    },
    {
      id: 'total_quoted',
      accessorFn: (row) => row.total_quoted ?? '',
      meta: { title: 'Total cotizado' },
      // Derivado de las lineas (no es columna de BD): ni se ordena ni se filtra en el servidor.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total cotizado" />,
      cell: ({ row }) => <PriceText value={row.original.total_quoted} canViewPrices={canViewPrices} />,
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
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.creator.id),
    },
  ];
}
