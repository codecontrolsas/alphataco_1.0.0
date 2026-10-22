'use client';

import { Button } from '@/components/ui/button';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from './ActiveStatusBadge';

/**
 * Columnas que repiten los catálogos de Empresa (marcas, modelos, centros de costo, puestos…): nombre,
 * estado activo/inactivo, fecha de creación y la acción "Editar" de la fila.
 */

/** Columna "Nombre" (el filtro es de texto, por eso no lleva `filterFn`). `emptyText` cubre un nombre nulo. */
export function nameColumn<T extends { name: string | null }>(emptyText?: string): ColumnDef<T> {
  return {
    accessorKey: 'name',
    ...titled('Nombre'),
    cell: ({ row }) => (
      <span className="font-medium">
        {emptyText === undefined ? row.original.name : row.original.name ?? emptyText}
      </span>
    ),
  };
}

/** Columna "Estado" (`is_active`): un valor nulo coincide con el filtro "Sin asignar". */
export function activeStatusColumn<T extends { is_active: boolean | null }>(): ColumnDef<T> {
  return {
    accessorKey: 'is_active',
    ...titled('Estado'),
    cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
  };
}

/** Columna "Fecha de creación" (suele ir oculta por defecto). */
export function createdAtColumn<T extends { created_at: Date | string | null }>(emptyText = '-'): ColumnDef<T> {
  return {
    accessorKey: 'created_at',
    ...titled('Fecha de creación'),
    cell: ({ row }) => {
      const val = row.original.created_at;
      return <span>{val ? formatArgentinaDay(val) : emptyText}</span>;
    },
  };
}

/** Botón de texto de la columna de acciones ("Editar", "Ver modelos"…). */
export function RowLinkButton({
  label,
  ariaLabel,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant="link" type="button" className="h-auto p-0" aria-label={ariaLabel} onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * Columna de acciones con solo "Editar". Devuelve una lista vacía si el usuario no puede editar, para
 * esparcirla al final de las columnas (`...editActionColumn(...)`).
 */
export function editActionColumn<T>({
  canEdit,
  onEdit,
  getName,
}: {
  canEdit: boolean;
  onEdit: (item: T) => void;
  /** Nombre de la fila para el nombre accesible del botón ("Editar <nombre>"). */
  getName: (item: T) => string;
}): ColumnDef<T>[] {
  if (!canEdit) return [];
  return [
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <RowLinkButton
          label="Editar"
          ariaLabel={`Editar ${getName(row.original)}`}
          onClick={() => onEdit(row.original)}
        />
      ),
    },
  ];
}
