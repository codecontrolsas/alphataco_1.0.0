'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { matchesAnyIdOrNone, matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DocumentLinkList } from '../../components/DocumentLinks';
import { ARCA_CHECK_LABELS, SUPPLIER_INVOICE_STATUS_LABELS } from '../../lib/invoice-status';
import { SupplierInvoiceStatusBadge } from '../components/SupplierInvoiceStatusBadge';
import type { SupplierInvoiceListItem } from './actions.server';
import { NO_ARCA_CHECK_LABEL, NO_ORDER_LABEL } from './constants';

export const cbteTypeLabel = (id: number) => (isCbteTypeId(id) ? CBTE_TYPES[id].label : String(id));

const arcaLabel = (value: SupplierInvoiceListItem['arca_check_result']) =>
  value ? ARCA_CHECK_LABELS[value] : NO_ARCA_CHECK_LABEL;

/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un día. */
const formatDateOnly = (value: Date | string | null) => (value ? formatDateOnlyAr(value) : '-');

export function getColumns(): ColumnDef<SupplierInvoiceListItem>[] {
  return [
    {
      id: 'number',
      accessorFn: (row) => row.label,
      ...titled('Comprobante'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/invoices/${row.original.id}`}
          className="block text-brand-ink hover:underline"
          aria-label={`Ver ${row.original.label}`}
        >
          <StackedCell mono primary={row.original.voucher_number} secondary={cbteTypeLabel(row.original.cbte_type)} />
        </Link>
      ),
    },
    {
      id: 'cbte_type',
      accessorFn: (row) => cbteTypeLabel(row.cbte_type),
      ...titled('Tipo de comprobante'),
      cell: ({ row }) => <span>{cbteTypeLabel(row.original.cbte_type)}</span>,
      filterFn: matchesId((r) => r.cbte_type),
    },
    {
      id: 'issue_date',
      accessorKey: 'issue_date',
      ...titled('Fecha de emisión'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.issue_date)}</span>,
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
      id: 'supplier_cuit',
      accessorFn: (row) => row.supplier.cuit,
      ...titled('CUIT del proveedor'),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.supplier.cuit}</span>,
    },
    {
      id: 'vat_period',
      accessorKey: 'vat_period',
      ...titled('Período IVA'),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.vat_period}</span>,
      filterFn: matchesId((r) => r.vat_period),
    },
    {
      id: 'total',
      accessorKey: 'total',
      ...titled('Total'),
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.total)}</span>,
    },
    {
      id: 'due_date',
      accessorKey: 'due_date',
      ...titled('Vencimiento'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.due_date)}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => SUPPLIER_INVOICE_STATUS_LABELS[row.status],
      ...titled('Estado'),
      cell: ({ row }) => <SupplierInvoiceStatusBadge status={row.original.status} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'arca_check_result',
      accessorFn: (row) => arcaLabel(row.arca_check_result),
      ...titled('Constatación ARCA'),
      cell: ({ row }) => {
        const result = row.original.arca_check_result;
        return result ? (
          <span>{ARCA_CHECK_LABELS[result]}</span>
        ) : (
          <span className="text-muted-foreground">{NO_ARCA_CHECK_LABEL}</span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const result = row.original.arca_check_result;
        if (result == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(result);
      },
    },
    {
      id: 'orders',
      accessorFn: (row) => row.orders.map((o) => o.number).join(', '),
      ...titled('OC vinculadas'),
      // M:M (via lineas): no ordenable.
      enableSorting: false,
      cell: ({ row }) =>
        row.original.orders.length === 0 ? (
          <span className="text-muted-foreground">{NO_ORDER_LABEL}</span>
        ) : (
          <DocumentLinkList items={row.original.orders} basePath="/dashboard/purchases/orders" />
        ),
      filterFn: matchesAnyIdOrNone((r) => r.orders.map((o) => o.id)),
    },
    {
      id: 'creator',
      accessorFn: (row) => row.creator.name,
      ...titled('Cargó'),
      cell: ({ row }) => <StackedCell primary={row.original.creator.name} />,
      filterFn: matchesId((r) => r.creator.id),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Fecha de alta'),
      cell: ({ row }) => <span>{row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}</span>,
    },
  ];
}
