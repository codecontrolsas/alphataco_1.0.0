'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DocumentExpiryCell, DocumentNameCell, DocumentRowActions, DocumentStatePill } from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import type { EmployeePermanentDocumentListItem } from './actions.server';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Datos que ya se ven en las columnas principales (Documento) o que son secundarios. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['mandatory', 'multiresource', 'deny_reason'];

// ============================================================================
// ACTIONS CELL
// ============================================================================

function ActionsCell({ row }: { row: { original: EmployeePermanentDocumentListItem } }) {
  const doc = row.original;
  const isPrivateDocType = doc.document_types?.private === true;

  return (
    <DocumentRowActions
      documentId={doc.id}
      documentName={doc.document_types?.name}
      state={doc.state}
      archived={doc.notApplicable}
      resource="Persona"
      viewTab="docs-empleados-permanentes"
      upload={{
        // Para tipos privados, verificar permiso upload_private en la tab padre
        tab: isPrivateDocType ? 'documentos-de-empleados' : 'docs-empleados-permanentes',
        action: isPrivateDocType ? 'upload_private' : 'update',
        // Fila faltante: el recurso y el tipo vienen fijos (no hay un documento que actualizar)
        render: (close) => (
          <div className="space-y-3">
            <RequirementUpload
              kind="employee"
              resourceId={doc.applies}
              documentTypeId={doc.id_document_types}
              close={close}
            />
          </div>
        ),
      }}
    />
  );
}

// ============================================================================
// COLUMNS DEFINITION
// ============================================================================

export const columns: ColumnDef<EmployeePermanentDocumentListItem>[] = [
  // ─── Legajo (identidad: mono, negrita, antes del nombre) ──────────────────
  {
    id: 'fileNumber',
    accessorFn: (row) => row.employees?.file ?? '',
    meta: { title: 'Legajo' },
    header: ({ column }) => (
      <div className="flex items-center gap-1">
        <DataTableColumnHeader column={column} title="Legajo" />
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help" aria-label="Coincidencia exacta: ingrese el legajo completo">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Coincidencia exacta: ingrese el legajo completo</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
    cell: ({ row }) => {
      const file = row.original.employees?.file;
      if (!file) return <span className="text-muted-foreground">-</span>;
      return <span className="font-mono font-semibold tabular-nums text-foreground">{file}</span>;
    },
    enableSorting: false,
  },

  // ─── Empleado (identidad) ─────────────────────────────────────────────────
  {
    id: 'employee',
    accessorFn: (row) => (row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : ''),
    meta: { title: 'Empleado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado" />,
    cell: ({ row }) => {
      const emp = row.original.employees;
      if (!emp) return <span className="text-muted-foreground">-</span>;
      return (
        <Link
          href={`/dashboard/employee/action?action=view&employee_id=${emp.id}`}
          className="font-semibold text-foreground hover:text-brand-ink hover:underline"
          target="_blank"
        >
          {emp.lastname} {emp.firstname}
        </Link>
      );
    },
    enableSorting: true,
  },

  // ─── Documento (nombre + obligatorio/opcional + motivo de rechazo) ────────
  {
    id: 'document_type',
    accessorFn: (row) => row.document_types?.name ?? '',
    meta: { title: 'Documento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
    cell: ({ row }) => (
      <DocumentNameCell
        name={row.original.document_types?.name}
        mandatory={row.original.document_types?.mandatory}
        denyReason={row.original.deny_reason}
        state={row.original.state}
        requestedBy={row.original.requestedBy}
        archived={row.original.notApplicable}
      />
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.id_document_types;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Estado ───────────────────────────────────────────────────────────────
  {
    id: 'state',
    accessorKey: 'state',
    meta: { title: 'Estado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => (
      // "Ya no aplica": el tipo dejó de aplicarle al empleado (solo visible en su ficha)
      <DocumentStatePill state={row.original.state} archived={row.original.notApplicable} />
    ),
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id) as string | null;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
    enableSorting: true,
  },

  // ─── Vencimiento ──────────────────────────────────────────────────────────
  {
    id: 'validity',
    accessorKey: 'validity',
    meta: { title: 'Vencimiento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
    cell: ({ row }) => (
      <DocumentExpiryCell
        validity={row.original.document_types?.explired ? row.original.validity : null}
        state={row.original.state}
        archived={row.original.notApplicable}
        missing={row.original.isMissing}
      />
    ),
    enableSorting: true,
  },

  // ─── Subido el ────────────────────────────────────────────────────────────
  {
    id: 'created_at',
    accessorKey: 'created_at',
    meta: { title: 'Subido el' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subido el" />,
    cell: ({ row }) => {
      const uploadedAt = row.original.created_at;
      if (row.original.isMissing || !uploadedAt) {
        return <span className="text-muted-foreground">No disponible</span>;
      }
      return <span className="font-mono tabular-nums">{formatArgentinaDay(uploadedAt)}</span>;
    },
    enableSorting: true,
  },

  // ─── Mandatorio (oculta: ya se ve en la columna Documento) ────────────────
  {
    id: 'mandatory',
    accessorFn: (row) => (row.document_types?.mandatory != null ? String(row.document_types.mandatory) : null),
    meta: { title: 'Mandatorio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mandatorio" />,
    cell: ({ row }) => {
      const val = row.original.document_types?.mandatory;
      if (val == null) return <span className="text-muted-foreground">-</span>;
      return <span>{val ? 'Sí' : 'No'}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.document_types?.mandatory;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
    enableSorting: false,
  },

  // ─── Multirecurso ─────────────────────────────────────────────────────────
  {
    id: 'multiresource',
    accessorFn: (row) => (row.document_types?.multiresource != null ? String(row.document_types.multiresource) : null),
    meta: { title: 'Multirecurso' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Multirecurso" />,
    cell: ({ row }) => {
      const val = row.original.document_types?.multiresource;
      if (val == null) return <span className="text-muted-foreground">-</span>;
      return <span>{val ? 'Sí' : 'No'}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.document_types?.multiresource;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
    enableSorting: false,
  },

  // ─── Motivo de rechazo (oculta: se ve en rojo en la columna Documento) ────
  {
    id: 'deny_reason',
    accessorKey: 'deny_reason',
    meta: { title: 'Motivo de rechazo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de rechazo" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.deny_reason ?? '-'}</span>,
    enableSorting: false,
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true, title: '' },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <ActionsCell row={row} />,
  },
];
