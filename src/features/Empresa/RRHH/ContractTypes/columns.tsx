'use client';

import {
  activeStatusColumn,
  createdAtColumn,
  editActionColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContractTypeListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

// ============================================================================
// PERMISSIONS TYPE
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (item: ContractTypeListItem) => void
): ColumnDef<ContractTypeListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'contract-types', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<ContractTypeListItem>(),

    // ── Descripción (texto nullable) ─────────────────────────────────────────
    {
      accessorKey: 'description',
      ...titled('Descripción'),
      cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.description || '-'}</span>,
      // filterFn no necesario para filtros text
    },

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<ContractTypeListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<ContractTypeListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<ContractTypeListItem>({ canEdit: canUpdate, onEdit, getName: (item) => item.name }),
  ];
}
