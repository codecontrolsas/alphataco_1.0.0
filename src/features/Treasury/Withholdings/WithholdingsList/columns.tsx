'use client';

import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, FileCheck2, FileX2, Landmark, Percent, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../schemas/receipts';
import type { WithholdingListItem } from './actions.server';
import { NO_CERTIFICATE_LABEL, type CertificateFilterValue } from './constants';
import { WithholdingRowActions } from './components/WithholdingRowActions';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

type WithholdingTax = WithholdingListItem['tax'];

export const withholdingTaxIcons: Record<WithholdingTax, LucideIcon> = {
  GANANCIAS: Landmark,
  IVA: Percent,
  IIBB: ReceiptText,
  SUSS: ShieldCheck,
};

export const certificateIcons: Record<CertificateFilterValue, LucideIcon> = {
  WITH: FileCheck2,
  WITHOUT: FileX2,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '';

interface ColumnsOptions {
  canAttach: boolean;
}

export function getColumns({ canAttach }: ColumnsOptions): ColumnDef<WithholdingListItem>[] {
  const columns: ColumnDef<WithholdingListItem>[] = [
    {
      id: 'certificate_date',
      accessorFn: (row) => row.certificateDate,
      meta: { title: 'Fecha del certificado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha del certificado" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.certificateDate)}</span>,
    },
    {
      id: 'tax',
      accessorFn: (row) => CUSTOMER_WITHHOLDING_TAX_LABELS[row.tax],
      meta: { title: 'Impuesto' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Impuesto" />,
      cell: ({ row }) => {
        const Icon = withholdingTaxIcons[row.original.tax];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {CUSTOMER_WITHHOLDING_TAX_LABELS[row.original.tax]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.tax),
    },
    {
      id: 'jurisdiction',
      accessorFn: (row) => row.jurisdiction ?? '',
      meta: { title: 'Jurisdicción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jurisdicción" />,
      cell: ({ row }) => <span>{row.original.jurisdiction ?? '-'}</span>,
    },
    {
      id: 'certificate_number',
      accessorFn: (row) => row.certificateNumber,
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.certificateNumber}</span>,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customer.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.customer.id),
    },
    {
      id: 'cuit',
      accessorFn: (row) => row.cuit,
      meta: { title: 'CUIT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIT" />,
      cell: ({ row }) => <span className="whitespace-nowrap font-mono text-sm">{row.original.cuit}</span>,
    },
    {
      id: 'receipt',
      accessorFn: (row) => row.receipt.number ?? '',
      meta: { title: 'Recibo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recibo" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/treasury/receipts/${row.original.receipt.id}`}
          className="font-mono text-sm font-medium text-blue-600 hover:underline"
        >
          {row.original.receipt.number ?? 'Recibo'}
        </Link>
      ),
    },
    {
      id: 'amount',
      accessorFn: (row) => row.amount,
      meta: { title: 'Importe' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Importe" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>,
    },
    {
      id: 'certificate',
      // Para el export: la URL (el formatter la vuelve absoluta); vacio si no hay certificado.
      accessorFn: (row) => row.certificateUrl ?? '',
      meta: { title: 'Certificado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Certificado" />,
      cell: ({ row }) =>
        row.original.certificateUrl ? (
          <a
            href={row.original.certificateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            Ver
          </a>
        ) : (
          <Badge variant="secondary" className="gap-1 whitespace-nowrap">
            <FileX2 className="h-3 w-3" />
            {NO_CERTIFICATE_LABEL}
          </Badge>
        ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.certificateUrl ? 'WITH' : 'WITHOUT'),
    },
  ];

  if (canAttach) {
    columns.push({
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => <WithholdingRowActions withholding={row.original} />,
    });
  }

  return columns;
}
