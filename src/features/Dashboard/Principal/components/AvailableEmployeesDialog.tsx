'use client';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { createFacetFilters, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllAvailableEmployeesForExport,
  getAvailableEmployeeSingleFacet,
  getAvailableEmployeesPaginated,
  type AvailableEmployeeListItem,
} from '../actions/rrhh.server';
import { unwrapExportWithToast } from '../lib/export-client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  positionIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AvailableEmployeesDialog({ open, onOpenChange, count, positionIds }: Props) {
  // Estado reactivo para export con filtros activos
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn server-side — Prisma skip/take, se activa solo cuando el dialog está abierto
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getAvailableEmployeesPaginated(params, positionIds),
    [positionIds]
  );

  // ─── Columnas ──────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<AvailableEmployeeListItem>[]>(
    () => [
      {
        id: 'file',
        accessorKey: 'file',
        meta: { title: 'Legajo' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.file ?? '-'}</span>,
      },
      {
        id: 'name',
        accessorFn: (row) => `${row.lastname} ${row.firstname}`,
        meta: { title: 'Nombre' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => (
          <Link
            href={`/dashboard/employee/action?action=view&employee_id=${row.original.id}`}
            target="_blank"
            className="font-medium hover:underline"
          >
            {row.original.lastname}, {row.original.firstname}
          </Link>
        ),
      },
      {
        id: 'cuil',
        accessorKey: 'cuil',
        meta: { title: 'CUIL' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="CUIL" />,
        cell: ({ row }) => <span className="text-muted-foreground font-mono text-sm">{row.original.cuil ?? '-'}</span>,
      },
      {
        id: 'company_positions',
        accessorFn: (row) => row.company_positions?.name ?? '',
        meta: { title: 'Posición' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Posición" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.company_positions?.name ?? 'Sin posición'}</span>
        ),
        filterFn: (row, _id, value: string[]) => {
          const id = row.original.company_position;
          if (id == null) return value.includes(NULL_FILTER_VALUE);
          return value.includes(id);
        },
      },
      {
        id: 'customers',
        accessorFn: (row) =>
          row.contractor_employee
            .map((ce) => ce.customers?.name)
            .filter(Boolean)
            .join(', ') ?? '',
        meta: { title: 'Clientes' },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Clientes" />,
        cell: ({ row }) => {
          const customerNames = row.original.contractor_employee
            .map((ce) => ce.customers?.name)
            .filter((n): n is string => n != null);
          if (customerNames.length === 0) {
            return <Badge variant="outline">Sin afectar</Badge>;
          }
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline">
                    {customerNames[0]}
                    {customerNames.length > 1 && ` +${customerNames.length - 1}`}
                  </Badge>
                </TooltipTrigger>
                {customerNames.length > 1 && (
                  <TooltipContent>
                    <div className="flex flex-col gap-1">
                      {customerNames.map((name) => (
                        <span key={name}>{name}</span>
                      ))}
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        },
        filterFn: (row, _id, value: string[]) => {
          const contractorIds = row.original.contractor_employee
            .map((ce) => ce.contractor_id)
            .filter((id): id is string => id != null);
          if (contractorIds.length === 0) return value.includes(NULL_FILTER_VALUE);
          return contractorIds.some((id) => value.includes(id));
        },
      },
      {
        id: 'diagram',
        accessorFn: (row) => {
          const d = row.employees_diagram[0];
          return d?.diagram_type_employees_diagram_diagram_typeTodiagram_type?.short_description ?? '';
        },
        meta: { title: 'Diagrama' },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Diagrama" />,
        cell: ({ row }) => {
          const d = row.original.employees_diagram[0];
          const dt = d?.diagram_type_employees_diagram_diagram_typeTodiagram_type;
          return (
            <div className="flex items-center gap-2">
              {dt?.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dt.color }}
                  aria-hidden="true"
                />
              )}
              <span className="text-muted-foreground">{dt?.short_description ?? '-'}</span>
            </div>
          );
        },
        filterFn: (row, _id, value: string[]) => {
          const d = row.original.employees_diagram[0];
          const diagramTypeId = d?.diagram_type ?? null;
          if (diagramTypeId == null) return value.includes(NULL_FILTER_VALUE);
          return value.includes(diagramTypeId);
        },
      },
      {
        id: 'comments',
        accessorFn: (row) => row.employees_diagram[0]?.comments ?? '',
        meta: { title: 'Comentario' },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Comentario" />,
        cell: ({ row }) => {
          const comment = row.original.employees_diagram[0]?.comments;
          if (!comment) return <span className="text-muted-foreground">-</span>;
          // Texto libre: se trunca y el contenido completo queda en el title.
          return (
            <span className="block max-w-[220px] truncate" title={comment}>
              {comment}
            </span>
          );
        },
      },
    ],
    []
  );

  // ─── Lazy-load facets ──────────────────────────────────────────────────────

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const facets = createFacetFilters((columnId, params) =>
      getAvailableEmployeeSingleFacet(columnId, params, positionIds)
    );
    return [
      // Legajo ANTES que el nombre; coincidencia exacta (con parcial, «1» traería 1, 10, 100...).
      textFilter('file', 'Legajo', 'Legajo completo (coincidencia exacta)'),
      textFilter('name', 'Nombre', 'Buscar por apellido o nombre...'),
      textFilter('cuil', 'CUIL', 'Buscar por CUIL...'),
      textFilter('comments', 'Comentario', 'Buscar en el comentario...'),
      facets.lookup('company_positions', 'Posición', undefined, { label: 'Sin asignar' }),
      facets.lookup('customers', 'Clientes', undefined, { label: 'Sin afectar' }),
      facets.lookup('diagram', 'Diagrama', undefined, { label: 'Sin asignar' }),
    ];
  }, [positionIds]);

  // ─── Export config ─────────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () =>
        unwrapExportWithToast(await getAllAvailableEmployeesForExport(currentParams, positionIds)),
      options: {
        filename: 'empleados-disponibles',
        sheetName: 'Empleados Disponibles',
        title: 'Empleados Disponibles',
      },
      formatters: {
        customers: (_val: unknown, row: AvailableEmployeeListItem) => {
          const names = row.contractor_employee.map((ce) => ce.customers?.name).filter((n): n is string => n != null);
          return names.length > 0 ? names.join(', ') : 'Sin afectar';
        },
        name: (_val: unknown, row: AvailableEmployeeListItem) => `${row.lastname}, ${row.firstname}`,
        company_positions: (_val: unknown, row: AvailableEmployeeListItem) =>
          row.company_positions?.name ?? 'Sin posición',
        diagram: (_val: unknown, row: AvailableEmployeeListItem) => {
          const d = row.employees_diagram[0];
          return d?.diagram_type_employees_diagram_diagram_typeTodiagram_type?.short_description ?? '-';
        },
      },
    }),
    [currentParams, positionIds]
  );

  // ─── Filtros visibles por defecto ──────────────────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['company_positions', 'customers', 'diagram'];
  const mergedFilterVisibility = useMemo(
    () => Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)])),
    [facetedFilters]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Empleados Disponibles ({count})</DialogTitle>
          <DialogDescription>
            Empleados activos con diagrama de trabajo hoy que no figuran en el parte diario de hoy. La cifra del título
            es una resta (con diagrama − en operación) y puede diferir del total de la tabla.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <DataTable
            columns={columns as never}
            data={[]}
            totalRows={0}
            queryFn={tableQueryFn as never}
            queryKey={['available-employees-dialog', ...(positionIds ?? [])]}
            onStateChange={handleStateChange}
            facetedFilters={facetedFilters}
            initialFilterVisibility={mergedFilterVisibility}
            searchPlaceholder="Buscar por legajo, nombre o CUIL..."
            showSearch
            showFilterToggle
            showColumnToggle
            emptyMessage="No hay empleados disponibles con los filtros elegidos"
            exportConfig={exportConfig as never}
            paramNamespace="avail-emp"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
