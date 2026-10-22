'use client';

import {
  actionsColumn,
  contractorColumn,
  denyReasonColumn,
  documentStateColumn,
  documentTypeColumn,
  mandatoryColumn,
  multiresourceColumn,
  periodColumn,
  uploadedAtColumn,
} from '@/features/Documentacion/lists-shared/document-columns';
import { DocumentEquipmentCell, DocumentRowActions } from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { MonthlyEquipmentDocumentListItem } from './actions.server';

// ============================================================================
// COLUMN DEFAULTS
// ============================================================================

/** Columnas ocultas por defecto: su dato ya se ve en las columnas principales (Equipo, Documento) o es secundario. */
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

function ActionsCell({ row }: { row: MonthlyEquipmentDocumentListItem }) {
  const isPrivateDocType = row.document_types?.private === true;

  return (
    <DocumentRowActions
      documentId={row.id}
      documentName={row.document_types?.name}
      state={row.state}
      archived={row.notApplicable}
      resource={row.vehicles ? 'Equipos' : 'Persona'}
      viewTab="docs-equipos-mensuales"
      upload={{
        // Para tipos privados, verificar permiso upload_private en la tab padre
        tab: isPrivateDocType ? 'documentos-de-equipos' : 'docs-equipos-mensuales',
        action: isPrivateDocType ? 'upload_private' : 'update',
        render: (close) => (
          <RequirementUpload
            kind="vehicle"
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

export const columns: ColumnDef<MonthlyEquipmentDocumentListItem>[] = [
  // ─── Dominio (identidad: mono) ───────────────────────────────────────────
  {
    id: 'vehicle',
    accessorFn: (row) => row.vehicles?.domain ?? row.vehicles?.serie ?? row.vehicles?.intern_number ?? '',
    ...titled('Dominio'),
    cell: ({ row }) => {
      const vehicle = row.original.vehicles;
      if (!vehicle) return <span className="text-muted-foreground">-</span>;
      const label = vehicle.domain ?? vehicle.serie ?? vehicle.intern_number ?? vehicle.id;
      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${vehicle.id}`}
          className="font-mono font-semibold tabular-nums text-foreground hover:text-brand-ink hover:underline"
          target="_blank"
        >
          {label}
        </Link>
      );
    },
    enableSorting: true,
  },

  // ─── Equipo (identidad compuesta: Marca Modelo / tipo · afectado a) ──────
  {
    id: 'equipment',
    accessorFn: (row) =>
      [row.vehicles?.brand_vehicles?.name, row.vehicles?.model_vehicles?.name].filter(Boolean).join(' '),
    meta: { title: 'Equipo', excludeFromExport: true },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
    cell: ({ row }) => (
      <DocumentEquipmentCell
        brand={row.original.vehicles?.brand_vehicles?.name}
        model={row.original.vehicles?.model_vehicles?.name}
        type={row.original.vehicles?.type_vehicles_typeTotype?.name}
        contractors={
          row.original.vehicles?.contractor_equipment?.map((ce) => ce.customers?.name ?? '').filter(Boolean) ?? []
        }
      />
    ),
    // 'equipment' no es un campo ordenable en actions.server.ts (VALID_SORT_FIELDS)
    enableSorting: false,
  },

  // Documento (nombre + obligatorio/opcional + período + motivo de rechazo)
  documentTypeColumn<MonthlyEquipmentDocumentListItem>('documentType', true),
  // Documento archivado: historial / ya no aplica (solo visible en el detalle del equipo)
  documentStateColumn<MonthlyEquipmentDocumentListItem>(),
  // Usa el log más reciente si existe, sino created_at
  uploadedAtColumn<MonthlyEquipmentDocumentListItem>((row) => row.documents_equipment_logs?.[0]?.updated_at),
  contractorColumn<MonthlyEquipmentDocumentListItem>((row) => row.vehicles?.contractor_equipment),
  mandatoryColumn<MonthlyEquipmentDocumentListItem>(),
  multiresourceColumn<MonthlyEquipmentDocumentListItem>(),
  // Período (oculta: ya se ve en la columna Documento)
  periodColumn<MonthlyEquipmentDocumentListItem>(),
  // Razón de rechazo (oculta: se ve en rojo en la columna Documento)
  denyReasonColumn<MonthlyEquipmentDocumentListItem>('Razón de rechazo'),
  actionsColumn<MonthlyEquipmentDocumentListItem>((row) => <ActionsCell row={row} />),
];
