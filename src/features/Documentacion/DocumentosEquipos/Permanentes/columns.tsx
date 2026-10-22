'use client';

import {
  actionsColumn,
  contractorColumn,
  denyReasonColumn,
  documentStateColumn,
  documentTypeColumn,
  mandatoryColumn,
  multiresourceColumn,
  uploadedAtColumn,
} from '@/features/Documentacion/lists-shared/document-columns';
import { formatExportDbDate } from '@/features/Documentacion/lists-shared/document-list-export';
import {
  DocumentEquipmentCell,
  DocumentExpiryCell,
  DocumentRowActions,
} from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { contractTypeVehiclesLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { EquipmentPermanentDocumentListItem } from './queries.server';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Columnas ocultas por defecto: su dato ya se ve en las columnas principales (Equipo, Documento) o es secundario. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'serie',
  'policy_number',
  'contractor',
  'mandatory',
  'multiresource',
  'deny_reason',
  // Datos del equipo (ocultos por defecto)
  'vehicle_type',
  'vehicle_subtype',
  'vehicle_brand',
  'vehicle_year',
  'vehicle_owner',
  'vehicle_sector',
  'vehicle_chassis',
  'vehicle_engine',
  'vehicle_contract_type',
  'vehicle_contract_expiration',
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Retorna el propietario a mostrar. Las unidades de contrato "Propio" no tienen titular
 * externo cargado (owner_id null): en ese caso el propietario es la empresa, no un dato faltante.
 * Retorna string vacío cuando no hay dato, para que la celda renderice el guión habitual.
 */
function getOwnerDisplayName(vehicle: EquipmentPermanentDocumentListItem['vehicles']): string {
  if (!vehicle) return '';
  if (vehicle.equipment_owners?.name) return vehicle.equipment_owners.name;
  return vehicle.type_of_contract === 'Propio' ? 'Propio' : '';
}

// ============================================================================
// ACTIONS CELL
// ============================================================================

function ActionsCell({ row }: { row: EquipmentPermanentDocumentListItem }) {
  const isPrivateDocType = row.document_types?.private === true;

  return (
    <DocumentRowActions
      documentId={row.id}
      documentName={row.document_types?.name}
      state={row.state}
      archived={row.notApplicable}
      resource="Equipos"
      viewTab="docs-equipos-permanentes"
      upload={{
        // Para tipos privados, verificar permiso upload_private en la tab padre
        tab: isPrivateDocType ? 'documentos-de-equipos' : 'docs-equipos-permanentes',
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
// COLUMNS DEFINITION
// ============================================================================

export const columns: ColumnDef<EquipmentPermanentDocumentListItem>[] = [
  // ─── Dominio (identidad: mono) ────────────────────────────────────────────
  {
    id: 'vehicle',
    accessorFn: (row) => row.vehicles?.domain ?? row.vehicles?.serie ?? '',
    ...titled('Dominio'),
    cell: ({ row }) => {
      const v = row.original.vehicles;
      if (!v) return <span className="text-muted-foreground">-</span>;
      const label = v.domain ?? v.serie ?? v.intern_number ?? '-';
      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${v.id}`}
          className="font-mono font-semibold tabular-nums text-foreground hover:text-brand-ink hover:underline"
          target="_blank"
        >
          {label}
        </Link>
      );
    },
    enableSorting: true,
  },

  // ─── Equipo (identidad compuesta: Marca Modelo / tipo · afectado a) ───────
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
    // 'equipment' no es un campo ordenable en lib/where.ts (VALID_SORT_FIELDS)
    enableSorting: false,
  },

  // Documento (nombre + obligatorio/opcional + motivo de rechazo)
  documentTypeColumn<EquipmentPermanentDocumentListItem>('document_type', false),
  // Documento archivado: historial / no vigente (solo visible en el detalle del equipo)
  documentStateColumn<EquipmentPermanentDocumentListItem>(),

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

  // Usa la fecha del log más reciente si existe, sino created_at
  uploadedAtColumn<EquipmentPermanentDocumentListItem>((row) => row.documents_equipment_logs?.[0]?.updated_at),

  // ─── Serie (vehicles.serie) ──────────────────────────────────────────────
  {
    id: 'serie',
    accessorFn: (row) => row.vehicles?.serie ?? '',
    ...titled('Serie'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.serie ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: false,
  },

  // ─── N° de Póliza (documents_equipment.policy_number) ────────────────────
  {
    id: 'policy_number',
    accessorKey: 'policy_number',
    ...titled('N° de Póliza'),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.policy_number ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  contractorColumn<EquipmentPermanentDocumentListItem>((row) => row.vehicles?.contractor_equipment),
  mandatoryColumn<EquipmentPermanentDocumentListItem>(),
  multiresourceColumn<EquipmentPermanentDocumentListItem>(),
  denyReasonColumn<EquipmentPermanentDocumentListItem>('Motivo de rechazo'),

  // ─── Tipo (vehicles.type → type_vehicles_typeTotype) ─────────────────────
  {
    id: 'vehicle_type',
    accessorFn: (row) => row.vehicles?.type_vehicles_typeTotype?.name ?? '',
    ...titled('Tipo'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.type_vehicles_typeTotype?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.type;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Subtipo (vehicles.subType → sub_type) ────────────────────────────────
  {
    id: 'vehicle_subtype',
    accessorFn: (row) => row.vehicles?.sub_type?.name ?? '',
    ...titled('Subtipo'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.sub_type?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.subType;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Marca (vehicles.brand → brand_vehicles, id es Int) ───────────────────
  {
    id: 'vehicle_brand',
    accessorFn: (row) => row.vehicles?.brand_vehicles?.name ?? '',
    ...titled('Marca'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.brand_vehicles?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const brandId = row.original.vehicles?.brand;
      if (brandId == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(brandId));
    },
    enableSorting: true,
  },

  // ─── Año (vehicles.year, string directo) ─────────────────────────────────
  {
    id: 'vehicle_year',
    accessorFn: (row) => row.vehicles?.year ?? '',
    ...titled('Año'),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.vehicles?.year ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  // ─── Propietario (vehicles.owner_id → equipment_owners) ──────────────────
  {
    id: 'vehicle_owner',
    accessorFn: (row) => getOwnerDisplayName(row.vehicles),
    ...titled('Propietario'),
    cell: ({ row }) => {
      const owner = getOwnerDisplayName(row.original.vehicles);
      return <span className="text-sm">{owner || <span className="text-muted-foreground">-</span>}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.owner_id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Sector (vehicles.sector → hierarchy) ────────────────────────────────
  {
    id: 'vehicle_sector',
    accessorFn: (row) => row.vehicles?.hierarchy?.name ?? '',
    ...titled('Sector'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.hierarchy?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.sector;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Chasis (vehicles.chassis, string opcional directo) ──────────────────
  {
    id: 'vehicle_chassis',
    accessorFn: (row) => row.vehicles?.chassis ?? '',
    ...titled('Chasis'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.chassis ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: true,
  },

  // ─── Motor (vehicles.engine, string directo) ─────────────────────────────
  {
    id: 'vehicle_engine',
    accessorFn: (row) => row.vehicles?.engine ?? '',
    ...titled('Motor'),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.engine ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: true,
  },

  // ─── Tipo de contrato (vehicles.type_of_contract, enum) ──────────────────
  {
    id: 'vehicle_contract_type',
    accessorFn: (row) => {
      const val = row.vehicles?.type_of_contract;
      if (!val) return '';
      return contractTypeVehiclesLabels[val] ?? val;
    },
    ...titled('Tipo de contrato'),
    cell: ({ row }) => {
      const val = row.original.vehicles?.type_of_contract;
      if (!val) return <span className="text-muted-foreground">-</span>;
      return <span className="text-sm">{contractTypeVehiclesLabels[val] ?? val}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.vehicles?.type_of_contract;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
    enableSorting: true,
  },

  // ─── Vencimiento de contrato (vehicles.contract_expiration_date, fecha) ──
  {
    id: 'vehicle_contract_expiration',
    accessorFn: (row) => row.vehicles?.contract_expiration_date ?? null,
    ...titled('Venc. de contrato'),
    cell: ({ row }) => {
      const date = row.original.vehicles?.contract_expiration_date;
      if (!date) return <span className="text-muted-foreground">-</span>;
      // `contract_expiration_date` es @db.Date (medianoche UTC): en hora argentina caería un día antes.
      return <span className="text-sm">{formatExportDbDate(date)}</span>;
    },
    enableSorting: true,
  },

  actionsColumn<EquipmentPermanentDocumentListItem>((row) => <ActionsCell row={row} />),
];
