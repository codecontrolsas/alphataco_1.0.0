'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
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
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name ?? '-'}</span>,
    },

    // ── CUIT ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'cuit',
      meta: { title: 'CUIT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIT" />,
      cell: ({ row }) => <span className="font-mono">{row.original.cuit ?? '-'}</span>,
    },

    // ── Tipos de Contrato (M:M) ──────────────────────────────────────────────
    {
      id: 'contractTypes',
      accessorFn: (row) => row.equipment_owner_contract_types?.map((ct) => ct.contract_type).join(', ') ?? '',
      meta: { title: 'Tipos de Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipos de Contrato" />,
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
    {
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => {
        const val = row.original.created_at;
        return <span>{val ? formatArgentinaDay(val) : '-'}</span>;
      },
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {canUpdate && (
            <Button
              size="sm"
              variant="link"
              type="button"
              className="h-auto p-0"
              aria-label={`Editar ${row.original.name ?? 'titular'}`}
              onClick={() => onEdit(row.original)}
            >
              Editar
            </Button>
          )}
          <Button
            size="sm"
            variant="link"
            type="button"
            className="h-auto p-0"
            aria-label={`Ver equipos de ${row.original.name ?? 'titular'}`}
            onClick={() => onViewEquipment(row.original)}
          >
            Ver Equipos
          </Button>
        </div>
      ),
    },
  ];
}
