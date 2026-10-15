'use client';

import { Badge } from '@/components/ui/badge';
import { DocumentExpiryCell } from '@/features/Documentacion/shared/components/DocumentCells';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Truck, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { VehicleExpiringDocListItem } from '../lib/expiring-docs-types';

// ============================================================================
// LABELS E ICONOS DE ESTADO
// ============================================================================

export const stateLabels: Record<string, string> = {
  presentado: 'Presentado',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
};

export const stateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  presentado: CheckCircle2,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertTriangle,
};

// Badge variants por estado
const stateBadgeVariants: Record<string, 'default' | 'success' | 'destructive' | 'yellow' | 'secondary'> = {
  presentado: 'default',
  aprobado: 'success',
  rechazado: 'destructive',
  vencido: 'yellow',
};

// ============================================================================
// HELPER — Obtener identificador del vehículo
// ============================================================================

/** Retorna el identificador más relevante del vehículo: dominio > número interno > serie */
function getVehicleDisplayName(vehicle: VehicleExpiringDocListItem['vehicles']): string {
  if (!vehicle) return '';
  return vehicle.domain ?? vehicle.intern_number ?? vehicle.serie ?? 'Sin identificar';
}

/**
 * Retorna el propietario a mostrar. Las unidades de contrato "Propio" no tienen titular
 * externo cargado (owner_id null): en ese caso el propietario es la empresa, no un dato faltante.
 */
function getOwnerDisplayName(vehicle: VehicleExpiringDocListItem['vehicles']): string {
  if (!vehicle) return '';
  if (vehicle.equipment_owners?.name) return vehicle.equipment_owners.name;
  return vehicle.type_of_contract === 'Propio' ? 'Propio' : '';
}

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

// ============================================================================
// DEFINICIÓN DE COLUMNAS
// ============================================================================

export const columns: ColumnDef<VehicleExpiringDocListItem>[] = [
  // ── Vehículo/Equipo (nombre + link) ─────────────────────────────────────
  {
    id: 'vehicle',
    accessorFn: (row) => getVehicleDisplayName(row.vehicles),
    meta: { title: 'Equipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
    cell: ({ row }) => {
      const vehicle = row.original.vehicles;
      if (!vehicle) return <span className="text-muted-foreground">—</span>;

      const displayName = getVehicleDisplayName(vehicle);

      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${vehicle.id}`}
          className="hover:underline font-medium flex items-center gap-2"
        >
          <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {displayName}
        </Link>
      );
    },
    enableHiding: false,
    enableSorting: true,
  },

  // ── Subtipo (FK UUID nullable → sub_type) ────────────────────────────────
  {
    id: 'sub_type',
    accessorFn: (row) => row.vehicles?.sub_type?.name ?? '',
    meta: { title: 'Subtipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo" />,
    cell: ({ row }) =>
      row.original.vehicles?.sub_type?.name ? (
        <Badge variant="secondary">{row.original.vehicles.sub_type.name}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.sub_type?.id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ── Propietario (FK UUID nullable → equipment_owners) ────────────────────
  {
    id: 'owner',
    accessorFn: (row) => getOwnerDisplayName(row.vehicles),
    meta: { title: 'Propietario' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Propietario" />,
    cell: ({ row }) => {
      const owner = getOwnerDisplayName(row.original.vehicles);
      if (!owner) return <span className="text-muted-foreground">—</span>;
      return owner === 'Propio' ? <Badge variant="outline">Propio</Badge> : <span>{owner}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.equipment_owners?.id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ── Tipo de documento (FK → document_types) ──────────────────────────────
  {
    id: 'document_type',
    accessorFn: (row) => row.document_types?.name ?? '',
    meta: { title: 'Tipo de Documento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Documento" />,
    cell: ({ row }) => <span>{row.original.document_types?.name ?? '—'}</span>,
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.id_document_types;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ── Vencimiento (fecha con iconos de urgencia) ───────────────────────────
  {
    accessorKey: 'validity',
    meta: { title: 'Vencimiento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
    cell: ({ row }) => <DocumentExpiryCell validity={row.original.validity} state={row.original.state} />,
  },

  // ── Estado del documento ─────────────────────────────────────────────────
  {
    accessorKey: 'state',
    meta: { title: 'Estado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      const stateVal = row.original.state as string | null;
      if (!stateVal) return <span className="text-muted-foreground">—</span>;

      const Icon = stateIcons[stateVal];
      const label = stateLabels[stateVal] ?? stateVal;
      const variant = stateBadgeVariants[stateVal] ?? 'secondary';

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

  // ── Subido el (fecha de carga) ───────────────────────────────────────────
  {
    accessorKey: 'created_at',
    meta: { title: 'Subido el' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subido el" />,
    cell: ({ row }) => {
      const createdAt = row.original.created_at;
      return createdAt ? (
        <span>{formatArgentinaDay(createdAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },

  // ── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => {
      const docId = row.original.id;
      return (
        <Link
          href={`/dashboard/document/${docId}?resource=Equipos`}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Ver documento
        </Link>
      );
    },
  },
];
