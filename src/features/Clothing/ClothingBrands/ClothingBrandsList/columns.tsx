'use client';

import {
  catalogActionsColumns,
  catalogActiveColumn,
  catalogCreatedAtColumn,
  catalogNameColumn,
} from '@/features/Clothing/components/catalog-columns';
import type { PermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import type { ColumnDef } from '@tanstack/react-table';
import type { ClothingBrandListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at'];

// ============================================================================
// TYPES
// ============================================================================

type ActionsHandlers = {
  onEdit: (brand: ClothingBrandListItem) => void;
  onToggleActive: (brand: ClothingBrandListItem) => void;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: PermissionChecker,
  handlers: ActionsHandlers
): ColumnDef<ClothingBrandListItem>[] {
  return [
    catalogNameColumn(true),
    catalogActiveColumn('muted'),
    catalogCreatedAtColumn(),
    ...catalogActionsColumns<ClothingBrandListItem>({
      canUpdate: permissions.hasPermission('configuracion', 'marcas_indumentaria', 'update'),
      canDelete: permissions.hasPermission('configuracion', 'marcas_indumentaria', 'delete'),
      ...handlers,
    }),
  ];
}
