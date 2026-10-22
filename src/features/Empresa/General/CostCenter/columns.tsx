'use client';

import {
  activeStatusColumn,
  createdAtColumn,
  editActionColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import type { ColumnDef } from '@tanstack/react-table';
import type { CostCenterListItem } from './actions.server';

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
  onEdit: (item: CostCenterListItem) => void
): ColumnDef<CostCenterListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'cost-center', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<CostCenterListItem>(),

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<CostCenterListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<CostCenterListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<CostCenterListItem>({ canEdit: canUpdate, onEdit, getName: (item) => item.name }),
  ];
}
