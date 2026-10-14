'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import {
  inMemoryDateSortingFn,
  inMemoryFacetedFilterFn,
  inMemoryTextFilterFn,
} from '@/shared/components/common/DataTable/in-memory';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef, FilterFn } from '@tanstack/react-table';
import { ArrowDown, ArrowRight, ArrowUp, Check, X } from 'lucide-react';
import type { TypeOfRepairData } from './actions/actions';

/** Fila de la tabla: el tipo sale del retorno de la action, no de los tipos legacy. */
export type RepairTypeRow = TypeOfRepairData & Record<string, unknown>;

export const CRITICITY_ICONS = { Alta: ArrowUp, Media: ArrowRight, Baja: ArrowDown } as const;

const yesNo = (value: boolean | null | undefined) => (value ? 'Sí' : 'No');

/** Faceted sobre columna nullable: el valor vacío se filtra con la opción "Sin asignar". */
export const nullableFacetedFilterFn: FilterFn<RepairTypeRow> = (row, columnId, filterValue) => {
  const raw = row.getValue(columnId);
  if (raw == null || raw === '') return Array.isArray(filterValue) && filterValue.includes(NULL_FILTER_VALUE);
  return inMemoryFacetedFilterFn(row, columnId, filterValue);
};

/** Columnas que se muestran solo si el usuario las activa. */
export const REPAIR_TYPE_HIDDEN_COLUMNS = ['description', 'multi_equipment', 'qr_close', 'created_at'];

function BooleanBadge({ value, activeVariant }: { value: boolean; activeVariant: 'success' | 'warning' }) {
  const Icon = value ? Check : X;
  return (
    <Badge variant={value ? activeVariant : 'outline'}>
      <Icon aria-hidden="true" className="mr-1 h-3 w-3" />
      {yesNo(value)}
    </Badge>
  );
}

export function getRepairTypeColumns(onEdit: (repair: RepairTypeRow) => void, canEdit: boolean): ColumnDef<RepairTypeRow>[] {
  const columns: ColumnDef<RepairTypeRow>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'description',
      accessorKey: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => <span className="whitespace-pre-line">{row.original.description}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'criticity',
      accessorKey: 'criticity',
      meta: { title: 'Criticidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Criticidad" />,
      cell: ({ row }) => {
        const criticity = row.original.criticity;
        if (!criticity) return <span className="text-muted-foreground">-</span>;
        const Icon = CRITICITY_ICONS[criticity as keyof typeof CRITICITY_ICONS];
        return (
          <Badge variant={criticity === 'Alta' ? 'destructive' : criticity === 'Media' ? 'warning' : 'default'}>
            {Icon && <Icon aria-hidden="true" className="mr-1 h-3 w-3" />}
            {criticity}
          </Badge>
        );
      },
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'is_active',
      accessorFn: (row) => (row.is_active ? 'Activo' : 'Inactivo'),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'default'}>
          {row.original.is_active ? <Check aria-hidden="true" className="mr-1 h-3 w-3" /> : <X aria-hidden="true" className="mr-1 h-3 w-3" />}
          {row.original.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'type_of_maintenance',
      accessorKey: 'type_of_maintenance',
      meta: { title: 'Tipo de Mantenimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Mantenimiento" />,
      cell: ({ row }) =>
        row.original.type_of_maintenance ? (
          <Badge variant={row.original.type_of_maintenance === 'Correctivo' ? 'warning' : 'success'}>
            {row.original.type_of_maintenance}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'autorizable',
      accessorFn: (row) => yesNo(row.autorizable),
      meta: { title: 'Autorizable' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Autorizable" />,
      cell: ({ row }) => <BooleanBadge value={row.original.autorizable} activeVariant="warning" />,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'multi_equipment',
      accessorFn: (row) => yesNo(row.multi_equipment),
      meta: { title: 'Multi equipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Multi equipo" />,
      cell: ({ row }) => <BooleanBadge value={row.original.multi_equipment} activeVariant="success" />,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'qr_close',
      accessorFn: (row) => yesNo(row.qr_close),
      meta: { title: 'Cierre por QR' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cierre por QR" />,
      cell: ({ row }) => <BooleanBadge value={row.original.qr_close} activeVariant="success" />,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'created_at',
      accessorFn: (row) => formatArgentinaDay(row.created_at),
      meta: { title: 'Creado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDay(row.original.created_at)}</span>,
      // El modo in-memory no resuelve rangos de fecha: la columna se ordena y se exporta, sin filtro.
      sortingFn: inMemoryDateSortingFn,
    },
  ];

  if (canEdit) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      meta: { excludeFromExport: true, title: 'Acciones' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button type="button" size="sm" variant="link" onClick={() => onEdit(row.original)}>
          Editar
        </Button>
      ),
    });
  }

  return columns;
}
