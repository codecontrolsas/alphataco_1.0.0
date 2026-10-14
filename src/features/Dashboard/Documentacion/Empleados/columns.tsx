'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DocumentExpiryCell } from '@/features/Documentacion/shared/components/DocumentCells';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { EmployeeExpiringDocListItem } from './actions.server';

// ============================================================================
// LABELS E ICONOS DE ESTADO
// ============================================================================

export const stateLabels: Record<string, string> = {
  presentado: 'Presentado',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
};

export const stateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  presentado: CheckCircle2,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertTriangle,
};

// Badge variants por estado
const stateBadgeVariants: Record<string, 'default' | 'success' | 'destructive' | 'yellow' | 'secondary'> = {
  presentado: 'default',
  aprobado: 'success',
  rechazado: 'destructive',
  vencido: 'yellow',
};

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

// ============================================================================
// DEFINICIÓN DE COLUMNAS
// ============================================================================

export const columns: ColumnDef<EmployeeExpiringDocListItem>[] = [
  // ── Legajo ───────────────────────────────────────────────────────────────
  {
    id: 'fileNumber',
    accessorFn: (row) => row.employees?.file ?? '',
    meta: { title: 'Legajo' },
    header: ({ column }) => (
      <div className="flex items-center gap-1">
        <DataTableColumnHeader column={column} title="Legajo" />
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Número de legajo del empleado</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
    cell: ({ row }) => {
      const file = row.original.employees?.file;
      return <span className="font-mono text-sm text-muted-foreground">{file ?? '—'}</span>;
    },
    enableSorting: false,
  },

  // ── Empleado (nombre + link) ─────────────────────────────────────────────
  {
    id: 'employee',
    accessorFn: (row) => (row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : ''),
    meta: { title: 'Empleado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado" />,
    cell: ({ row }) => {
      const employee = row.original.employees;
      if (!employee) return <span className="text-muted-foreground">—</span>;

      return (
        <Link
          href={`/dashboard/employee/action?action=view&employee_id=${employee.id}`}
          className="hover:underline font-medium"
        >
          {employee.lastname} {employee.firstname}
        </Link>
      );
    },
    enableHiding: false,
    enableSorting: true,
    filterFn: (row, _id, value: string[]) => {
      const employee = row.original.employees;
      if (!employee) return false;
      const name = `${employee.lastname} ${employee.firstname}`.toLowerCase();
      return value.some((v) => name.includes(v.toLowerCase()));
    },
  },

  // ── Tipo de documento (FK → document_types) ──────────────────────────────
  {
    id: 'document_type',
    accessorFn: (row) => row.document_types?.name ?? '',
    meta: { title: 'Tipo de Documento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Documento" />,
    cell: ({ row }) => <span>{row.original.document_types?.name ?? '—'}</span>,
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.id_document_types;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ── Vencimiento (fecha con iconos de urgencia) ───────────────────────────
  {
    accessorKey: 'validity',
    meta: { title: 'Vencimiento' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
    cell: ({ row }) => <DocumentExpiryCell validity={row.original.validity} state={row.original.state} />,
  },

  // ── Estado del documento ─────────────────────────────────────────────────
  {
    accessorKey: 'state',
    meta: { title: 'Estado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      const stateVal = row.original.state as string | null;
      if (!stateVal) return <span className="text-muted-foreground">—</span>;

      const Icon = stateIcons[stateVal];
      const label = stateLabels[stateVal] ?? stateVal;
      const variant = stateBadgeVariants[stateVal] ?? 'secondary';

      return (
        <Badge variant={variant} className="gap-1">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id) as string | null;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
  },

  // ── Subido el (fecha de carga) ───────────────────────────────────────────
  {
    accessorKey: 'created_at',
    meta: { title: 'Subido el' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subido el" />,
    cell: ({ row }) => {
      const createdAt = row.original.created_at;
      return createdAt ? (
        <span>{formatArgentinaDay(createdAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },

  // ── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => {
      const docId = row.original.id;
      return (
        <Link
          href={`/dashboard/document/${docId}?resource=Persona`}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Ver documento
        </Link>
      );
    },
  },
];
