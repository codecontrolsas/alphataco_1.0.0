'use client';

import {
  RowLinkButton,
  activeStatusColumn,
  createdAtColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import type { ColumnDef } from '@tanstack/react-table';
import type { EquipmentBrandListItem } from './actions.server';

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
  onEdit: (item: EquipmentBrandListItem) => void,
  /** Acción de fila "Ver modelos": filtra la tabla relacionada. Si no se pasa, la acción no se muestra. */
  onViewRelated?: (item: EquipmentBrandListItem) => void
): ColumnDef<EquipmentBrandListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'marcas', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<EquipmentBrandListItem>('-'),

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<EquipmentBrandListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<EquipmentBrandListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...(canUpdate || onViewRelated
      ? ([
          {
            id: 'actions',
            meta: { title: '', excludeFromExport: true },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <div className="flex items-center gap-3">
                {canUpdate ? (
                  <RowLinkButton
                    label="Editar"
                    ariaLabel={`Editar ${row.original.name ?? 'marca'}`}
                    onClick={() => onEdit(row.original)}
                  />
                ) : null}
                {onViewRelated ? (
                  <RowLinkButton
                    label="Ver modelos"
                    ariaLabel={`Ver modelos de ${row.original.name ?? 'marca'}`}
                    onClick={() => onViewRelated(row.original)}
                  />
                ) : null}
              </div>
            ),
          },
        ] as ColumnDef<EquipmentBrandListItem>[])
      : []),
  ];
}
