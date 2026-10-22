'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { inMemoryFacetedFilterFn, inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck } from 'lucide-react';
import { useMemo } from 'react';
import type { CustomerEquipmentRow } from '../../actions/customer-equipment.server';
import { CUSTOMER_EQUIPMENT_TYPES } from '../../schemas/customer-equipment';
import { CustomerEquipmentFormDialog } from './CustomerEquipmentFormDialog';

interface CustomerEquipmentTableProps {
  customerEquipments: CustomerEquipmentRow[];
  /** Cliente de la ficha: se le pasa al diálogo de edición para no volver a preguntarlo. */
  customerId: string;
  canEdit: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const TABLE_ID = 'customer-own-equipment';

export function getCustomerEquipmentColumns(customerId: string, canEdit: boolean): ColumnDef<CustomerEquipmentRow>[] {
  const columns: ColumnDef<CustomerEquipmentRow>[] = [
    {
      accessorKey: 'name',
      ...titled('Nombre'),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'type',
      ...titled('Tipo de equipo'),
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
        <CustomerEquipmentFormDialog
          customerId={customerId}
          equipment={row.original}
          triggerLabel="Editar"
          triggerVariant="link"
        />
      ),
    });
  }

  return columns;
}

/**
 * Equipos que aporta el cliente (`equipos_clientes`): un catálogo chico por cliente que llega completo desde
 * el servidor, así que ordena, filtra y pagina en memoria (`inMemory`).
 */
function CustomerEquipmentTable({
  customerEquipments,
  customerId,
  canEdit,
  initialColumnVisibility,
  initialFilterVisibility,
}: CustomerEquipmentTableProps) {
  const columns = useMemo(() => getCustomerEquipmentColumns(customerId, canEdit), [customerId, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      {
        columnId: 'type',
        title: 'Tipo de equipo',
        options: CUSTOMER_EQUIPMENT_TYPES.map((type) => ({ value: type, label: type, icon: Truck })),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={customerEquipments}
      totalRows={customerEquipments.length}
      searchParams={{}}
      inMemory
      mobileCards
      tableId={TABLE_ID}
      paramNamespace={TABLE_ID}
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por nombre o tipo"
      showSearch
      showFilterToggle
      emptyMessage="Este cliente no tiene equipos propios cargados"
      data-testid="customer-own-equipment-table"
      exportConfig={{
        fetchAllData: async () => customerEquipments,
        options: { filename: 'equipos-del-cliente', title: 'Equipos del cliente', sheetName: 'Equipos' },
      }}
    />
  );
}

export default CustomerEquipmentTable;
