'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  affiliateStatusLabels,
  documentTypeLabels,
  employeeStatusLabels,
  genderLabels,
  nationalityLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { User } from 'lucide-react';
import { classifyEmployeeDiagram } from '../../../lib/resource-deviations';
import type { EmployeeSelectorItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'document',
  'document_type',
  'gender',
  'nationality',
  'affiliate_status',
  'province',
  'empleado_aptitudes',
];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

interface GetColumnsOptions {
  alreadySelectedIds: string[];
  selectedCustomerId: string | null;
}

export function getColumns(options: GetColumnsOptions): ColumnDef<EmployeeSelectorItem>[] {
  const { alreadySelectedIds, selectedCustomerId } = options;

  return [
    // ── Select ────────────────────────────────────────────────────────────────
    {
      id: 'select',
      meta: { excludeFromExport: true },
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      ),
      cell: ({ row }) => {
        const isAlreadySelected = alreadySelectedIds.includes(row.original.id);
        return (
          <Checkbox
            checked={isAlreadySelected || row.getIsSelected()}
            onCheckedChange={(value) => {
              if (!isAlreadySelected) row.toggleSelected(!!value);
            }}
            disabled={isAlreadySelected}
            aria-label="Seleccionar fila"
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },

    // ── Legajo ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'file',
      meta: { title: 'Legajo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.file || '—'}</span>,
    },

    // ── Nombre ────────────────────────────────────────────────────────────────
    {
      id: 'fullName',
      accessorFn: (row) => `${row.lastname} ${row.firstname}`,
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => {
        // Check if assigned to selected customer
        const isAssigned = selectedCustomerId
          ? row.original.contractor_employee?.some((ce) => ce.customers?.id === selectedCustomerId)
          : true;

        // Diagram deviations
        const diagramEntries = row.original.employees_diagram ?? [];
        const diagramEntry = diagramEntries[0];
        const diagramType = diagramEntry?.diagram_type_employees_diagram_diagram_typeTodiagram_type;
        const { has_no_diagram: hasNoDiagram, is_non_work_day: hasNonWorkDay } = classifyEmployeeDiagram(
          diagramEntries.length,
          diagramType?.work_active
        );

        return (
          <div className="flex items-center gap-2 min-w-[200px]">
            <User className={isAssigned ? 'h-4 w-4 text-muted-foreground' : 'h-4 w-4 text-orange-500'} />
            <div className="flex flex-col gap-1">
              <span className={!isAssigned ? 'text-orange-700 font-medium' : 'font-medium'}>
                {row.original.lastname} {row.original.firstname}
              </span>
              <div className="flex flex-wrap gap-1">
                {!isAssigned && (
                  <Badge
                    variant="outline"
                    className="bg-orange-100 text-orange-800 border-orange-300 text-[10px] py-0 px-1"
                  >
                    No asignado
                  </Badge>
                )}
                {hasNoDiagram && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-800 border-red-300 text-[10px] py-0 px-1 cursor-default"
                        >
                          Sin diagrama
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="text-white bg-black rounded-lg p-2">
                        <span>Este empleado no tiene diagrama para este dia</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {hasNonWorkDay && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="bg-yellow-100 text-yellow-800 border-yellow-300 text-[10px] py-0 px-1 cursor-default"
                        >
                          {diagramType?.name || 'No laboral'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="text-white bg-black rounded-lg p-2">
                        <span>Este empleado tiene un dia no laboral segun su diagrama</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        );
      },
      enableSorting: false,
    },

    // ── CUIL ─────────────────────────────────────────────────────────────────
    {
      accessorKey: 'cuil',
      meta: { title: 'CUIL' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIL" />,
      cell: ({ row }) => <span className="text-sm">{row.original.cuil || '—'}</span>,
    },

    // ── Documento ─────────────────────────────────────────────────────────────
    {
      id: 'document',
      accessorFn: (row) =>
        row.document_type && row.document_number
          ? `${documentTypeLabels[row.document_type] ?? row.document_type} ${row.document_number}`
          : row.document_number || '',
      meta: { title: 'Documento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.document_type
            ? `${documentTypeLabels[row.original.document_type] ?? row.original.document_type} `
            : ''}
          {row.original.document_number || '—'}
        </span>
      ),
      enableSorting: false,
    },

    // ── Tipo de documento (hidden — filterFn target for document_type facet) ──
    {
      accessorKey: 'document_type',
      meta: { title: 'Tipo de Documento', excludeFromExport: true },
      header: () => null,
      cell: () => null,
      enableSorting: false,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Sector (hierarchy) ────────────────────────────────────────────────────
    {
      id: 'hierarchy',
      accessorFn: (row) => row.hierarchy?.name ?? '',
      meta: { title: 'Sector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
      cell: ({ row }) => <span>{row.original.hierarchy?.name || '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.hierarchy?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Puesto (company_positions) ───────────────────────────────────────────
    {
      id: 'company_positions',
      accessorFn: (row) => row.company_positions?.name ?? '',
      meta: { title: 'Puesto' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Puesto" />,
      cell: ({ row }) => <span>{row.original.company_positions?.name || '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.company_positions?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Diagrama (work_diagram) ───────────────────────────────────────────────
    {
      id: 'work_diagram',
      accessorFn: (row) => row.work_diagram?.name ?? '',
      meta: { title: 'Diagrama' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Diagrama" />,
      cell: ({ row }) => <span>{row.original.work_diagram?.name || '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.work_diagram?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Afectaciones (contractor_employee M:M) ─────────────────────────────
    {
      id: 'contractor_employee',
      accessorFn: (row) => {
        const contractors = row.contractor_employee ?? [];
        return contractors
          .map((c) => c.customers?.name ?? '')
          .filter(Boolean)
          .join(', ');
      },
      meta: { title: 'Afectaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Afectaciones" />,
      cell: ({ row }) => {
        const contractors = row.original.contractor_employee ?? [];
        if (contractors.length === 0) {
          return <Badge variant="secondary">Sin afectar</Badge>;
        }
        const names = contractors.map((c) => c.customers?.name ?? '').filter(Boolean);
        const first = names[0] ?? '—';
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex">
                  <Badge>
                    {first}
                    {names.length > 1 && ` +${names.length - 1}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              {names.length > 1 && (
                <TooltipContent className="text-white bg-black rounded-lg p-2">
                  <div className="flex flex-col gap-1">
                    {names.map((name, idx) => (
                      <span key={idx}>{name}</span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const contractors = row.original.contractor_employee ?? [];
        if (contractors.length === 0) return value.includes(NULL_FILTER_VALUE);
        return contractors.some((c) => c.customers?.id && value.includes(c.customers.id));
      },
      enableSorting: false,
    },

    // ── Aptitudes (empleado_aptitudes M:M) ────────────────────────────────────
    {
      id: 'empleado_aptitudes',
      accessorFn: (row) => {
        const aptitudes = row.empleado_aptitudes ?? [];
        return aptitudes
          .map((a) => a.aptitudes_tecnicas?.nombre ?? '')
          .filter(Boolean)
          .join(', ');
      },
      meta: { title: 'Aptitudes' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aptitudes" />,
      cell: ({ row }) => {
        const aptitudes = row.original.empleado_aptitudes ?? [];
        if (aptitudes.length === 0) return <span className="text-muted-foreground">—</span>;
        const names = aptitudes.map((a) => a.aptitudes_tecnicas?.nombre ?? '').filter(Boolean);
        const first = names[0] ?? '—';
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex">
                  <Badge variant="outline">
                    {first}
                    {names.length > 1 && ` +${names.length - 1}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              {names.length > 1 && (
                <TooltipContent className="text-white bg-black rounded-lg p-2">
                  <div className="flex flex-col gap-1">
                    {names.map((name, idx) => (
                      <span key={idx}>{name}</span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const aptitudes = row.original.empleado_aptitudes ?? [];
        if (aptitudes.length === 0) return value.includes(NULL_FILTER_VALUE);
        return aptitudes.some((a) => a.aptitudes_tecnicas?.id && value.includes(a.aptitudes_tecnicas.id));
      },
      enableSorting: false,
    },

    // ── Estado de documentacion (status) ──────────────────────────────────────
    {
      accessorKey: 'status',
      meta: { title: 'Estado doc.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado doc." />,
      cell: ({ row }) => {
        const status = row.original.status;
        if (!status) return <span className="text-muted-foreground">—</span>;
        const label = employeeStatusLabels[status] ?? status;
        const variantMap: Record<string, 'success' | 'destructive' | 'yellow' | 'default'> = {
          Completo: 'success',
          Incompleto: 'destructive',
          Completo_con_doc_vencida: 'yellow',
          Avalado: 'success',
          No_avalado: 'destructive',
        };
        return <Badge variant={variantMap[status] ?? 'default'}>{label}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Provincia ─────────────────────────────────────────────────────────────
    {
      id: 'province',
      accessorFn: (row) => row.provinces?.name ?? '',
      meta: { title: 'Provincia' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Provincia" />,
      cell: ({ row }) => <span>{row.original.provinces?.name || '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.province;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(id));
      },
    },

    // ── Gender (hidden by default) ─────────────────────────────────────────────
    {
      accessorKey: 'gender',
      meta: { title: 'Genero' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Genero" />,
      cell: ({ row }) => {
        const g = row.original.gender;
        return <span>{g ? genderLabels[g] ?? g : '—'}</span>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Nationality (hidden by default) ───────────────────────────────────────
    {
      accessorKey: 'nationality',
      meta: { title: 'Nacionalidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nacionalidad" />,
      cell: ({ row }) => {
        const n = row.original.nationality;
        return <span>{n ? nationalityLabels[n] ?? n : '—'}</span>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Estado de afiliacion (hidden by default) ───────────────────────────────
    {
      accessorKey: 'affiliate_status',
      meta: { title: 'Estado afiliacion' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado afiliacion" />,
      cell: ({ row }) => {
        const val = row.original.affiliate_status;
        return <span>{val ? affiliateStatusLabels[val] ?? val : '—'}</span>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
  ];
}
