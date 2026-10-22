'use client';

import {
  matchesAnyId,
  matchesColumnValue,
  matchesId,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDateTime, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DocumentLinkList, DocumentNumberLink } from '../../components/DocumentLinks';
import { PriceText } from '../../components/PriceText';
import { PurchaseOrderStatusBadge } from '../components/PurchaseOrderStatusBadge';
import type { PurchaseOrderListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['sent_at', 'creator', 'approver'];

/** Timestamps (alta, envío): fecha y hora argentinas. */
const formatDateTime = (value: Date | string | null) => (value ? formatArgentinaDateTime(value) : '-');
/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un día. */
const formatDateOnly = (value: Date | string | null) => (value ? formatDateOnlyAr(value) : '-');

export function getColumns({ canViewPrices }: { canViewPrices: boolean }): ColumnDef<PurchaseOrderListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      ...titled('Número'),
      cell: ({ row }) => (
        <DocumentNumberLink href={`/dashboard/purchases/orders/${row.original.id}`}>
          {row.original.number}
        </DocumentNumberLink>
      ),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      ...titled('Proveedor'),
      cell: ({ row }) => (
        <Link href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`} className="block hover:underline">
          <StackedCell primary={row.original.supplier.name} secondary={`CUIT ${row.original.supplier.cuit}`} />
        </Link>
      ),
      filterFn: matchesId((r) => r.supplier.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <PurchaseOrderStatusBadge status={row.original.status} />,
      filterFn: matchesColumnValue,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Fecha de alta'),
      cell: ({ row }) => <span>{formatDateTime(row.original.created_at)}</span>,
    },
    {
      id: 'delivery_date',
      accessorKey: 'delivery_date',
      ...titled('Fecha de entrega'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.delivery_date)}</span>,
    },
    {
      id: 'sent_at',
      accessorKey: 'sent_at',
      ...titled('Enviada'),
      cell: ({ row }) => <span>{formatDateTime(row.original.sent_at)}</span>,
    },
    {
      id: 'total',
      accessorKey: 'total',
      ...titled('Total'),
      // Sin `view_prices` el servidor ignora el orden por total.
      enableSorting: canViewPrices,
      cell: ({ row }) => <PriceText value={row.original.total} canViewPrices={canViewPrices} />,
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
      cell: ({ row }) => <StackedCell primary={row.original.creator.name} />,
      filterFn: matchesId((r) => r.creator.id),
    },
    {
      id: 'approver',
      accessorFn: (row) => row.approver?.name ?? '',
      ...titled('Aprobó'),
      cell: ({ row }) => <span>{row.original.approver?.name ?? '-'}</span>,
      filterFn: matchesNullableId((r) => r.approver?.id),
    },
  ];
}
