'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DocumentEquipmentCell,
  DocumentNameCell,
  DocumentRowActions,
  DocumentStatePill,
  documentListStateLabels,
  documentStateIcons,
} from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
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

/** Íconos y labels de estado: los mismos que usa la pill de la tabla (los consume el filtro de Estado). */
export const stateIcons = documentStateIcons;
export const stateLabels = documentListStateLabels;

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
    meta: { title: 'Dominio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
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

  // ─── Documento (nombre + obligatorio/opcional + período + motivo de rechazo) ─
  {
    id: 'documentType',
    accessorFn: (row) => row.document_types?.name ?? '',
    meta: { title: 'Documento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
    cell: ({ row }) => (
      <DocumentNameCell
        name={row.original.document_types?.name}
        mandatory={row.original.document_types?.mandatory}
        period={row.original.period}
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

  // ─── Estado ──────────────────────────────────────────────────────────────
  {
    id: 'state',
    accessorKey: 'state',
    meta: { title: 'Estado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => (
      // Documento archivado: historial / ya no aplica (solo visible en el detalle del equipo)
      <DocumentStatePill state={row.original.state} archived={row.original.notApplicable} />
    ),
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id) as string | null;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
    enableSorting: true,
  },

  // ─── Subido el ───────────────────────────────────────────────────────────
  {
    id: 'created_at',
    accessorKey: 'created_at',
    meta: { title: 'Subido el' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subido el" />,
    cell: ({ row }) => {
      // Usar el log más reciente si existe, sino created_at
      const latestLog = row.original.documents_equipment_logs?.[0];
      const date = latestLog?.updated_at ?? row.original.created_at;
      if (row.original.isMissing || !date) return <span className="text-muted-foreground">No disponible</span>;
      return <span className="font-mono tabular-nums">{formatArgentinaDay(date)}</span>;
    },
    enableSorting: true,
  },

  // ─── Afectado a ──────────────────────────────────────────────────────────
  {
    id: 'contractor',
    accessorFn: (row) =>
      row.vehicles?.contractor_equipment
        ?.map((ce) => ce.customers?.name ?? '')
        .filter(Boolean)
        .join(', ') ?? '',
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

  // ─── Mandatorio ──────────────────────────────────────────────────────────
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

  // ─── Multirecurso ────────────────────────────────────────────────────────
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

  // ─── Período (oculta: ya se ve en la columna Documento) ───────────────────
  {
    id: 'period',
    accessorKey: 'period',
    meta: { title: 'Período' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Período" />,
    cell: ({ row }) => <span>{row.original.period ?? '-'}</span>,
    enableSorting: true,
  },

  // ─── Razón de rechazo (oculta: se ve en rojo en la columna Documento) ─────
  {
    id: 'deny_reason',
    accessorKey: 'deny_reason',
    meta: { title: 'Razón de rechazo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Razón de rechazo" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.deny_reason ?? '-'}</span>,
    enableSorting: false,
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <ActionsCell row={row.original} />,
  },
];
