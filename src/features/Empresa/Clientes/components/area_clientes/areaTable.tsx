'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin } from 'lucide-react';
import { useMemo } from 'react';
import type { AreaRow } from '../../actions/areas.server';
import { AreaFormDialog, type ProvinceOption } from './AreaFormDialog';

interface AreaTableProps {
  areas: AreaRow[];
  /** Cliente de la ficha: se le pasa al diálogo de edición para no volver a preguntarlo. */
  customerId: string;
  provinces: ProvinceOption[];
  canEdit: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const TABLE_ID = 'customer-areas';

function provinceNames(area: AreaRow): string[] {
  return area.area_province.map((ap) => ap.provinces.name);
}

export function getAreaColumns(
  customerId: string,
  provinces: ProvinceOption[],
  canEdit: boolean
): ColumnDef<AreaRow>[] {
  const columns: ColumnDef<AreaRow>[] = [
    {
      accessorKey: 'nombre',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'descripcion_corta',
      accessorFn: (row) => row.descripcion_corta ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => row.original.descripcion_corta || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'provinces',
      accessorFn: (row) => provinceNames(row),
      meta: { title: 'Provincias' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Provincias" />,
      enableSorting: false,
      cell: ({ row }) => {
        const names = provinceNames(row.original);
        if (names.length === 0) return <span className="text-muted-foreground">-</span>;
        const [first, ...rest] = names;
        if (rest.length === 0) return <Badge variant="default">{first}</Badge>;
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
                >
                  <Badge variant="default">
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
      filterFn: (row, id, value: string[]) => {
        const rowValues = row.getValue<string[]>(id);
        return Array.isArray(value) && value.some((val) => rowValues.includes(val));
      },
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
        <AreaFormDialog
          customerId={customerId}
          provinces={provinces}
          area={row.original}
          triggerLabel="Editar"
          triggerVariant="link"
        />
      ),
    });
  }

  return columns;
}

/**
 * Áreas del cliente: un catálogo chico (decenas por cliente) que llega completo desde el servidor, así que
 * ordena, filtra y pagina en memoria (`inMemory`).
 */
function AreaTable({
  areas,
  customerId,
  provinces,
  canEdit,
  initialColumnVisibility,
  initialFilterVisibility,
}: AreaTableProps) {
  const columns = useMemo(() => getAreaColumns(customerId, provinces, canEdit), [customerId, provinces, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const names = Array.from(new Set(areas.flatMap((area) => provinceNames(area)))).sort((a, b) => a.localeCompare(b));
    return [
      { columnId: 'nombre', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      { columnId: 'descripcion_corta', title: 'Descripción', type: 'text', placeholder: 'Buscar por descripción...' },
      {
        columnId: 'provinces',
        title: 'Provincias',
        options: names.map((name) => ({ value: name, label: name, icon: MapPin })),
      },
    ];
  }, [areas]);

  return (
    <DataTable
      columns={columns}
      data={areas}
      totalRows={areas.length}
      searchParams={{}}
      inMemory
      mobileCards
      tableId={TABLE_ID}
      paramNamespace={TABLE_ID}
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por nombre o descripción"
      showSearch
      showFilterToggle
      emptyMessage="Este cliente no tiene áreas cargadas"
      data-testid="customer-areas-table"
      exportConfig={{
        fetchAllData: async () => areas,
        options: { filename: 'areas-cliente', title: 'Áreas del cliente', sheetName: 'Áreas' },
        formatters: {
          provinces: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
        },
      }}
    />
  );
}

export default AreaTable;
