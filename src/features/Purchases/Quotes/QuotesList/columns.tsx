'use client';

import {
  matchesAnyId,
  matchesColumnValue,
  matchesId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { argentinaDate, formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import { DocumentLinkList, DocumentNumberLink } from '../../components/DocumentLinks';
import { PriceText } from '../../components/PriceText';
import { PurchaseQuoteStatusBadge } from '../components/PurchaseQuoteStatusBadge';
import type { PurchaseQuoteListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['sent_at', 'creator'];

/** Timestamps: dia en hora argentina, igual en el servidor y en cualquier navegador. */
const formatDateTime = (value: Date | string | null) => (value ? formatArgentinaDay(value) : '-');
/** Columnas DATE (sin hora): se leen en UTC para no correr un dia. */
const formatDateOnly = (value: Date | string | null) => (value ? formatDateOnlyAr(value) : '-');

const isExpired = (value: Date | string | null) =>
  value != null && moment.utc(value).format('YYYY-MM-DD') < argentinaDate();

export function getColumns({ canViewPrices }: { canViewPrices: boolean }): ColumnDef<PurchaseQuoteListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      ...titled('Número'),
      cell: ({ row }) => (
        <DocumentNumberLink href={`/dashboard/purchases/quotes/${row.original.id}`}>
          {row.original.number}
        </DocumentNumberLink>
      ),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      ...titled('Proveedor'),
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
      filterFn: matchesId((r) => r.supplier.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <PurchaseQuoteStatusBadge status={row.original.status} />,
      filterFn: matchesColumnValue,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Fecha de alta'),
      cell: ({ row }) => <span>{formatDateTime(row.original.created_at)}</span>,
    },
    {
      id: 'sent_at',
      accessorKey: 'sent_at',
      ...titled('Enviada'),
      cell: ({ row }) => <span>{formatDateTime(row.original.sent_at)}</span>,
    },
    {
      id: 'received_at',
      accessorKey: 'received_at',
      ...titled('Respondida'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.received_at)}</span>,
    },
    {
      id: 'valid_until',
      accessorKey: 'valid_until',
      ...titled('Validez'),
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
      ...titled('Total cotizado'),
      // Derivado de las lineas (no es columna de BD): ni se ordena ni se filtra en el servidor.
      enableSorting: false,
      cell: ({ row }) => <PriceText value={row.original.total_quoted} canViewPrices={canViewPrices} />,
    },
    {
      id: 'requests',
      accessorFn: (row) => row.requests.map((r) => r.number).join(', '),
      ...titled('Solicitudes de origen'),
      // M:M (via lineas): no ordenable.
      enableSorting: false,
      cell: ({ row }) => <DocumentLinkList items={row.original.requests} basePath="/dashboard/purchases/requests" />,
      filterFn: matchesAnyId((r) => r.requests.map((x) => x.id)),
    },
    {
      id: 'creator',
      accessorFn: (row) => row.creator.name,
      ...titled('Creó'),
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: matchesId((r) => r.creator.id),
    },
  ];
}
