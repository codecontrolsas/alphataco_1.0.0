'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  documentListStateLabels,
  formatDocumentPeriod,
} from '@/features/Documentacion/shared/components/DocumentCells';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { documentStateBadges } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Clock, FileWarning, XCircle, type LucideIcon } from 'lucide-react';
import type { CompanyDocListItem } from '../actions.server';

// ============================================================================
// ICONS
// ============================================================================

export const documentStateIcons: Record<string, LucideIcon> = {
  presentado: Clock,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertCircle,
  pendiente: FileWarning,
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['period', 'validity'];

// ============================================================================
// COLUMNS DEFINITION
// ============================================================================

export function getColumns(): ColumnDef<CompanyDocListItem>[] {
  return [
    // ── select ──────────────────────────────────────────────────────────────
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      meta: { excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
    },

    // ── Nombre del documento (FK document_types.name) ─────────────────────
    {
      id: 'documentType',
      accessorFn: (row) => row.document_types?.name ?? '',
      meta: { title: 'Documento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
      cell: ({ row }) => <span className="font-medium">{row.original.document_types?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.document_types?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Estado (enum state) ───────────────────────────────────────────────
    {
      id: 'state',
      accessorKey: 'state',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const stateValue = row.original.state as string;
        const label = documentListStateLabels[stateValue] ?? stateValue;
        const variant = documentStateBadges[stateValue] ?? 'default';
        const Icon = documentStateIcons[stateValue];
        return (
          <Badge variant={variant} className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Tipo (derived: is_it_montlhy → Mensual/Permanente) ────────────────
    {
      id: 'docType',
      accessorFn: (row) => (row.document_types?.is_it_montlhy ? 'Mensual' : 'Permanente'),
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const isMonthly = row.original.document_types?.is_it_montlhy;
        return <Badge variant={isMonthly ? 'default' : 'secondary'}>{isMonthly ? 'Mensual' : 'Permanente'}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.document_types?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      enableSorting: false,
    },

    // ── Mandatorio (boolean) ──────────────────────────────────────────────
    {
      id: 'mandatory',
      accessorFn: (row) => row.document_types?.mandatory,
      meta: { title: 'Mandatorio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mandatorio" />,
      cell: ({ row }) => {
        const mandatory = row.original.document_types?.mandatory;
        if (mandatory == null) return <span className="text-muted-foreground">-</span>;
        return <Badge variant={mandatory ? 'destructive' : 'secondary'}>{mandatory ? 'Sí' : 'No'}</Badge>;
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.document_types?.mandatory;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Subido por (FK profile.fullname) ──────────────────────────────────
    {
      id: 'uploadedBy',
      accessorFn: (row) => row.profile?.fullname ?? '',
      meta: { title: 'Subido por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subido por" />,
      cell: ({ row }) => {
        const fullname = row.original.profile?.fullname;
        if (!fullname) {
          return <span className="text-muted-foreground italic">{row.original.isMissing ? 'Sin cargar' : '-'}</span>;
        }
        return <span>{fullname}</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.profile?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Fecha de carga (created_at) ───────────────────────────────────────
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de carga' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de carga" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <span>{formatArgentinaDay(date)}</span>;
      },
    },

    // ── Vencimiento (validity) ────────────────────────────────────────────
    {
      id: 'validity',
      accessorKey: 'validity',
      meta: { title: 'Vencimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
      cell: ({ row }) => {
        const validity = row.original.validity;
        const explired = row.original.document_types?.explired;
        // Fila faltante: todavía no hay documento, así que no hay vencimiento que mostrar.
        if (row.original.isMissing) return <span className="text-muted-foreground">-</span>;
        if (validity) return <span>{validity}</span>;
        if (!explired) return <span className="text-muted-foreground">No vence</span>;
        return <span className="text-muted-foreground">Sin vencimiento</span>;
      },
      enableSorting: true,
    },

    // ── Periodo (period — relevant for monthly docs) ──────────────────────
    {
      id: 'period',
      accessorKey: 'period',
      meta: { title: 'Período' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Período" />,
      cell: ({ row }) => {
        return <span>{formatDocumentPeriod(row.original.period) ?? '-'}</span>;
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        // La fila existe solo si hay archivo; una exigencia sin documento es una fila faltante.
        const isUploaded = !row.original.isMissing;
        const docId = row.original.document_types?.id ?? '';
        const redirectId = row.original.id;
        return (
          <CompanyDocActionsCell
            documentId={docId}
            redirectId={redirectId}
            documentIsUploaded={isUploaded}
            documentTypeName={row.original.document_types?.name}
            documentTypeExplired={row.original.document_types?.explired}
            documentTypeMontlhy={row.original.document_types?.is_it_montlhy ?? undefined}
          />
        );
      },
    },
  ];
}

// ============================================================================
// ACTIONS CELL (lazy import to avoid SSR issues with AddCompanyDocumentForm)
// ============================================================================

import dynamic from 'next/dynamic';

const AddCompanyDocumentForm = dynamic(
  () => import('@/features/Empresa/General/Documentacion/components/AddCompanyDocumentForm'),
  { ssr: false }
);

function CompanyDocActionsCell({
  documentId,
  redirectId,
  documentIsUploaded,
  documentTypeName,
  documentTypeExplired,
  documentTypeMontlhy,
}: {
  documentId: string;
  redirectId: string;
  documentIsUploaded: boolean;
  documentTypeName?: string;
  documentTypeExplired?: boolean;
  documentTypeMontlhy?: boolean | null;
}) {
  return (
    <AddCompanyDocumentForm
      documentId={documentId}
      redirectId={redirectId}
      documentIsUploaded={documentIsUploaded}
      documentTypeName={documentTypeName}
      documentTypeExplired={documentTypeExplired}
      documentTypeMontlhy={documentTypeMontlhy ?? undefined}
    />
  );
}
