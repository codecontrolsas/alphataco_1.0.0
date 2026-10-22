'use client';

import { Badge } from '@/components/ui/badge';
import {
  documentTypeColumn,
  stateColumn,
  uploadedAtColumn,
  validityColumn,
  viewDocumentColumn,
} from '@/features/Dashboard/Documentacion/components/expiring-doc-columns';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck } from 'lucide-react';
import Link from 'next/link';
import type { VehicleExpiringDocListItem } from '../lib/expiring-docs-types';

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

  documentTypeColumn(),
  validityColumn(),
  stateColumn(),
  uploadedAtColumn(),
  viewDocumentColumn('Equipos'),
];
