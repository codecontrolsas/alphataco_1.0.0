'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createFilterOptions } from '@/features/Employees/Empleados/components/utils/utils';
import { PermissionGuard } from '@/features/Permissions';
import { BaseDataTable } from '@/shared/components/data-table/base/data-table';
import { DataTableColumnHeader } from '@/shared/components/data-table/base/data-table-column-header';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { CustomerRow } from '../lib/serializers';
import { CustomerForm } from './CustomerForm';

function includesValue(value: unknown, filter: unknown): boolean {
  return Array.isArray(filter) && filter.includes(value);
}

export const customerColumns: ColumnDef<CustomerRow>[] = [
  {
    accessorKey: 'cuit',
    id: 'Cuit',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuit" />,
    filterFn: (row, id, value) => includesValue(row.getValue(id), value),
  },
  {
    accessorKey: 'name',
    id: 'Nombre',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
    filterFn: (row, id, value) => includesValue(row.getValue(id), value),
  },
  {
    accessorKey: 'client_email',
    id: 'Email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    filterFn: (row, id, value) => includesValue(row.getValue(id), value),
  },
  {
    accessorKey: 'client_phone',
    id: 'Telefono',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Telefono" />,
    filterFn: (row, id, value) => includesValue(row.getValue(id), value),
  },
  {
    accessorKey: 'is_active',
    id: 'Estado',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      const isActive = row.original.is_active;
      return (
        <Badge variant={isActive ? 'success' : 'destructive'}>
          {isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      );
    },
    filterFn: (row, _id, value) => {
      if (!Array.isArray(value) || value.length === 0) return true;
      return value.includes(row.original.is_active ? 'Activo' : 'Inactivo');
    },
  },
];

interface CustomersListProps {
  customers: CustomerRow[];
  savedVisibility: VisibilityState;
  savedFilters: string[];
  onSelect: (customer: CustomerRow) => void;
}

/** Listado de clientes de la empresa activa con el alta en un diálogo. */
export function CustomersList({ customers, savedVisibility, savedFilters, onSelect }: CustomersListProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const filterOptions = useMemo(
    () => ({
      names: createFilterOptions(customers, (customer) => customer.name),
      cuit: createFilterOptions(customers, (customer) => customer.cuit),
      email: createFilterOptions(customers, (customer) => customer.client_email),
      phone: createFilterOptions(customers, (customer) => customer.client_phone),
      status: createFilterOptions(customers, (customer) => (customer.is_active ? 'Activo' : 'Inactivo')),
    }),
    [customers]
  );

  return (
    <div>
      <div className="mb-4">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <PermissionGuard module="comercial" tab="customers" action="create">
            <DialogTrigger asChild>
              <Button variant="brand">Registrar Cliente</Button>
            </DialogTrigger>
          </PermissionGuard>
          <DialogContent className="max-w-4xl">
            <DialogTitle>Registrar Cliente</DialogTitle>
            <CustomerForm onSuccess={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <BaseDataTable
        data={customers}
        savedVisibility={savedVisibility}
        columns={customerColumns}
        tableId="customers-table"
        onRowClick={onSelect}
        toolbarOptions={{
          initialVisibleFilters: savedFilters,
          filterableColumns: [
            { columnId: 'Nombre', title: 'Nombre', options: filterOptions.names },
            { columnId: 'Cuit', title: 'Cuit', options: filterOptions.cuit },
            { columnId: 'Email', title: 'Email', options: filterOptions.email },
            { columnId: 'Telefono', title: 'Telefono', options: filterOptions.phone },
            { columnId: 'Estado', title: 'Estado', options: filterOptions.status },
          ],
        }}
      />
    </div>
  );
}
