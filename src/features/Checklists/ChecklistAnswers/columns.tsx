'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock, Eye, HelpCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { ChecklistAnswerListItem } from './actions.server';
import { normalizeResult } from './utils';

// ============================================================================
// LABELS
// ============================================================================

export const checklistResultLabels: Record<string, string> = {
  passed: 'Aprobado',
  failed: 'Fallido',
  pending: 'Pendiente',
};

export type ChecklistResultVariant = 'default' | 'destructive' | 'outline';

export const checklistResultVariants: Record<string, ChecklistResultVariant> = {
  passed: 'default',
  failed: 'destructive',
  pending: 'outline',
};

const resultIcons: Record<string, LucideIcon> = {
  passed: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Devuelve el label legible del equipo para mostrar en tabla y export.
 * Patrón: domain - intern_number (o serie - intern_number si no hay domain)
 */
function getEquipmentLabel(item: ChecklistAnswerListItem): string {
  const v = item.vehicles;
  if (!v) return 'N/A';
  if (v.domain) {
    return v.intern_number ? `${v.domain} - ${v.intern_number}` : v.domain;
  }
  if (v.serie) {
    return v.intern_number ? `${v.serie} - ${v.intern_number}` : v.serie;
  }
  return v.intern_number ?? 'N/A';
}

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['observations', 'customer_id'];

/** Etiquetas de la columna de legajo (header con tooltip de coincidencia exacta). */
const FILE_NUMBER_HINT = 'Coincidencia exacta: ingrese el legajo completo';

// ============================================================================
// DEFINICIÓN DE COLUMNAS
// ============================================================================

export function getColumns(templateId: string): ColumnDef<ChecklistAnswerListItem>[] {
  return [
    // ── Fecha ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => {
        const answerData = row.original.answer_data as Record<string, string> | null;
        const fecha = answerData?.fecha;
        const hora = answerData?.hora;
        if (!fecha && !row.original.created_at) return <span>—</span>;
        // `fecha` del formulario es un día suelto (YYYY-MM-DD); `created_at` es un instante: va en hora argentina.
        const formatted = fecha
          ? /^\d{4}-\d{2}-\d{2}/.test(fecha)
            ? formatDateAr(fecha.slice(0, 10))
            : fecha
          : formatArgentinaDay(row.original.created_at as Date);
        return (
          <span className="whitespace-nowrap font-medium">
            {formatted}
            {hora ? ` ${hora}` : ''}
          </span>
        );
      },
    },

    // ── Equipo (FK → vehicles) ────────────────────────────────────────────
    {
      id: 'equipment_id',
      accessorFn: (row) => getEquipmentLabel(row),
      meta: { title: 'Equipo' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => <span className="whitespace-nowrap">{getEquipmentLabel(row.original)}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.equipment_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Chofer (nombre desde JSONB, filtro por chofer_employee_id) ───────
    {
      id: 'chofer',
      meta: { title: 'Chofer' },
      enableSorting: false,
      accessorFn: (row) => {
        // Mostrar el nombre desde JSONB (compatible con registros legacy sin chofer_employee_id)
        const answerData = row.answer_data as Record<string, string> | null;
        return answerData?.chofer ?? '';
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chofer" />,
      cell: ({ row }) => {
        const answerData = row.original.answer_data as Record<string, string> | null;
        return <span>{answerData?.chofer || 'N/A'}</span>;
      },
      // Filtrar por ID real (chofer_employee_id) para que el filtro facetado funcione correctamente
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.chofer_employee_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Legajo del chofer (columna propia; filtro de texto con coincidencia exacta) ──
    {
      id: 'fileNumber',
      meta: { title: 'Legajo' },
      enableSorting: false,
      accessorFn: (row) => row.employees_checklist_answers_chofer_employee_idToemployees?.file ?? '',
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <DataTableColumnHeader column={column} title="Legajo" />
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help" aria-label={FILE_NUMBER_HINT}>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{FILE_NUMBER_HINT}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      cell: ({ row }) => {
        const file = row.original.employees_checklist_answers_chofer_employee_idToemployees?.file;
        if (!file) return <span className="text-muted-foreground">-</span>;
        return <span className="font-mono font-semibold tabular-nums">{file}</span>;
      },
    },

    // ── Cliente (columna GENERATED desde JSONB) ──────────────────────────
    {
      id: 'customer_id',
      meta: { title: 'Cliente' },
      enableSorting: false,
      accessorFn: (row) => row.customer_id ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => {
        // El nombre del cliente se muestra desde el JSONB cuando está disponible
        const answerData = row.original.answer_data as Record<string, string> | null;
        return <span>{answerData?.customer_name ?? row.original.customer_id ?? '—'}</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.customer_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id as string);
      },
    },

    // ── Kilometraje (columna directa — antes JSONB) ───────────────────────
    {
      accessorKey: 'kilometraje',
      meta: { title: 'Kilometraje' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kilometraje" />,
      cell: ({ row }) => {
        const val = row.original.kilometraje;
        return <span>{val != null ? String(val) : 'N/A'}</span>;
      },
    },

    // ── Horómetro (columna directa — antes JSONB) ─────────────────────────
    {
      accessorKey: 'horometro',
      meta: { title: 'Horómetro' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Horómetro" />,
      cell: ({ row }) => {
        const val = row.original.horometro;
        return <span>{val != null ? String(val) : 'N/A'}</span>;
      },
    },

    // ── Resultado (enum con valores inconsistentes, normalizado) ──────────
    {
      accessorKey: 'result',
      meta: { title: 'Resultado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Resultado" />,
      cell: ({ row }) => {
        const normalized = normalizeResult(row.original.result);
        const label = checklistResultLabels[normalized] ?? normalized;
        const variant = checklistResultVariants[normalized] ?? 'outline';
        const Icon = resultIcons[normalized];
        return (
          <Badge variant={variant} className="gap-1 items-center">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const normalized = normalizeResult(row.original.result);
        // 'pending' puede estar mapeado a NULL_FILTER_VALUE en el filtro
        if (value.includes(NULL_FILTER_VALUE) && normalized === 'pending') return true;
        return value.includes(normalized);
      },
    },

    // ── Usuario ────────────────────────────────────────────────────────────
    {
      id: 'user_id',
      meta: { title: 'Usuario' },
      enableSorting: false,
      accessorFn: (row) => row.profile?.fullname ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Usuario" />,
      cell: ({ row }) => <span>{row.original.profile?.fullname || 'N/A'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.user_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Observaciones (oculta por defecto) ────────────────────────────────
    {
      accessorKey: 'observations',
      meta: { title: 'Observaciones' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
      cell: ({ row }) => <span>{row.original.observations || '—'}</span>,
    },

    // ── Acciones ──────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <Link href={`/dashboard/forms/${templateId}/view/${row.original.id}`}>
          <Button variant="outline" size="sm" className="gap-1">
            <Eye className="h-3.5 w-3.5" />
            Ver
          </Button>
        </Link>
      ),
    },
  ];
}
