'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import {
  inMemoryDateSortingFn,
  inMemoryFacetedFilterFn,
  inMemoryTextFilterFn,
} from '@/shared/components/common/DataTable/in-memory';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { fetchMaintenanceGroupsActionType, fetchTypesOfRepairActionType } from './actions/maintenanceGroupActions';

type GroupRow = fetchMaintenanceGroupsActionType['groups'][number] & Record<string, unknown>;
type RepairTypes = fetchTypesOfRepairActionType['types'];

interface MaintenanceGroupsTableProps {
  groups: fetchMaintenanceGroupsActionType['groups'];
  types: RepairTypes;
  onEdit: (group: fetchMaintenanceGroupsActionType['groups'][number]) => void;
  canEdit: boolean;
  /** Botón "Nuevo grupo" en la barra de la tabla. */
  toolbarActions?: ReactNode;
}

const DEFAULT_VISIBLE_FILTERS = ['name', 'types', 'is_active'];
const HIDDEN_COLUMNS = ['description', 'created_at'];

function getTypeNames(row: GroupRow, types: RepairTypes): string[] {
  const names = new Map(types.map((type) => [type.id, type.name]));
  return row.maintenance_group_type_of_repairs
    .map((relation) => names.get(relation.type_id))
    .filter((name): name is string => !!name);
}

function getColumns(
  types: RepairTypes,
  onEdit: MaintenanceGroupsTableProps['onEdit'],
  canEdit: boolean
): ColumnDef<GroupRow>[] {
  const columns: ColumnDef<GroupRow>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      ...titled('Nombre'),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'types',
      // Para el Excel y la búsqueda: nombres separados por coma.
      accessorFn: (row) => getTypeNames(row, types).join(', '),
      ...titled('Tipos de reparación'),
      cell: ({ row }) => {
        const typeNames = getTypeNames(row.original, types);
        if (!typeNames.length) return <span>-</span>;
        const [first, ...rest] = typeNames;
        if (rest.length === 0) return <Badge variant="default">{first}</Badge>;
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Badge variant="default" className="cursor-pointer select-none">
                    {first} +{rest.length}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-1">
                  {rest.map((name) => (
                    <p key={name}>{name}</p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      // El filtro es por tipo (id): el grupo coincide si tiene alguno de los elegidos.
      filterFn: (row, _id, value: string[]) =>
        row.original.maintenance_group_type_of_repairs.some((relation) => value.includes(relation.type_id)),
    },
    {
      id: 'description',
      accessorKey: 'description',
      ...titled('Descripción'),
      cell: ({ row }) => (
        <span className="whitespace-pre-line text-muted-foreground">{row.original.description || '-'}</span>
      ),
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'is_active',
      accessorFn: (row) => (row.is_active ? 'Activo' : 'Inactivo'),
      ...titled('Estado'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'default'}>
          {row.original.is_active ? (
            <Check aria-hidden="true" className="mr-1 h-3 w-3" />
          ) : (
            <X aria-hidden="true" className="mr-1 h-3 w-3" />
          )}
          {row.original.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'created_at',
      accessorFn: (row) => (row.created_at ? formatArgentinaDay(row.created_at) : ''),
      ...titled('Creado'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}
        </span>
      ),
      // El modo in-memory no resuelve rangos de fecha: se ordena y se exporta, sin filtro.
      sortingFn: inMemoryDateSortingFn,
    },
  ];

  if (canEdit) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      meta: { excludeFromExport: true, title: 'Acciones' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button type="button" size="sm" variant="link" onClick={() => onEdit(row.original)}>
          Editar
        </Button>
      ),
    });
  }

  return columns;
}

function MaintenanceGroupsTable({ groups, types, onEdit, canEdit, toolbarActions }: MaintenanceGroupsTableProps) {
  const rows = groups as GroupRow[];
  const columns = useMemo(() => getColumns(types, onEdit, canEdit), [types, onEdit, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'name', title: 'Nombre', type: 'text' },
      { columnId: 'types', title: 'Tipos de reparación', options: types.map((t) => ({ label: t.name, value: t.id })) },
      {
        columnId: 'is_active',
        title: 'Estado',
        options: [
          { label: 'Activo', value: 'Activo', icon: Check },
          { label: 'Inactivo', value: 'Inactivo', icon: X },
        ],
      },
      { columnId: 'description', title: 'Descripción', type: 'text' },
    ],
    [types]
  );

  const initialColumnVisibility = useMemo(() => Object.fromEntries(HIDDEN_COLUMNS.map((id) => [id, false])), []);
  const initialFilterVisibility = useMemo(
    () => Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)])),
    [facetedFilters]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalRows={rows.length}
      searchParams={{}}
      inMemory
      toolbarActions={toolbarActions}
      tableId="maintenance-groups-table"
      paramNamespace="maintenance-groups-table"
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por nombre o descripción..."
      showFilterToggle
      emptyMessage="No hay grupos de reparación cargados"
    />
  );
}

export default MaintenanceGroupsTable;
