'use client';

import { Badge } from '@/components/ui/badge';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import { useCustomerSelection } from '../components/CustomerSelectionContext';
import type { CustomersListItem } from './actions.server';

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['address', 'created_at'];

// ============================================================================
// CELDAS
// ============================================================================

/**
 * Nombre del cliente: abre la ficha. En móvil (tarjeta) muestra el nombre con el CUIT debajo; desde
 * `md` el CUIT tiene su propia columna.
 */
function CustomerNameCell({ customer }: { customer: CustomersListItem }) {
  const { selectCustomer } = useCustomerSelection();
  const isInactive = customer.is_active === false;

  return (
    <button
      type="button"
      onClick={() => selectCustomer(customer.id)}
      aria-label={`Abrir la ficha de ${customer.name}`}
      className={`focus-visible:ring-ring/50 min-w-0 rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] ${isInactive ? 'text-muted-foreground' : ''}`}
    >
      <span className="max-md:hidden font-medium">{customer.name}</span>
      <StackedCell className="md:hidden" primary={customer.name} secondary={customer.cuit} maxWidthClass="max-w-full" />
    </button>
  );
}

// ============================================================================
// COLUMNAS
// ============================================================================

export const columns: ColumnDef<CustomersListItem>[] = [
  {
    accessorKey: 'name',
    ...titled('Nombre'),
    cell: ({ row }) => <CustomerNameCell customer={row.original} />,
  },
  {
    accessorKey: 'cuit',
    ...titled('CUIT'),
    cell: ({ row }) => <span className="max-md:hidden font-mono tabular-nums">{row.original.cuit}</span>,
  },
  {
    accessorKey: 'client_email',
    ...titled('Email'),
    cell: ({ row }) => row.original.client_email || <span className="text-muted-foreground">-</span>,
  },
  {
    accessorKey: 'client_phone',
    ...titled('Teléfono'),
    cell: ({ row }) =>
      row.original.client_phone ? (
        <span className="font-mono tabular-nums">{row.original.client_phone}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: 'is_active',
    ...titled('Estado'),
    enableSorting: false,
    cell: ({ row }) =>
      row.original.is_active === false ? (
        <Badge variant="secondary">
          <X aria-hidden="true" />
          Inactivo
        </Badge>
      ) : (
        <Badge variant="success">
          <Check aria-hidden="true" />
          Activo
        </Badge>
      ),
    filterFn: (row, id, value: string[]) => {
      const current = row.getValue(id) as boolean | null;
      if (current == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(current));
    },
  },
  {
    accessorKey: 'address',
    ...titled('Dirección'),
    cell: ({ row }) => row.original.address || <span className="text-muted-foreground">-</span>,
  },
  {
    accessorKey: 'created_at',
    ...titled('Alta'),
    cell: ({ row }) => formatArgentinaDay(row.original.created_at),
  },
];
