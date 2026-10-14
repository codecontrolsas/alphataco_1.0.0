'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, MoreHorizontal, Pencil, X } from 'lucide-react';
import type { DocumentTypeListItem } from '../actions/queries.server';
import { getEquipmentTypeLabel } from '../config/equipmentTypes';

// ============================================================================
// HELPERS
// ============================================================================

/** Celda booleana con Badge Sí/No (columnas secundarias, ocultas por defecto). */
function BoolBadge({ value }: { value: boolean | null | undefined }) {
  const v = value ?? false;
  return (
    <Badge variant={v ? 'success' : 'default'}>
      {v ? (
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" /> Sí
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <X className="h-3 w-3" /> No
        </span>
      )}
    </Badge>
  );
}

/** "Sí" como pill ok y "No" atenuado: así lo que se exige salta a la vista. */
function YesNo({ value }: { value: boolean | null | undefined }) {
  return value ? <Badge variant="success">Sí</Badge> : <span className="text-muted-foreground">No</span>;
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

/**
 * Columnas compartidas para las tablas de Personas, Equipos y Empresa.
 * @param includeEquipmentType — true SOLO para la tabla de Equipos
 * @param onEdit — callback al hacer clic en "Editar"
 */
export function getDocTypeColumns(
  includeEquipmentType: boolean,
  onEdit: (row: DocumentTypeListItem) => void
): ColumnDef<DocumentTypeListItem>[] {
  const cols: ColumnDef<DocumentTypeListItem>[] = [
    // ── Nombre (negrita) + descripción debajo ───────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div
            className={`font-semibold ${row.original.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}
          >
            {row.original.name}
          </div>
          {row.original.description && (
            <div className="line-clamp-2 text-sm text-muted-foreground">{row.original.description}</div>
          )}
        </div>
      ),
    },

    // ── Obligatorio ─────────────────────────────────────────────────────────
    {
      accessorKey: 'mandatory',
      id: 'mandatory',
      meta: { title: 'Obligatorio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Obligatorio" />,
      cell: ({ row }) => <YesNo value={row.original.mandatory} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Vencimiento (con / sin) ─────────────────────────────────────────────
    {
      accessorKey: 'explired',
      id: 'explired',
      meta: { title: 'Vencimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
      cell: ({ row }) =>
        row.original.explired ? (
          <Badge variant="info">Con vencimiento</Badge>
        ) : (
          <span className="text-muted-foreground">Sin vencimiento</span>
        ),
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Periodicidad (Mensual / Permanente) ─────────────────────────────────
    {
      accessorKey: 'is_it_montlhy',
      id: 'is_it_montlhy',
      meta: { title: 'Periodicidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periodicidad" />,
      cell: ({ row }) => <span>{row.original.is_it_montlhy ? 'Mensual' : 'Permanente'}</span>,
      filterFn: (row, id, value: string[]) => {
        const val = (row.getValue(id) as boolean | null) ?? false;
        return value.includes(String(val));
      },
    },

    // ── Se exige a (Todos / La empresa / N condiciones) ─────────────────────
    {
      accessorKey: 'special',
      id: 'special',
      meta: { title: 'Se exige a' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Se exige a" />,
      cell: ({ row }) => {
        if (!row.original.special) {
          return (
            <span className="text-muted-foreground">{row.original.applies === 'Empresa' ? 'La empresa' : 'Todos'}</span>
          );
        }
        const count = row.original.conditions_count;
        return <Badge variant="secondary">{count === 1 ? '1 condición' : `${count} condiciones`}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },
  ];

  // ── Tipo de equipo (SOLO tabla Equipos) ────────────────────────────────────
  if (includeEquipmentType) {
    cols.push({
      accessorKey: 'equipment_type',
      id: 'equipment_type',
      meta: { title: 'Tipo de equipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de equipo" />,
      cell: ({ row }) => <div>{getEquipmentTypeLabel(row.original.equipment_type)}</div>,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return false;
        return value.includes(val);
      },
    });
  }

  // ── Multirrecurso ────────────────────────────────────────────────────────
  cols.push({
    accessorKey: 'multiresource',
    id: 'multiresource',
    meta: { title: 'Multirrecurso' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Multirrecurso" />,
    cell: ({ row }) => <YesNo value={row.original.multiresource} />,
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      return value.includes(String(val));
    },
  });

  // ── Estado (Activo/Inactivo) ────────────────────────────────────────────
  cols.push({
    accessorKey: 'is_active',
    id: 'is_active',
    meta: { title: 'Estado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
        {row.original.is_active ? 'Activo' : 'Inactivo'}
      </Badge>
    ),
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      return value.includes(String(val));
    },
  });

  // ── Privado (oculta por defecto) ─────────────────────────────────────────
  cols.push({
    accessorKey: 'private',
    id: 'private',
    meta: { title: 'Privado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Privado" />,
    cell: ({ row }) => <BoolBadge value={row.original.private} />,
    filterFn: (row, id, value: string[]) => {
      const val = (row.getValue(id) as boolean | null) ?? false;
      return value.includes(String(val));
    },
  });

  // ── Doc. de baja (oculta por defecto) ────────────────────────────────────
  cols.push({
    accessorKey: 'down_document',
    id: 'down_document',
    meta: { title: 'Doc. de baja' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Doc. de baja" />,
    cell: ({ row }) => <BoolBadge value={row.original.down_document} />,
    filterFn: (row, id, value: string[]) => {
      const val = (row.getValue(id) as boolean | null) ?? false;
      return value.includes(String(val));
    },
  });

  // ── N° de Póliza (SOLO tabla Equipos, multirecurso; oculta por defecto) ──
  if (includeEquipmentType) {
    cols.push({
      accessorKey: 'has_policy_number',
      id: 'has_policy_number',
      meta: { title: 'N° de Póliza' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° de Póliza" />,
      cell: ({ row }) => <BoolBadge value={row.original.has_policy_number} />,
      filterFn: (row, id, value: string[]) => {
        const val = (row.getValue(id) as boolean | null) ?? false;
        return value.includes(String(val));
      },
    });
  }

  // ── Descripción (oculta por defecto: ya se ve bajo el nombre; sirve para el export) ──
  cols.push({
    accessorKey: 'description',
    id: 'description',
    meta: { title: 'Descripción' },
    enableSorting: false,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
    cell: ({ row }) => (
      <div className="max-w-xs truncate text-muted-foreground text-sm">{row.original.description ?? '-'}</div>
    ),
  });

  // ── Fecha de creación (oculta por defecto) ───────────────────────────────
  cols.push({
    accessorKey: 'created_at',
    id: 'created_at',
    meta: { title: 'Fecha de creación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
    cell: ({ row }) =>
      row.original.created_at ? (
        <div className="font-mono tabular-nums">{formatArgentinaDay(row.original.created_at)}</div>
      ) : (
        <div>-</div>
      ),
  });

  // ── Acciones ─────────────────────────────────────────────────────────────
  // La activación/desactivación vive dentro del modal de edición.
  cols.push({
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Más acciones para ${row.original.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(row.original)}>
              <Pencil className="size-4" />
              Editar o activar/desactivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  });

  return cols;
}

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['has_policy_number', 'private', 'down_document', 'description', 'created_at'];
