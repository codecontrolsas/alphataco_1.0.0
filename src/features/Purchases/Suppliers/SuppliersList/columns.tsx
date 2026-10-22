import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Clock, FileX, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { TONE_TO_BADGE, type StatusUi } from '../../lib/status-presentation';
import type { SupplierListItem } from './actions.server';
import { SUPPLIER_DOCUMENT_STATE_LABELS, type SupplierDocumentState } from './labels';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

/** Presentación del estado de documentación: misma fuente para la celda y el filtro. */
const SUPPLIER_DOCUMENT_STATE_UI: Record<SupplierDocumentState, StatusUi> = {
  EXPIRED: { label: SUPPLIER_DOCUMENT_STATE_LABELS.EXPIRED, tone: 'danger', icon: AlertCircle },
  EXPIRING: { label: SUPPLIER_DOCUMENT_STATE_LABELS.EXPIRING, tone: 'warn', icon: Clock },
  OK: { label: SUPPLIER_DOCUMENT_STATE_LABELS.OK, tone: 'ok', icon: CheckCircle2 },
  NONE: { label: SUPPLIER_DOCUMENT_STATE_LABELS.NONE, tone: 'neutral', icon: FileX },
};

/** Icono por estado de documentacion: lo comparten la celda y el filtro. */
export const supplierDocumentStateIcons: Record<SupplierDocumentState, LucideIcon> = {
  EXPIRED: SUPPLIER_DOCUMENT_STATE_UI.EXPIRED.icon,
  EXPIRING: SUPPLIER_DOCUMENT_STATE_UI.EXPIRING.icon,
  OK: SUPPLIER_DOCUMENT_STATE_UI.OK.icon,
  NONE: SUPPLIER_DOCUMENT_STATE_UI.NONE.icon,
};

/** Vencimientos: columnas DATE llegan como `YYYY-MM-DD`, se leen como fecha para no correr un dia. */
const formatExpiry = (value: string) => formatDateAr(value);

export function getColumns(): ColumnDef<SupplierListItem>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      meta: { title: 'Razón social' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Razón social" />,
      cell: ({ row }) => (
        <StackedCell
          maxWidthClass="max-w-[280px]"
          className={cn(!row.original.is_active && 'opacity-60')}
          primary={
            <Link href={`/dashboard/purchases/suppliers/${row.original.id}`} className="text-brand-ink hover:underline">
              {row.original.name}
            </Link>
          }
          secondary={[row.original.trade_name, row.original.cuit].filter(Boolean).join(' · ')}
        />
      ),
    },
    {
      id: 'cuit',
      accessorKey: 'cuit',
      meta: { title: 'CUIT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIT" />,
      cell: ({ row }) => (
        <span className={cn('font-mono text-sm tabular-nums', !row.original.is_active && 'opacity-60')}>
          {row.original.cuit}
        </span>
      ),
    },
    {
      id: 'vat_condition',
      accessorFn: (row) => row.vat_condition,
      meta: { title: 'Condición de IVA' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición de IVA" />,
      cell: ({ row }) => <span>{row.original.vat_condition}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(String(row.original.vat_condition_id)),
    },
    {
      id: 'categories',
      accessorFn: (row) => row.categories.map((c) => c.name).join(', '),
      meta: { title: 'Rubros' },
      // M:M: no ordenable
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rubros" />,
      cell: ({ row }) =>
        row.original.categories.length === 0 ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.categories.map((c) => (
              <Badge key={c.id} variant="outline">
                {c.name}
              </Badge>
            ))}
          </div>
        ),
      filterFn: (row, _id, value: string[]) => {
        const items = row.original.categories;
        if (items.length === 0) return value.includes(NULL_FILTER_VALUE);
        return items.some((c) => value.includes(c.id));
      },
    },
    {
      id: 'contact',
      accessorFn: (row) =>
        row.contact ? [row.contact.name, row.contact.email ?? row.contact.phone].filter(Boolean).join(' · ') : '',
      meta: { title: 'Contacto principal' },
      // Sale de una relacion 1:N (el principal): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contacto principal" />,
      cell: ({ row }) => {
        const c = row.original.contact;
        if (!c) return <span className="text-muted-foreground">-</span>;
        return <StackedCell maxWidthClass="max-w-[240px]" primary={c.name} secondary={c.email ?? c.phone ?? ''} />;
      },
    },
    {
      id: 'documents',
      accessorFn: (row) => SUPPLIER_DOCUMENT_STATE_LABELS[row.documents.state],
      meta: { title: 'Documentos' },
      // Estado derivado de los documentos vigentes (no es un campo de la base): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documentos" />,
      cell: ({ row }) => {
        const { state, nextExpiry } = row.original.documents;
        const ui = SUPPLIER_DOCUMENT_STATE_UI[state];
        const Icon = ui.icon;
        return (
          <Badge
            variant={TONE_TO_BADGE[ui.tone]}
            className="gap-1 whitespace-nowrap"
            title={nextExpiry ? `Próximo vencimiento: ${formatExpiry(nextExpiry)}` : undefined}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.documents.state),
    },
    {
      id: 'is_active',
      accessorFn: (row) => (row.is_active ? 'Activo' : 'Inactivo'),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success" className="gap-1 whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Activo
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 whitespace-nowrap">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Inactivo
          </Badge>
        ),
      filterFn: (row, _id, value: string[]) => value.includes(String(row.original.is_active)),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{formatArgentinaDay(row.original.created_at)}</span>,
    },
  ];
}
