'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DocumentEquipmentCell,
  DocumentExpiryCell,
  DocumentNameCell,
  DocumentRowActions,
  DocumentStatePill,
  documentStateIcons,
} from '@/features/Documentacion/shared/components/DocumentCells';
import SimpleDocument from '@/features/Documentacion/shared/components/SimpleDocument';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { contractTypeVehiclesLabels, documentStateLabels } from '@/shared/utils/mappers';
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

/** Íconos y labels de estado: los mismos que usa la pill de la tabla (los consume el filtro de Estado). */
export const stateIcons = documentStateIcons;
export const stateLabels = documentStateLabels;

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
      archived={row.archived_at != null}
      resource="Equipos"
      viewTab="docs-equipos-permanentes"
      upload={{
        // Para tipos privados, verificar permiso upload_private en la tab padre
        tab: isPrivateDocType ? 'documentos-de-equipos' : 'docs-equipos-permanentes',
        action: isPrivateDocType ? 'upload_private' : 'update',
        render: (close) => (
          <SimpleDocument
            resource="equipo"
            handleOpen={close}
            defaultDocumentId={row.id_document_types ?? undefined}
            numberDocument={row.vehicles?.id ?? undefined}
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
    meta: { title: 'Dominio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
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
      // Documento archivado: historial / no vigente (solo visible en el detalle del equipo)
      <DocumentStatePill state={row.original.state} archived={row.original.archived_at != null} />
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
        archived={row.original.archived_at != null}
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
      if (row.original.state === 'pendiente') {
        return <span className="text-muted-foreground">No disponible</span>;
      }
      // Usar la fecha del log más reciente si existe, sino created_at
      const latestLog = row.original.documents_equipment_logs?.[0];
      const date = latestLog?.updated_at ?? row.original.created_at;
      return <span className="font-mono tabular-nums">{formatArgentinaDay(date)}</span>;
    },
    enableSorting: true,
  },

  // ─── Serie (vehicles.serie) ──────────────────────────────────────────────
  {
    id: 'serie',
    accessorFn: (row) => row.vehicles?.serie ?? '',
    meta: { title: 'Serie' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Serie" />,
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
    meta: { title: 'N° de Póliza' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° de Póliza" />,
    cell: ({ row }) => (
      <span className="text-sm">{row.original.policy_number ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  // ─── Afectado a ───────────────────────────────────────────────────────────
  {
    id: 'contractor',
    accessorFn: (row) => {
      const names = row.vehicles?.contractor_equipment?.map((ce) => ce.customers?.name ?? '').filter(Boolean) ?? [];
      return names.join(', ');
    },
    meta: { title: 'Afectado a' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Afectado a" />,
    cell: ({ row }) => {
      const contractors =
        row.original.vehicles?.contractor_equipment?.map((ce) => ce.customers?.name ?? '').filter(Boolean) ?? [];

      if (contractors.length === 0) return <Badge variant="outline">Sin afectar</Badge>;

      const [first, ...rest] = contractors;
      if (rest.length === 0) return <Badge>{first}</Badge>;

      return (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="cursor-pointer">
                {first} +{rest.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-black text-white rounded-lg p-2">
              <div className="flex flex-col gap-1">
                {contractors.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    filterFn: (row, _id, value: string[]) => {
      const contractors = row.original.vehicles?.contractor_equipment ?? [];
      if (contractors.length === 0) return value.includes(NULL_FILTER_VALUE);
      return contractors.some((ce) => ce.customers?.id && value.includes(ce.customers.id));
    },
    enableSorting: false,
  },

  // ─── Mandatorio ───────────────────────────────────────────────────────────
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

  // ─── Motivo de rechazo ────────────────────────────────────────────────────
  {
    id: 'deny_reason',
    accessorKey: 'deny_reason',
    meta: { title: 'Motivo de rechazo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de rechazo" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.deny_reason ?? '-'}</span>,
    enableSorting: false,
  },

  // ─── Tipo (vehicles.type → type_vehicles_typeTotype) ─────────────────────
  {
    id: 'vehicle_type',
    accessorFn: (row) => row.vehicles?.type_vehicles_typeTotype?.name ?? '',
    meta: { title: 'Tipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
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
    meta: { title: 'Subtipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo" />,
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
    meta: { title: 'Marca' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
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
    meta: { title: 'Año' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
    cell: ({ row }) => (
      <span className="text-sm">{row.original.vehicles?.year ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  // ─── Propietario (vehicles.owner_id → equipment_owners) ──────────────────
  {
    id: 'vehicle_owner',
    accessorFn: (row) => getOwnerDisplayName(row.vehicles),
    meta: { title: 'Propietario' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Propietario" />,
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
    meta: { title: 'Sector' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
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
    meta: { title: 'Chasis' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Chasis" />,
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
    meta: { title: 'Motor' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motor" />,
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
    meta: { title: 'Tipo de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de contrato" />,
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
    meta: { title: 'Venc. de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Venc. de contrato" />,
    cell: ({ row }) => {
      const date = row.original.vehicles?.contract_expiration_date;
      if (!date) return <span className="text-muted-foreground">-</span>;
      return <span className="text-sm">{formatArgentinaDay(date)}</span>;
    },
    enableSorting: true,
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true, title: '' },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <ActionsCell row={row.original} />,
  },
];
