'use client';

import {
  DataTable,
  DataTableColumnHeader,
  inMemoryTextFilterFn,
  type DataTableFacetedFilterConfig,
} from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { SectorRow } from '../../actions/sectors.server';
import { SectorFormDialog } from './SectorFormDialog';

interface SectorTableProps {
  contractorSectors: SectorRow[];
  /** Cliente de la ficha: se le pasa al diálogo de edición para no volver a preguntarlo. */
  customerId: string;
  canEdit: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const TABLE_ID = 'customer-sectors';

export function getSectorColumns(customerId: string, canEdit: boolean): ColumnDef<SectorRow>[] {
  const columns: ColumnDef<SectorRow>[] = [
    {
      id: 'name',
      accessorFn: (row) => row.sectors.name,
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.sectors.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'descripcion_corta',
      accessorFn: (row) => row.sectors.descripcion_corta ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => row.original.sectors.descripcion_corta || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
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
        <SectorFormDialog customerId={customerId} sector={row.original} triggerLabel="Editar" triggerVariant="link" />
      ),
    });
  }

  return columns;
}

/**
 * Sectores del cliente: un catálogo chico por cliente que llega completo desde el servidor, así que
 * ordena, filtra y pagina en memoria (`inMemory`).
 */
function SectorTable({
  contractorSectors,
  customerId,
  canEdit,
  initialColumnVisibility,
  initialFilterVisibility,
}: SectorTableProps) {
  const columns = useMemo(() => getSectorColumns(customerId, canEdit), [customerId, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      { columnId: 'descripcion_corta', title: 'Descripción', type: 'text', placeholder: 'Buscar por descripción...' },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={contractorSectors}
      totalRows={contractorSectors.length}
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
      emptyMessage="Este cliente no tiene sectores cargados"
      data-testid="customer-sectors-table"
      exportConfig={{
        fetchAllData: async () => contractorSectors,
        options: { filename: 'sectores-cliente', title: 'Sectores del cliente', sheetName: 'Sectores' },
      }}
    />
  );
}

export default SectorTable;
