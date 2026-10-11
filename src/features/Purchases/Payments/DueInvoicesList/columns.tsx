'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import type { DueInvoiceListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['issue_date'];

/** Tipos de comprobante a pagar: facturas, ND y NC habilitadas del catalogo. */
export const DUE_CBTE_TYPE_IDS = [1, 2, 3, 6, 7, 8, 11, 12, 13] as const;

export const CHECK_DEBT_TYPE_LABEL = 'Cheque rechazado';

export const cbteTypeLabel = (id: number | null) => (id == null ? CHECK_DEBT_TYPE_LABEL : isCbteTypeId(id) ? CBTE_TYPES[id].label : String(id));

export const NO_ORDER_LABEL = 'Sin orden';
export const NO_DUE_DATE_LABEL = 'Sin vencimiento';

export const DAYS_FILTER_LABELS = {
  overdue: 'Vencido',
  upcoming: 'A vencer',
  none: NO_DUE_DATE_LABEL,
} as const;

/** Texto de la columna "Días": "Vencido hace 3 días", "Vence hoy", "Vence en 5 días". */
export function daysLabel(days: number | null): string {
  if (days == null) return NO_DUE_DATE_LABEL;
  if (days < 0) return `Vencido hace ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return 'Vence hoy';
  return `Vence en ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Columnas DATE (sin hora): se leen en UTC para no correr un dia. */
const formatDateOnly = (value: Date | string | null) => (value ? moment.utc(value).format('DD/MM/YYYY') : '-');

export function getColumns(): ColumnDef<DueInvoiceListItem>[] {
  return [
    {
      id: 'select',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar comprobante"
        />
      ),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`}
          className="text-blue-600 hover:underline"
        >
          {row.original.supplier.name}
        </Link>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.supplier.id),
    },
    {
      id: 'number',
      accessorFn: (row) => row.label,
      meta: { title: 'Comprobante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comprobante" />,
      cell: ({ row }) => (
        <Link
          href={
            row.original.kind === 'CHECK'
              ? `/dashboard/treasury/checks/${row.original.id}`
              : `/dashboard/purchases/invoices/${row.original.id}`
          }
          className="font-mono text-sm font-medium text-blue-600 hover:underline"
        >
          {row.original.label}
        </Link>
      ),
    },
    {
      id: 'cbte_type',
      accessorFn: (row) => cbteTypeLabel(row.cbte_type),
      meta: { title: 'Tipo de comprobante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de comprobante" />,
      cell: ({ row }) => <span>{cbteTypeLabel(row.original.cbte_type)}</span>,
      filterFn: (row, _id, value: string[]) => row.original.cbte_type != null && value.includes(String(row.original.cbte_type)),
    },
    {
      id: 'issue_date',
      accessorKey: 'issue_date',
      meta: { title: 'Fecha de emisión' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de emisión" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.issue_date)}</span>,
    },
    {
      id: 'due_date',
      accessorKey: 'due_date',
      meta: { title: 'Vencimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.due_date)}</span>,
    },
    {
      id: 'days',
      accessorFn: (row) => daysLabel(row.days_to_due),
      meta: { title: 'Días' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días" />,
      cell: ({ row }) => {
        const days = row.original.days_to_due;
        if (days == null) return <span className="text-muted-foreground">{NO_DUE_DATE_LABEL}</span>;
        return (
          <span className={days < 0 ? 'font-medium text-red-600 dark:text-red-400' : undefined}>{daysLabel(days)}</span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const days = row.original.days_to_due;
        if (days == null) return value.includes('none');
        return value.includes(days < 0 ? 'overdue' : 'upcoming');
      },
    },
    {
      id: 'total',
      accessorKey: 'total',
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.total)}</span>,
    },
    {
      id: 'pending',
      accessorKey: 'pending',
      meta: { title: 'Pendiente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pendiente" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.pending)}</span>,
    },
    {
      id: 'orders',
      accessorFn: (row) => row.orders.map((o) => o.number).join(', '),
      meta: { title: 'Órdenes de pago en curso' },
      // M:M: no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Órdenes de pago en curso" />,
      cell: ({ row }) =>
        row.original.orders.length === 0 ? (
          <span className="text-muted-foreground">{NO_ORDER_LABEL}</span>
        ) : (
          <div className="flex flex-wrap gap-x-2">
            {row.original.orders.map((o) => (
              <Link
                key={o.id}
                href={`/dashboard/purchases/payments/${o.id}`}
                className="font-mono text-sm text-blue-600 hover:underline"
              >
                {o.number}
              </Link>
            ))}
          </div>
        ),
      filterFn: (row, _id, value: string[]) => {
        const orders = row.original.orders;
        if (orders.length === 0) return value.includes(NULL_FILTER_VALUE);
        return orders.some((o) => value.includes(o.id));
      },
    },
  ];
}
