'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  documentTypeColumn,
  stateColumn,
  uploadedAtColumn,
  validityColumn,
  viewDocumentColumn,
} from '@/features/Dashboard/Documentacion/components/expiring-doc-columns';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import type { EmployeeExpiringDocListItem } from '../lib/expiring-docs-types';

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

  documentTypeColumn(),
  validityColumn(),
  stateColumn(),
  uploadedAtColumn(),
  viewDocumentColumn('Persona'),
];
