import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { matchesAnyIdOrNone, matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import { formatDateOnlyAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DocumentLinkList } from '../../components/DocumentLinks';
import type { DueInvoiceListItem } from './actions.server';
import { CHECK_DEBT_TYPE_LABEL, NO_DUE_DATE_LABEL, NO_ORDER_LABEL } from './constants';

export const cbteTypeLabel = (id: number | null) =>
  id == null ? CHECK_DEBT_TYPE_LABEL : isCbteTypeId(id) ? CBTE_TYPES[id].label : String(id);

/** Texto de la columna "Días": "Vencido hace 3 días", "Vence hoy", "Vence en 5 días". */
export function daysLabel(days: number | null): string {
  if (days == null) return NO_DUE_DATE_LABEL;
  if (days < 0) return `Vencido hace ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return 'Vence hoy';
  return `Vence en ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un día. */
const formatDateOnly = (value: Date | string | null) => (value ? formatDateOnlyAr(value) : '-');

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
      ...titled('Proveedor'),
      cell: ({ row }) => (
        <Link href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`} className="block hover:underline">
          <StackedCell primary={row.original.supplier.name} secondary={`CUIT ${row.original.supplier.cuit}`} />
        </Link>
      ),
      filterFn: matchesId((r) => r.supplier.id),
    },
    {
      id: 'number',
      accessorFn: (row) => row.label,
      ...titled('Comprobante'),
      cell: ({ row }) => (
        <Link
          href={
            row.original.kind === 'CHECK'
              ? `/dashboard/treasury/checks/${row.original.id}`
              : `/dashboard/purchases/invoices/${row.original.id}`
          }
          className="block text-brand-ink hover:underline"
          aria-label={`Ver ${row.original.label}`}
        >
          <StackedCell
            mono
            primary={row.original.voucher_number}
            secondary={row.original.kind === 'CHECK' ? null : cbteTypeLabel(row.original.cbte_type)}
          />
        </Link>
      ),
    },
    {
      id: 'cbte_type',
      accessorFn: (row) => cbteTypeLabel(row.cbte_type),
      ...titled('Tipo de comprobante'),
      cell: ({ row }) => <span>{cbteTypeLabel(row.original.cbte_type)}</span>,
      filterFn: (row, _id, value: string[]) =>
        row.original.cbte_type != null && value.includes(String(row.original.cbte_type)),
    },
    {
      id: 'issue_date',
      accessorKey: 'issue_date',
      ...titled('Fecha de emisión'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.issue_date)}</span>,
    },
    {
      id: 'due_date',
      accessorKey: 'due_date',
      ...titled('Vencimiento'),
      cell: ({ row }) => <span>{formatDateOnly(row.original.due_date)}</span>,
    },
    {
      id: 'days',
      accessorFn: (row) => daysLabel(row.days_to_due),
      ...titled('Días'),
      cell: ({ row }) => {
        const days = row.original.days_to_due;
        if (days == null) return <span className="text-muted-foreground">{NO_DUE_DATE_LABEL}</span>;
        return (
          <span className={days < 0 ? 'font-medium text-danger-subtle-foreground' : undefined}>{daysLabel(days)}</span>
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
      ...titled('Total'),
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.total)}</span>,
    },
    {
      id: 'pending',
      accessorKey: 'pending',
      ...titled('Pendiente'),
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.pending)}</span>,
    },
    {
      id: 'orders',
      accessorFn: (row) => row.orders.map((o) => o.number).join(', '),
      ...titled('Órdenes de pago en curso'),
      // M:M: no ordenable.
      enableSorting: false,
      cell: ({ row }) =>
        row.original.orders.length === 0 ? (
          <span className="text-muted-foreground">{NO_ORDER_LABEL}</span>
        ) : (
          <DocumentLinkList items={row.original.orders} basePath="/dashboard/purchases/payments" />
        ),
      filterFn: matchesAnyIdOrNone((r) => r.orders.map((o) => o.id)),
    },
  ];
}
