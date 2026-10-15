'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { formSourceLabels } from '@/shared/utils/mappers';
import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, CircleOff, ClipboardCheck, FileText, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { FormListItem } from './actions.server';

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['description', 'code'];

// ============================================================================
// ÍCONOS (compartidos con los filtros: misma imagen en la celda y en la opción)
// ============================================================================

export const formSourceIcons: Record<string, LucideIcon> = {
  checklist_template: ClipboardCheck,
  custom_form: FileText,
};

/** Tonos por tipo (tokens info / warn del sistema de diseño). */
const SOURCE_TONE_CLASS: Record<string, string> = {
  checklist_template: 'text-info',
  custom_form: 'text-warn',
};

// ============================================================================
// TIPO DE PERMISOS
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNAS
// ============================================================================

export function getColumns(permissions: Permissions): ColumnDef<FormListItem>[] {
  const canView = permissions.hasPermission('formularios', 'formularios', 'view');

  return [
    // ── Nombre del formulario (+ descripción) ─────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => {
        const { id, name, description, is_active } = row.original;
        const inactive = is_active === false;

        return (
          <StackedCell
            className={inactive ? 'opacity-50' : undefined}
            maxWidthClass="max-w-[350px]"
            primary={
              canView && !inactive ? (
                <Link href={`/dashboard/forms/${id}`} title={name} className="hover:underline">
                  {name}
                </Link>
              ) : (
                <span title={inactive ? `${name} (Inactivo)` : name}>{name}</span>
              )
            }
            secondary={description}
          />
        );
      },
    },

    // ── Descripción (oculta por defecto: ya se ve bajo el nombre) ──────────
    {
      accessorKey: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => (
        <span
          title={row.original.description ?? undefined}
          className={`text-muted-foreground block max-w-[300px] truncate text-sm ${row.original.is_active === false ? 'opacity-50' : ''}`}
        >
          {row.original.description || '—'}
        </span>
      ),
    },

    // ── Código (oculto por defecto) ─────────────────────────────────────────
    {
      accessorKey: 'code',
      meta: { title: 'Código' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => (
        <span className={`font-mono text-sm ${row.original.is_active === false ? 'opacity-50' : ''}`}>
          {row.original.code || '—'}
        </span>
      ),
    },

    // ── Tipo de formulario / Fuente ────────────────────────────────────────
    {
      accessorKey: 'source',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const source = row.original.source;
        const Icon = formSourceIcons[source];
        return (
          <div className={`flex items-center gap-1.5 ${row.original.is_active === false ? 'opacity-50' : ''}`}>
            {Icon ? (
              <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${SOURCE_TONE_CLASS[source] ?? ''}`} />
            ) : null}
            <span className="text-sm whitespace-nowrap">{formSourceLabels[source] ?? source}</span>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.source),
    },

    // ── Estado (is_active; null = sin definir en la plantilla) ─────────────
    {
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        if (isActive == null) {
          return (
            <Badge variant="outline" className="flex items-center gap-1 whitespace-nowrap">
              <CircleOff aria-hidden="true" className="h-3 w-3" />
              Sin asignar
            </Badge>
          );
        }
        return (
          <Badge variant={isActive ? 'success' : 'secondary'} className="flex items-center gap-1 whitespace-nowrap">
            {isActive ? (
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
            ) : (
              <XCircle aria-hidden="true" className="h-3 w-3" />
            )}
            {isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        );
      },
      // Mismo criterio que el servidor: null solo coincide con "Sin asignar".
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as boolean | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Fecha de creación ─────────────────────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creación" />,
      cell: ({ row }) => (
        <span className={`text-sm whitespace-nowrap ${row.original.is_active === false ? 'opacity-50' : ''}`}>
          {row.original.created_at ? formatArgentinaDay(row.original.created_at) : '—'}
        </span>
      ),
    },

    // ── Total de respuestas (calculado: sin filtro) ────────────────────────
    {
      accessorKey: 'total_responses',
      meta: { title: 'Respuestas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Respuestas" />,
      cell: ({ row }) => (
        <Badge
          variant={row.original.total_responses > 0 ? 'default' : 'secondary'}
          className={`min-w-[28px] justify-center tabular-nums ${row.original.is_active === false ? 'opacity-50' : ''}`}
        >
          {row.original.total_responses}
        </Badge>
      ),
    },

    // ── Acciones ───────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        if (!canView || row.original.is_active === false) return null;

        return (
          <Link
            href={`/dashboard/forms/${row.original.id}`}
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            Ver formulario
          </Link>
        );
      },
    },
  ];
}
