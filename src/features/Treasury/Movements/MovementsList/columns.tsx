'use client';

import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Ban, CheckCircle2, HandCoins, Pencil, PiggyBank, Truck, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../schemas/movements';
import { MovementRowActions } from '../components/MovementRowActions';
import type { TreasuryMovementListItem } from './actions.server';
import { MOVEMENT_STATE_LABELS } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'cancel_reason'];

export const NO_CONCEPT_LABEL = 'Sin asignar';

type MovementKind = TreasuryMovementListItem['kind'];

export const movementKindIcons: Record<MovementKind, LucideIcon> = {
  OPENING: PiggyBank,
  MANUAL: Pencil,
  TRANSFER: ArrowLeftRight,
  SUPPLIER_PAYMENT: Truck,
  CUSTOMER_RECEIPT: HandCoins,
};

export const movementStateIcons: Record<keyof typeof MOVEMENT_STATE_LABELS, LucideIcon> = {
  ACTIVE: CheckCircle2,
  CANCELLED: Ban,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-';

const isIncome = (amount: string) => !amount.startsWith('-');
const absAmount = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : amount);

interface ColumnsOptions {
  canUpdate: boolean;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
}

export function getColumns({ canUpdate, accounts, concepts }: ColumnsOptions): ColumnDef<TreasuryMovementListItem>[] {
  const columns: ColumnDef<TreasuryMovementListItem>[] = [
    {
      id: 'date',
      accessorKey: 'date',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.date)}</span>,
    },
    {
      id: 'account',
      accessorFn: (row) => row.account.name,
      meta: { title: 'Cuenta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cuenta" />,
      cell: ({ row }) => <span className="font-medium">{row.original.account.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.account.id),
    },
    {
      id: 'kind',
      accessorFn: (row) => TREASURY_MOVEMENT_KIND_LABELS[row.kind],
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const Icon = movementKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {TREASURY_MOVEMENT_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.kind),
    },
    {
      id: 'concept',
      accessorFn: (row) => row.concept?.name ?? '',
      meta: { title: 'Concepto' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Concepto" />,
      cell: ({ row }) => <span>{row.original.concept?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.concept?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'description',
      accessorKey: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => <span className="line-clamp-2 max-w-xs">{row.original.description ?? '-'}</span>,
    },
    {
      id: 'origin',
      accessorFn: (row) => row.paymentOrder?.number ?? row.customerReceipt?.number ?? row.transfer?.number ?? '',
      meta: { title: 'Origen' },
      // Sin orden directo: el numero vive en dos relaciones distintas.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
      cell: ({ row }) => {
        const { paymentOrder, transfer, customerReceipt } = row.original;
        if (paymentOrder) {
          return (
            <Link
              href={`/dashboard/purchases/payments/${paymentOrder.id}`}
              className="font-mono text-sm font-medium text-blue-600 hover:underline"
            >
              {paymentOrder.number}
            </Link>
          );
        }
        if (customerReceipt) {
          return (
            <Link
              href={`/dashboard/treasury/receipts/${customerReceipt.id}`}
              className="font-mono text-sm font-medium text-blue-600 hover:underline"
            >
              {customerReceipt.number ?? 'Recibo'}
            </Link>
          );
        }
        if (transfer) {
          return (
            <Link
              href="/dashboard/treasury?tab=transferencias"
              className="font-mono text-sm font-medium text-blue-600 hover:underline"
            >
              {transfer.number}
            </Link>
          );
        }
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: 'income',
      accessorFn: (row) => (isIncome(row.amount) ? row.amount : ''),
      meta: { title: 'Ingreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso" />,
      cell: ({ row }) =>
        isIncome(row.original.amount) ? (
          <span
            className={
              row.original.cancelled
                ? 'tabular-nums text-muted-foreground line-through'
                : 'tabular-nums text-emerald-600'
            }
          >
            {formatMoney(row.original.amount)}
          </span>
        ) : null,
    },
    {
      id: 'expense',
      accessorFn: (row) => (isIncome(row.amount) ? '' : absAmount(row.amount)),
      meta: { title: 'Egreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Egreso" />,
      cell: ({ row }) =>
        isIncome(row.original.amount) ? null : (
          <span
            className={
              row.original.cancelled
                ? 'tabular-nums text-muted-foreground line-through'
                : 'tabular-nums text-red-600'
            }
          >
            {formatMoney(absAmount(row.original.amount))}
          </span>
        ),
    },
    {
      id: 'state',
      accessorFn: (row) => (row.cancelled ? MOVEMENT_STATE_LABELS.CANCELLED : MOVEMENT_STATE_LABELS.ACTIVE),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const key = row.original.cancelled ? 'CANCELLED' : 'ACTIVE';
        const Icon = movementStateIcons[key];
        return (
          <div className="space-y-1">
            <Badge variant={row.original.cancelled ? 'secondary' : 'outline'} className="gap-1 whitespace-nowrap">
              <Icon className="h-3 w-3" />
              {MOVEMENT_STATE_LABELS[key]}
            </Badge>
            {row.original.cancelled && row.original.cancel_reason && (
              <p className="max-w-xs text-xs text-muted-foreground">{row.original.cancel_reason}</p>
            )}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.cancelled ? 'CANCELLED' : 'ACTIVE'),
    },
    {
      id: 'cancel_reason',
      accessorKey: 'cancel_reason',
      meta: { title: 'Motivo de anulación' },
      // El motivo ya se ve debajo del estado; esta columna lo hace exportable y filtrable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de anulación" />,
      cell: ({ row }) => <span>{row.original.cancel_reason ?? '-'}</span>,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span>,
    },
  ];

  if (canUpdate) {
    columns.push({
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <MovementRowActions
          movement={{
            id: row.original.id,
            kind: row.original.kind,
            cancelled: row.original.cancelled,
            accountName: row.original.account.name,
          }}
          accounts={accounts}
          concepts={concepts}
        />
      ),
    });
  }

  return columns;
}
