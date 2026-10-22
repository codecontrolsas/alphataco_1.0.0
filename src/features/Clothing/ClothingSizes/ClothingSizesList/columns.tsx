'use client';

import {
  catalogActionsColumns,
  catalogActiveColumn,
  catalogCreatedAtColumn,
  catalogNameColumn,
} from '@/features/Clothing/components/catalog-columns';
import type { PermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import type { ColumnDef } from '@tanstack/react-table';
import type { ClothingSizeListItem } from './actions.server';

// ============================================================================
// TYPES
// ============================================================================

type ColumnCallbacks = {
  onEdit: (size: ClothingSizeListItem) => void;
  onToggleActive: (size: ClothingSizeListItem) => void;
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at'];

// ============================================================================
// COLUMNS FACTORY
// ============================================================================

export function getColumns(
  permissions: PermissionChecker,
  callbacks: ColumnCallbacks
): ColumnDef<ClothingSizeListItem>[] {
  return [
    catalogNameColumn(false),
    catalogActiveColumn('destructive'),
    catalogCreatedAtColumn(),
    ...catalogActionsColumns<ClothingSizeListItem>({
      canUpdate: permissions.hasPermission('configuracion', 'talles_indumentaria', 'update'),
      canDelete: permissions.hasPermission('configuracion', 'talles_indumentaria', 'delete'),
      ...callbacks,
    }),
  ];
}
