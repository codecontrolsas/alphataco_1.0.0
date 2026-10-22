'use client';

import {
  actionsColumn,
  denyReasonColumn,
  documentStateColumn,
  documentTypeColumn,
  employeeIdentityColumns,
  mandatoryColumn,
  multiresourceColumn,
  uploadedAtColumn,
} from '@/features/Documentacion/lists-shared/document-columns';
import { DocumentExpiryCell, DocumentRowActions } from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
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
  // Legajo (identidad: mono, negrita, antes del nombre) y Empleado
  ...employeeIdentityColumns<EmployeePermanentDocumentListItem>((row) => row.employees),
  // Documento (nombre + obligatorio/opcional + motivo de rechazo)
  documentTypeColumn<EmployeePermanentDocumentListItem>('document_type', false),
  // "Ya no aplica": el tipo dejó de aplicarle al empleado (solo visible en su ficha)
  documentStateColumn<EmployeePermanentDocumentListItem>(),
  // ─── Vencimiento ──────────────────────────────────────────────────────────
  {
    id: 'validity',
    accessorKey: 'validity',
    ...titled('Vencimiento'),
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

  uploadedAtColumn<EmployeePermanentDocumentListItem>(),
  // Mandatorio (oculta: ya se ve en la columna Documento)
  mandatoryColumn<EmployeePermanentDocumentListItem>(),
  multiresourceColumn<EmployeePermanentDocumentListItem>(),
  // Motivo de rechazo (oculta: se ve en rojo en la columna Documento)
  denyReasonColumn<EmployeePermanentDocumentListItem>('Motivo de rechazo'),
  actionsColumn<EmployeePermanentDocumentListItem>((row) => <ActionsCell row={{ original: row }} />),
];
