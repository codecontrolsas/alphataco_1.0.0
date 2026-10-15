'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { getEnumLabel } from '@/shared/utils/mappers';
import type { Column, ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import moment from 'moment';
import type { ReactNode } from 'react';
import type { EmployeeListItem } from '../actions.server';

// ============================================================================
// FÁBRICAS DE COLUMNAS (texto, fecha, enum, FK y M:M)
// ============================================================================

export type Col = ColumnDef<EmployeeListItem>;
type EmployeeKey = keyof EmployeeListItem & string;

export const EMPTY = '-';

export const renderHeader =
  (title: string) =>
  ({ column }: { column: Column<EmployeeListItem, unknown> }) => (
    <DataTableColumnHeader column={column} title={title} />
  );

/** filterFn para enums (null → "Sin asignar") */
export const enumFilterFn: Col['filterFn'] = (row, id, value: string[]) => {
  const val = row.getValue(id) as string | null;
  if (val == null) return value.includes(NULL_FILTER_VALUE);
  return value.includes(val);
};

/** Columna de texto/numero simple (accessor directo al campo) */
export function textColumn(key: EmployeeKey, title: string, className?: string): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const val = row.original[key];
      return <div className={className}>{val == null ? EMPTY : String(val)}</div>;
    },
    meta: { title },
  };
}

/** Columna de fecha: `format` recibe el valor no nulo y devuelve el texto a mostrar */
export function dateColumn<K extends EmployeeKey>(
  key: K,
  title: string,
  format: (value: NonNullable<EmployeeListItem[K]>) => string
): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const val = row.original[key];
      return (
        <div className="font-mono tabular-nums">{val ? format(val as NonNullable<EmployeeListItem[K]>) : EMPTY}</div>
      );
    },
    meta: { title },
  };
}

type EnumColumnOptions = {
  /** Icono por valor del enum */
  icons?: Record<string, LucideIcon>;
  /** Icono fijo para todos los valores (cuando no hay mapa por valor) */
  fixedIcon?: LucideIcon;
  /** Mostrar como Badge outline en vez de texto con icono */
  badge?: boolean;
};

/** Columna de enum con label del mapper, icono opcional y filtro con NULL_FILTER_VALUE */
export function enumColumn(
  key: EmployeeKey,
  title: string,
  labels: Record<string, string>,
  { icons, fixedIcon, badge }: EnumColumnOptions = {}
): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const raw = row.original[key];
      if (!raw) return <div>{EMPTY}</div>;
      const val = String(raw);
      const Icon = fixedIcon ?? icons?.[val];
      const label = getEnumLabel(val, labels);
      if (badge) {
        return (
          <Badge variant="outline" className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      }
      return (
        <div className="inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </div>
      );
    },
    filterFn: enumFilterFn,
    meta: { title },
  };
}

/**
 * Columna FK: muestra el nombre de la relacion y filtra por la key de la FK
 * (id UUID, o id numerico convertido a string).
 */
export function fkColumn(
  id: string,
  title: string,
  getName: (row: EmployeeListItem) => string | null | undefined,
  getKey: (row: EmployeeListItem) => string | null | undefined
): Col {
  return {
    id,
    accessorFn: (row) => getName(row) ?? '',
    header: renderHeader(title),
    cell: ({ row }) => <div>{getName(row.original) ?? EMPTY}</div>,
    filterFn: (row, _id, value: string[]) => {
      const key = getKey(row.original);
      if (key == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(key);
    },
    meta: { title },
  };
}

/** Columna M:M: texto exportable = nombres unidos; filtra si algun id coincide */
export function manyColumn(
  id: string,
  title: string,
  getItems: (row: EmployeeListItem) => Array<{ id: string; name: string }>,
  renderCell: (items: Array<{ id: string; name: string }>) => ReactNode
): Col {
  return {
    id,
    accessorFn: (row) =>
      getItems(row)
        .map((i) => i.name)
        .join(', '),
    header: renderHeader(title),
    cell: ({ row }) => renderCell(getItems(row.original)),
    filterFn: (row, _id, value: string[]) => {
      if (!value?.length) return true;
      const items = getItems(row.original);
      if (items.length === 0) return value.includes(NULL_FILTER_VALUE);
      return items.some((i) => value.includes(i.id));
    },
    enableSorting: false,
    meta: { title },
  };
}

/** Badge con el primer nombre y "+N"; tooltip con la lista completa */
export function NamesBadge({ names }: { names: string[] }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Badge variant="outline">
              {names[0] ?? EMPTY}
              {names.length > 1 && ` +${names.length - 1}`}
            </Badge>
          </div>
        </TooltipTrigger>
        {names.length > 1 && (
          <TooltipContent className="rounded-lg bg-black p-2 text-white">
            <div className="flex flex-col gap-1">
              {names.map((name, index) => (
                <span key={index}>{name}</span>
              ))}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export const formatUtcDate = (value: string | Date) => moment.utc(value).format('DD/MM/YYYY');
