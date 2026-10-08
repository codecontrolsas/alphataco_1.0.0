'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, X } from 'lucide-react';
import moment from 'moment';
import type { DocumentTypeListItem } from '../actions/queries.server';
import { getEquipmentTypeLabel } from '../config/equipmentTypes';

// ============================================================================
// HELPERS
// ============================================================================

/** Celda booleana con Badge Sí/No */
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
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      meta: { title: 'Nombre', mobile: { role: 'title', priority: 1 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => (
        <div className={`font-medium ${!row.original.is_active ? 'text-muted-foreground line-through' : ''}`}>
          {row.original.name}
        </div>
      ),
    },

    // ── Obligatorio ─────────────────────────────────────────────────────────
    {
      accessorKey: 'mandatory',
      id: 'mandatory',
      meta: { title: 'Obligatorio', mobile: { role: 'field', priority: 1 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Obligatorio" />,
      cell: ({ row }) => <BoolBadge value={row.original.mandatory} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Con vencimiento ─────────────────────────────────────────────────────
    {
      accessorKey: 'explired',
      id: 'explired',
      meta: { title: 'Con vencimiento', mobile: { role: 'field', priority: 2 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Con vencimiento" />,
      cell: ({ row }) => <BoolBadge value={row.original.explired} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Condicional ─────────────────────────────────────────────────────────
    {
      accessorKey: 'special',
      id: 'special',
      meta: { title: 'Condicional', mobile: { role: 'field', priority: 3 } },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condicional" />,
      cell: ({ row }) => <BoolBadge value={row.original.special} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Multirrecurso ────────────────────────────────────────────────────────
    {
      accessorKey: 'multiresource',
      id: 'multiresource',
      meta: { title: 'Multirrecurso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Multirrecurso" />,
      cell: ({ row }) => <BoolBadge value={row.original.multiresource} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Mensual ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'is_it_montlhy',
      id: 'is_it_montlhy',
      meta: { title: 'Mensual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mensual" />,
      cell: ({ row }) => <BoolBadge value={row.original.is_it_montlhy} />,
      filterFn: (row, id, value: string[]) => {
        const val = (row.getValue(id) as boolean | null) ?? false;
        return value.includes(String(val));
      },
    },

    // ── Privado ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'private',
      id: 'private',
      meta: { title: 'Privado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Privado" />,
      cell: ({ row }) => <BoolBadge value={row.original.private} />,
      filterFn: (row, id, value: string[]) => {
        const val = (row.getValue(id) as boolean | null) ?? false;
        return value.includes(String(val));
      },
    },

    // ── Doc. de baja ─────────────────────────────────────────────────────────
    {
      accessorKey: 'down_document',
      id: 'down_document',
      meta: { title: 'Doc. de baja' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Doc. de baja" />,
      cell: ({ row }) => <BoolBadge value={row.original.down_document} />,
      filterFn: (row, id, value: string[]) => {
        const val = (row.getValue(id) as boolean | null) ?? false;
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

    // ── N° de Póliza (SOLO tabla Equipos, multirecurso) ──────────────────────
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

  // ── Estado (Activo/Inactivo) ────────────────────────────────────────────
  cols.push({
    accessorKey: 'is_active',
    id: 'is_active',
    meta: { title: 'Estado', mobile: { role: 'status' } },
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

  // ── Descripción (oculta por defecto, solo en export) ─────────────────────
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

  // ── Fecha de creación ────────────────────────────────────────────────────
  cols.push({
    accessorKey: 'created_at',
    id: 'created_at',
    meta: { title: 'Fecha de creación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
    cell: ({ row }) =>
      row.original.created_at ? <div>{moment(row.original.created_at).format('DD/MM/YYYY')}</div> : <div>-</div>,
  });

  // ── Acciones ─────────────────────────────────────────────────────────────
  cols.push({
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
          <span className="sr-only">Editar</span>
        </Button>
      </div>
    ),
  });

  return cols;
}

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'multiresource',
  'has_policy_number',
  'is_it_montlhy',
  'private',
  'down_document',
  'description',
];
