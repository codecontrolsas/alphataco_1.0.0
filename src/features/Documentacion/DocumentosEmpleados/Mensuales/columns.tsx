'use client';

import {
  actionsColumn,
  contractorColumn,
  denyReasonColumn,
  documentStateColumn,
  documentTypeColumn,
  employeeIdentityColumns,
  mandatoryColumn,
  multiresourceColumn,
  periodColumn,
  uploadedAtColumn,
} from '@/features/Documentacion/lists-shared/document-columns';
import { DocumentRowActions } from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import type { ColumnDef } from '@tanstack/react-table';
import type { MonthlyEmployeeDocumentListItem } from './actions.server';

// ============================================================================
// COLUMN DEFAULTS
// ============================================================================

/** Columnas ocultas por defecto: su dato ya se ve en las columnas principales (Documento) o es secundario. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'contractor',
  'mandatory',
  'multiresource',
  'period',
  'deny_reason',
];

// ============================================================================
// ACTIONS CELL
// ============================================================================

function ActionsCell({ row }: { row: MonthlyEmployeeDocumentListItem }) {
  const isPrivateDocType = row.document_types?.private === true;

  return (
    <DocumentRowActions
      documentId={row.id}
      documentName={row.document_types?.name}
      state={row.state}
      archived={row.notApplicable}
      resource={row.employees ? 'Persona' : 'Equipos'}
      viewTab="docs-empleados-mensuales"
      upload={{
        // Para tipos privados, verificar permiso upload_private en la tab padre
        tab: isPrivateDocType ? 'documentos-de-empleados' : 'docs-empleados-mensuales',
        action: isPrivateDocType ? 'upload_private' : 'update',
        // Fila faltante: recurso, tipo y período vienen fijos
        render: (close) => (
          <RequirementUpload
            kind="employee"
            resourceId={row.applies}
            documentTypeId={row.id_document_types}
            period={row.period}
            close={close}
          />
        ),
      }}
    />
  );
}

// ============================================================================
// COLUMNS
// ============================================================================

export const columns: ColumnDef<MonthlyEmployeeDocumentListItem>[] = [
  // Legajo (identidad: mono, negrita, antes del nombre) y Empleado
  ...employeeIdentityColumns<MonthlyEmployeeDocumentListItem>((row) => row.employees),
  // Documento (nombre + obligatorio/opcional + período + motivo de rechazo)
  documentTypeColumn<MonthlyEmployeeDocumentListItem>('documentType', true),
  // "Ya no aplica": el tipo dejó de aplicarle al empleado (solo visible en su ficha)
  documentStateColumn<MonthlyEmployeeDocumentListItem>(),
  // Usa el log más reciente si existe, sino created_at
  uploadedAtColumn<MonthlyEmployeeDocumentListItem>((row) => row.documents_employees_logs?.[0]?.updated_at),
  contractorColumn<MonthlyEmployeeDocumentListItem>((row) => row.employees?.contractor_employee),
  mandatoryColumn<MonthlyEmployeeDocumentListItem>(),
  multiresourceColumn<MonthlyEmployeeDocumentListItem>(),
  // Período (oculta: ya se ve en la columna Documento)
  periodColumn<MonthlyEmployeeDocumentListItem>(),
  // Razón de rechazo (oculta: se ve en rojo en la columna Documento)
  denyReasonColumn<MonthlyEmployeeDocumentListItem>('Razón de rechazo'),
  actionsColumn<MonthlyEmployeeDocumentListItem>((row) => <ActionsCell row={row} />),
];
