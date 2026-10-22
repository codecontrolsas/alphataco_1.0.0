'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2 } from 'lucide-react';
import { ExternalAccessActionsCell } from '../components/ExternalAccessActionsCell';
import type { ExternalApiClientListItem } from './lib/clients-types';

// ============================================================================
// STATUS CONFIG (derivado de revoked_at — no es un enum de la BD)
// ============================================================================

export const externalApiClientStatusLabels: Record<string, string> = {
  active: 'Activo',
  revoked: 'Revocado',
};

export const externalApiClientStatusIcons: Record<string, typeof CheckCircle2> = {
  active: CheckCircle2,
  revoked: Ban,
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at', 'notes'];

// ============================================================================
// PERMISOS
// ============================================================================

interface ColumnPermissions {
  canUpdate: boolean;
  canDelete: boolean;
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export function getColumns({ canUpdate, canDelete }: ColumnPermissions): ColumnDef<ExternalApiClientListItem>[] {
  return [
    // ─── Sistema ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Sistema' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sistema" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },

    // ─── Usuario (client_id) ──────────────────────────────────────────────────
    {
      accessorKey: 'client_id',
      meta: { title: 'Usuario' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Usuario" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.client_id}</span>,
    },

    // ─── Estado (derivado de revoked_at) ──────────────────────────────────────
    {
      id: 'status',
      accessorFn: (row) => (row.revoked_at ? 'revoked' : 'active'),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const isRevoked = row.original.revoked_at != null;
        const Icon = isRevoked ? Ban : CheckCircle2;
        return (
          <Badge variant={isRevoked ? 'secondary' : 'success'} className="gap-1">
            <Icon className="h-3 w-3" />
            {isRevoked ? 'Revocado' : 'Activo'}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const isRevoked = row.original.revoked_at != null;
        return value.includes(isRevoked ? 'revoked' : 'active');
      },
      enableSorting: true,
    },

    // ─── Última consulta ──────────────────────────────────────────────────────
    {
      accessorKey: 'last_used_at',
      meta: { title: 'Última consulta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Última consulta" />,
      cell: ({ row }) =>
        row.original.last_used_at ? (
          <span>{formatArgentinaDateTime(row.original.last_used_at)}</span>
        ) : (
          <span className="text-muted-foreground">Nunca</span>
        ),
    },

    // ─── Creado (oculta por defecto) ──────────────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Creado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => <span>{formatArgentinaDay(row.original.created_at)}</span>,
    },

    // ─── Creado por (FK nullable a profile) ───────────────────────────────────
    {
      id: 'creator',
      accessorFn: (row) => row.creator?.fullname ?? '',
      meta: { title: 'Creado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado por" />,
      cell: ({ row }) => (
        <span>{row.original.creator?.fullname ?? <span className="text-muted-foreground">Sin asignar</span>}</span>
      ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.creator?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ─── Notas (oculta por defecto) ───────────────────────────────────────────
    {
      accessorKey: 'notes',
      meta: { title: 'Notas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
      cell: ({ row }) => <span className="text-sm">{row.original.notes || '-'}</span>,
    },

    // ─── Acciones ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <ExternalAccessActionsCell
          id={row.original.id}
          name={row.original.name}
          revokedAt={row.original.revoked_at}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
