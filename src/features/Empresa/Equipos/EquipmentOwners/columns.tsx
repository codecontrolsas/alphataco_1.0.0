'use client';

import { Badge } from '@/components/ui/badge';
import {
  RowLinkButton,
  activeStatusColumn,
  createdAtColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import type { EquipmentOwnerListItem } from './lib/owners-types';

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
// COLUMNS — Tabla principal de titulares
// ============================================================================

export function getEquipmentOwnerColumns(
  permissions: Permissions,
  onEdit: (item: EquipmentOwnerListItem) => void,
  onViewEquipment: (item: EquipmentOwnerListItem) => void
): ColumnDef<EquipmentOwnerListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'titulares', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<EquipmentOwnerListItem>('-'),

    // ── CUIT ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'cuit',
      ...titled('CUIT'),
      cell: ({ row }) => <span className="font-mono">{row.original.cuit ?? '-'}</span>,
    },

    // ── Tipos de Contrato (M:M) ──────────────────────────────────────────────
    {
      id: 'contractTypes',
      accessorFn: (row) => row.equipment_owner_contract_types?.map((ct) => ct.contract_type).join(', ') ?? '',
      ...titled('Tipos de Contrato'),
      cell: ({ row }) => {
        const types = row.original.equipment_owner_contract_types ?? [];
        if (types.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {types.map((ct) => (
              <Badge key={ct.id} variant="outline">
                {ct.contract_type}
              </Badge>
            ))}
          </div>
        );
      },
      enableSorting: false,
    },

    // ── Estado (is_active — booleano nullable) ────────────────────────────────
    activeStatusColumn<EquipmentOwnerListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<EquipmentOwnerListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {canUpdate && (
            <RowLinkButton
              label="Editar"
              ariaLabel={`Editar ${row.original.name ?? 'titular'}`}
              onClick={() => onEdit(row.original)}
            />
          )}
          <RowLinkButton
            label="Ver Equipos"
            ariaLabel={`Ver equipos de ${row.original.name ?? 'titular'}`}
            onClick={() => onViewEquipment(row.original)}
          />
        </div>
      ),
    },
  ];
}
