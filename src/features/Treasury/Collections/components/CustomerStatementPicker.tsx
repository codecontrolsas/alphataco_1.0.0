'use client';

import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { useRouter } from 'next/navigation';
import { searchCollectionCustomers } from '../../actions/customer-statement.server';

/** Lleva a la cuenta corriente del cliente elegido (incluye los dados de baja). */
export function CustomerStatementPicker() {
  const router = useRouter();
  return (
    <div className="w-72 max-w-full">
      <SearchCombobox
        queryKey={['treasury-statement-customers']}
        search={(query) => searchCollectionCustomers(query, false)}
        value=""
        selectedLabel={null}
        onSelect={(option) => option && router.push(`/dashboard/treasury/customers/${option.id}`)}
        placeholder="Cuenta corriente de…"
        searchPlaceholder="Razón social o CUIT…"
        noun="clientes"
      />
    </div>
  );
}
