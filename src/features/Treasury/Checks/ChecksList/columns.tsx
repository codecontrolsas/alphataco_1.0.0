'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, Smartphone, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CHECK_KIND_LABELS, CHECK_STATUS_LABELS, type CheckStatus } from '../../lib/check-transitions';
import { formatDay } from '../../lib/dates';
import { CHECK_STATUS_UI, DEPOSIT_WARNING_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import type { CheckListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['drawer_cuit', 'issue_date', 'bank', 'kind'];

export const checkStatusIcons = Object.fromEntries(
  Object.entries(CHECK_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<CheckStatus, LucideIcon>;

export const checkKindIcons: Record<CheckListItem['kind'], LucideIcon> = {
  PHYSICAL: FileText,
  ECHECK: Smartphone,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = formatDay;

export function getColumns(): ColumnDef<CheckListItem>[] {
  return [
    {
      id: 'select',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
          className="cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar cheque"
          className={row.getCanSelect() ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
        />
      ),
    },
    {
      id: 'number',
      accessorFn: (row) => row.number,
      ...titled('Número'),
      cell: ({ row }) => (
        <Link href={`/dashboard/treasury/checks/${row.original.id}`} className="text-brand-ink block hover:underline">
          <StackedCell primary={row.original.number} secondary={row.original.bank} mono maxWidthClass="max-w-[200px]" />
        </Link>
      ),
    },
    {
      id: 'bank',
      accessorFn: (row) => row.bank,
      ...titled('Banco'),
      cell: ({ row }) => <span>{row.original.bank}</span>,
    },
    {
      id: 'kind',
      accessorFn: (row) => CHECK_KIND_LABELS[row.kind],
      ...titled('Tipo'),
      cell: ({ row }) => {
        const Icon = checkKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {CHECK_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.kind),
    },
    {
      id: 'drawer_name',
      accessorFn: (row) => row.drawerName,
      ...titled('Librador'),
      cell: ({ row }) => <StackedCell primary={row.original.drawerName} secondary={row.original.drawerCuit} />,
    },
    {
      id: 'drawer_cuit',
      accessorFn: (row) => row.drawerCuit,
      ...titled('CUIT'),
      cell: ({ row }) => <span className="font-mono text-sm tabular-nums">{row.original.drawerCuit}</span>,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      ...titled('Cliente'),
      cell: ({ row }) => <span className="font-medium">{row.original.customer.name}</span>,
      filterFn: matchesId((r) => r.customer.id),
    },
    {
      id: 'amount',
      accessorFn: (row) => row.amount,
      ...titled('Importe'),
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>,
    },
    {
      id: 'issue_date',
      accessorFn: (row) => row.issueDate,
      ...titled('Emisión'),
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.issueDate)}</span>,
    },
    {
      id: 'payment_date',
      accessorFn: (row) => row.paymentDate,
      ...titled('Fecha de pago'),
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.paymentDate)}</span>,
    },
    {
      id: 'deposit_deadline',
      accessorFn: (row) => row.depositDeadline,
      ...titled('Vence para depositar'),
      cell: ({ row }) => {
        const warning = row.original.depositWarning;
        const ui = warning === 'OK' ? null : DEPOSIT_WARNING_UI[warning];
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatValueDate(row.original.depositDeadline)}</span>
            {ui && (
              <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
                <ui.icon className="h-3 w-3" aria-hidden="true" />
                {ui.label}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (row) => CHECK_STATUS_LABELS[row.status],
      ...titled('Estado'),
      cell: ({ row }) => {
        const ui = CHECK_STATUS_UI[row.original.status];
        return (
          <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
            <ui.icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'portfolio',
      accessorFn: (row) => row.portfolio.name,
      ...titled('Cartera'),
      cell: ({ row }) => <span>{row.original.portfolio.name}</span>,
      filterFn: matchesId((r) => r.portfolio.id),
    },
    {
      id: 'destination',
      accessorFn: (row) => row.destination,
      ...titled('Destino'),
      cell: ({ row }) =>
        row.original.destination ? (
          <span>{row.original.destination}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.destinationId;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild type="button" variant="ghost" size="sm" className="h-8 gap-1">
            <Link href={`/dashboard/treasury/checks/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
