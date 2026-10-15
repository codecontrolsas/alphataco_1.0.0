'use client';

import { ENVIRONMENT_LABELS } from '@/features/Empresa/General/FiscalData/schemas/fiscal-data';
import { formatCuitText } from '@/shared/utils/cuit-text';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import type { arca_environment } from '@/generated/prisma/enums';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { Check, Eye, FileMinus, FilePlus, FileText, FlaskConical, ShieldCheck, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { INVOICE_STATUS_ICONS, InvoiceStatusBadge } from '../components/InvoiceStatusBadge';
import { INVOICE_STATUS_LABELS } from '../lib/invoice-state-machine';
import type { InvoiceListItem } from './actions.server';

// ============================================================================
// CONSTANTS (compartidas con el filtro y el export)
// ============================================================================

/** Columnas secundarias: ocultas por defecto. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'cuit',
  'currency',
  'simulated',
  'cae',
  'cae_due_date',
  'created_at',
];

export { ENVIRONMENT_LABELS };

/** Mismos iconos en el filtro y en la celda de la columna. */
export const environmentIcons: Record<arca_environment, LucideIcon> = {
  homologacion: FlaskConical,
  produccion: ShieldCheck,
};

/** Mismos iconos que el badge de la celda. */
export const statusIcons = INVOICE_STATUS_ICONS;

const kindIcons = { invoice: FileText, credit_note: FileMinus, debit_note: FilePlus } as const;

/** Icono del tipo de comprobante según su clase (factura / NC / ND). */
export function cbteTypeIcon(cbteType: number): LucideIcon {
  return isCbteTypeId(cbteType) ? kindIcons[CBTE_TYPES[cbteType].kind] : FileText;
}

export const simulatedIcons: Record<'true' | 'false', LucideIcon> = { true: Check, false: X };

// ============================================================================
// COLUMNS
// ============================================================================

export function getInvoiceColumns(canViewPrices: boolean): ColumnDef<InvoiceListItem>[] {
  const columns: ColumnDef<InvoiceListItem>[] = [
    {
      id: 'issue_date',
      accessorFn: (row) => row.issueDate,
      meta: { title: 'Fecha de emisión' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de emisión" />,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.issueDate ? moment(row.original.issueDate, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-'}
        </span>
      ),
    },
    {
      id: 'cbte_type',
      accessorFn: (row) => row.cbteLabel,
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const Icon = cbteTypeIcon(row.original.cbteType);
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {row.original.cbteLabel}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(String(row.original.cbteType)),
    },
    {
      id: 'voucher_number',
      accessorFn: (row) => row.voucherNumber,
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.voucherNumber}</span>,
    },
    {
      id: 'sales_point',
      accessorFn: (row) => `${String(row.salesPoint.number).padStart(5, '0')} - ${row.salesPoint.name}`,
      meta: { title: 'Punto de venta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Punto de venta" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {String(row.original.salesPoint.number).padStart(5, '0')} - {row.original.salesPoint.name}
        </span>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.salesPoint.id),
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
      accessorFn: (row) => formatCuitText(row.customer.cuit),
      meta: { title: 'CUIT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIT" />,
      cell: ({ row }) => <span className="tabular-nums">{formatCuitText(row.original.customer.cuit)}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => INVOICE_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <InvoiceStatusBadge
          status={row.original.status}
          simulated={row.original.simulated}
          environment={row.original.environment}
        />
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'environment',
      accessorFn: (row) => ENVIRONMENT_LABELS[row.environment],
      meta: { title: 'Ambiente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ambiente" />,
      cell: ({ row }) => {
        const Icon = environmentIcons[row.original.environment];
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 whitespace-nowrap">
              <Icon className="h-3 w-3" />
              {ENVIRONMENT_LABELS[row.original.environment]}
            </Badge>
            {row.original.simulated && (
              <Badge variant="secondary" className="whitespace-nowrap">
                Simulado
              </Badge>
            )}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.environment),
    },
    {
      id: 'simulated',
      accessorFn: (row) => (row.simulated ? 'Sí' : 'No'),
      meta: { title: 'Simulado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Simulado" />,
      cell: ({ row }) => (
        <Badge variant={row.original.simulated ? 'secondary' : 'outline'} className="gap-1">
          {row.original.simulated ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {row.original.simulated ? 'Sí' : 'No'}
        </Badge>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(String(row.original.simulated)),
    },
    {
      id: 'currency',
      accessorFn: (row) => row.currency,
      meta: { title: 'Moneda' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
      cell: ({ row }) => <span>{row.original.currency}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.currency),
    },
  ];

  if (canViewPrices) {
    columns.push({
      id: 'total',
      accessorFn: (row) => row.total ?? '',
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) =>
        row.original.total === null ? (
          '-'
        ) : (
          <CertificationAmount value={row.original.total} currency={row.original.currency} />
        ),
    });
  }

  columns.push(
    {
      id: 'cae',
      accessorFn: (row) => row.cae ?? '',
      meta: { title: 'CAE' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CAE" />,
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.cae ?? '-'}</span>,
    },
    {
      id: 'cae_due_date',
      accessorFn: (row) => row.caeDueDate ?? '',
      meta: { title: 'Vencimiento CAE' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento CAE" />,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.caeDueDate ? moment(row.original.caeDueDate, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-'}
        </span>
      ),
    },
    {
      id: 'created_at',
      accessorFn: (row) => row.createdAt,
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDay(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/comercial/facturacion/${row.original.id}`}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Ver
          </Link>
        </Button>
      ),
    }
  );

  return columns;
}
