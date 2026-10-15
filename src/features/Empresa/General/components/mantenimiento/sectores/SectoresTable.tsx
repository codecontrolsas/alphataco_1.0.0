'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import {
  DataTable,
  DataTableColumnHeader,
  inMemoryFacetedFilterFn,
  inMemoryTextFilterFn,
  type DataTableFacetedFilterConfig,
  type TablePreferences,
} from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Check, Pencil, X } from 'lucide-react';
import { use, useMemo, type ReactNode } from 'react';
import type { WorkshopSector } from '../../../actions/workshops.server';

const TABLE_ID = 'workshop-sectors';

const ACTIVE_LABELS: Record<'true' | 'false', string> = { true: 'Activo', false: 'Inactivo' };

export function getSectoresColumns(
  onEdit: (sector: WorkshopSector) => void,
  canEdit: boolean
): ColumnDef<WorkshopSector>[] {
  const columns: ColumnDef<WorkshopSector>[] = [
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'description',
      accessorFn: (row) => row.description ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => row.original.description || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'workshop',
      accessorFn: (row) => row.workshops?.name ?? '',
      meta: { title: 'Taller' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Taller" />,
      cell: ({ row }) => row.original.workshops?.name || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'max_capacity',
      accessorFn: (row) => row.max_capacity ?? '',
      meta: { title: 'Cupo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cupo" />,
      cell: ({ row }) =>
        row.original.max_capacity != null ? (
          row.original.max_capacity
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'is_active',
      accessorFn: (row) => String(row.is_active),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <X className="h-3 w-3" aria-hidden="true" />
          )}
          {row.original.is_active ? ACTIVE_LABELS.true : ACTIVE_LABELS.false}
        </Badge>
      ),
      filterFn: inMemoryFacetedFilterFn,
    },
  ];

  if (canEdit) {
    columns.push({
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Editar sector ${row.original.name}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar
        </Button>
      ),
    });
  }

  return columns;
}

export function SectoresTable({
  workshopSectors,
  preferences,
  onEdit,
  toolbarActions,
}: {
  workshopSectors: Promise<WorkshopSector[]>;
  preferences: Promise<TablePreferences>;
  /** Abre el Sheet de edición (lo maneja `SectoresTabClient`). */
  onEdit: (sector: WorkshopSector) => void;
  /** Botón "Nuevo sector" en la barra de la tabla. */
  toolbarActions?: ReactNode;
}) {
  const sectorsData = use(workshopSectors);
  const prefs = use(preferences);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('configuracion', 'sectores_taller', 'update');

  // Los inactivos siempre al final; la lista se DERIVA de la prop para que un alta + refresh la muestre.
  const data = useMemo(() => [...sectorsData].sort((a, b) => Number(b.is_active) - Number(a.is_active)), [sectorsData]);
  const columns = useMemo(() => getSectoresColumns(onEdit, canEdit), [onEdit, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const workshopNames = Array.from(new Set(data.map((s) => s.workshops?.name).filter((n): n is string => !!n))).sort(
      (a, b) => a.localeCompare(b)
    );
    return [
      { columnId: 'name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      {
        columnId: 'workshop',
        title: 'Taller',
        options: workshopNames.map((name) => ({ value: name, label: name, icon: Building2 })),
      },
      {
        columnId: 'is_active',
        title: 'Estado',
        options: [
          { value: 'true', label: ACTIVE_LABELS.true, icon: Check },
          { value: 'false', label: ACTIVE_LABELS.false, icon: X },
        ],
      },
      { columnId: 'description', title: 'Descripción', type: 'text', placeholder: 'Buscar por descripción...' },
      { columnId: 'max_capacity', title: 'Cupo', type: 'text', placeholder: 'Buscar por cupo...' },
    ];
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={data}
        totalRows={data.length}
        searchParams={{}}
        inMemory
        mobileCards
        toolbarActions={toolbarActions}
        tableId={TABLE_ID}
        paramNamespace={TABLE_ID}
        facetedFilters={facetedFilters}
        initialColumnVisibility={prefs.columnVisibility ?? {}}
        initialFilterVisibility={prefs.filterVisibility ?? { name: true, workshop: true, is_active: true }}
        searchPlaceholder="Buscar por nombre o descripción"
        showSearch
        showFilterToggle
        emptyMessage="No hay sectores de taller cargados"
        data-testid="workshop-sectors-table"
        exportConfig={{
          fetchAllData: async () => data,
          options: { filename: 'sectores-taller', title: 'Sectores de taller', sheetName: 'Sectores' },
          formatters: {
            is_active: (value) => (String(value) === 'true' ? ACTIVE_LABELS.true : ACTIVE_LABELS.false),
          },
        }}
      />
    </div>
  );
}

export default SectoresTable;
