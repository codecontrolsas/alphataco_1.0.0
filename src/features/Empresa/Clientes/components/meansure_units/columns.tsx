'use client';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, TrashIcon } from 'lucide-react';
import type { MeasureUnitListItem } from '../../actions/measure-units.server';

export const MEASURE_UNITS_TABLE_ID = 'measure-units';

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

export function getColumns(
  permissions: Permissions,
  onEdit: (unit: MeasureUnitListItem) => void,
  onDelete: (unit: MeasureUnitListItem) => void
): ColumnDef<MeasureUnitListItem>[] {
  const canEdit = permissions.hasPermission('comercial', 'mensure_units', 'update');
  // Borrar tiene su propia acción; el servidor además rechaza una unidad en uso por ítems de contrato.
  const canDelete = permissions.hasPermission('comercial', 'mensure_units', 'delete');

  return [
    {
      accessorKey: 'simbol',
      meta: { title: 'Símbolo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Símbolo" />,
      cell: ({ row }) => <span className="font-medium">{row.original.simbol}</span>,
    },
    {
      accessorKey: 'unit',
      meta: { title: 'Unidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unidad" />,
      cell: ({ row }) => <span>{row.original.unit}</span>,
    },
    {
      accessorKey: 'tipo',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => <span>{row.original.tipo}</span>,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    ...(canEdit || canDelete
      ? ([
          {
            id: 'actions',
            meta: { title: '', excludeFromExport: true },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <div className="flex items-center gap-2">
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(row.original)}
                    title="Editar unidad"
                    aria-label={`Editar ${row.original.simbol}`}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(row.original)}
                    title="Eliminar unidad"
                    aria-label={`Eliminar ${row.original.simbol}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ),
          },
        ] as ColumnDef<MeasureUnitListItem>[])
      : []),
  ];
}
