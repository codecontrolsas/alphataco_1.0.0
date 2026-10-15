'use client';

import { Badge } from '@/components/ui/badge';
import {
  DocumentExpiryCell,
  DocumentNameCell,
  DocumentRowActions,
  DocumentStatePill,
  parseCompanyValidity,
  documentStateIcons as sharedDocumentStateIcons,
} from '@/features/Documentacion/shared/components/DocumentCells';
import AddCompanyDocumentForm from '@/features/Empresa/General/Documentacion/components/AddCompanyDocumentForm';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { CompanyDocListItem } from '../actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

/** Su dato ya se ve en la columna Documento (obligatoriedad y período). */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['mandatory', 'period'];

// ============================================================================
// STATE ICONS (exported for use in filters; los mismos de la pill de la tabla)
// ============================================================================

export const documentStateIcons = sharedDocumentStateIcons;

// ============================================================================
// ACTIONS CELL
// ============================================================================

function ActionsCell({ doc, isMonthly }: { doc: CompanyDocListItem; isMonthly: boolean }) {
  const isUploaded = !doc.isMissing;

  if (!isUploaded) {
    return (
      <div className="flex justify-end">
        <div className="w-fit">
          <AddCompanyDocumentForm
            documentId={doc.id_document_types ?? ''}
            redirectId={doc.id}
            documentIsUploaded={false}
            documentTypeName={doc.document_types?.name}
            documentTypeExplired={doc.document_types?.explired}
            documentTypeMontlhy={doc.document_types?.is_it_montlhy ?? undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <DocumentRowActions
      documentId={doc.id}
      documentName={doc.document_types?.name}
      state={doc.state}
      resource="Empresa"
      viewTab={isMonthly ? 'docs-empresa-mensuales' : 'docs-empresa-permanentes'}
    />
  );
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

/**
 * Retorna las columnas de la tabla de documentos de empresa.
 * El parámetro `isMonthly` controla si se muestra la columna "Período".
 */
export function getCompanyDocsColumns(isMonthly: boolean): ColumnDef<CompanyDocListItem>[] {
  const periodColumn: ColumnDef<CompanyDocListItem> = {
    id: 'period',
    accessorKey: 'period',
    meta: { title: 'Período' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Período" />,
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.period ?? '-'}</span>,
    enableSorting: true,
  };

  return [
    // ── Documento (FK → document_types.name + obligatorio/opcional + período) ─
    {
      id: 'documentType',
      accessorFn: (row) => row.document_types?.name ?? '',
      meta: { title: 'Documento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
      cell: ({ row }) => (
        <DocumentNameCell
          name={row.original.document_types?.name}
          mandatory={row.original.document_types?.mandatory}
          period={isMonthly ? row.original.period : null}
        />
      ),
      enableSorting: true,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.document_types?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Estado (enum state) ────────────────────────────────────────────────
    {
      id: 'state',
      accessorKey: 'state',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <DocumentStatePill state={row.original.state} />,
      enableSorting: true,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Vencimiento (validity / document_types.explired) ──────────────────
    {
      id: 'validity',
      accessorKey: 'validity',
      meta: { title: 'Vencimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
      cell: ({ row }) => (
        <DocumentExpiryCell
          validity={row.original.document_types?.explired ? parseCompanyValidity(row.original.validity) : null}
          state={row.original.state}
          missing={row.original.isMissing}
        />
      ),
      enableSorting: true,
    },

    // ── Subido por (FK → profile.fullname, via user_id) ──────────────────
    {
      id: 'uploadedBy',
      accessorFn: (row) => row.profile?.fullname ?? '',
      meta: { title: 'Subido por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subido por" />,
      cell: ({ row }) => {
        const fullname = row.original.profile?.fullname;
        return <span className="text-sm">{fullname ?? <span className="text-muted-foreground">Pendiente</span>}</span>;
      },
      enableSorting: true,
      filterFn: (row, _id, value: string[]) => {
        const userId = row.original.user_id;
        if (userId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(userId);
      },
    },

    // ── Fecha de carga (created_at) ────────────────────────────────────────
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de carga' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de carga" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span className="font-mono tabular-nums">{date ? formatArgentinaDay(date) : '-'}</span>;
      },
      enableSorting: true,
    },

    // ── Mandatorio (document_types.mandatory) ─────────────────────────────
    {
      id: 'mandatory',
      accessorFn: (row) => row.document_types?.mandatory,
      meta: { title: 'Mandatorio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mandatorio" />,
      cell: ({ row }) => {
        const mandatory = row.original.document_types?.mandatory;
        return <Badge variant={mandatory ? 'destructive' : 'secondary'}>{mandatory ? 'Sí' : 'No'}</Badge>;
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const mandatory = row.original.document_types?.mandatory;
        return value.includes(String(mandatory ?? false));
      },
    },

    // ── Período (SOLO para Mensuales; oculta: ya se ve en la columna Documento) ─
    ...(isMonthly ? [periodColumn] : []),

    // ── Acciones ───────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <ActionsCell doc={row.original} isMonthly={isMonthly} />,
    },
  ];
}
