import { fetchAllContracts } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import { fetchCustomersWithRelations } from '@/features/Operaciones/Preparte/actions/form-data.server';
import { NewOrderView } from '@/features/Operaciones/Preparte/NewOrder/NewOrderView';
import { checkPermissionServer } from '@/features/Permissions';
import { redirect } from 'next/navigation';

export async function generateMetadata() {
  return { title: 'Nuevo pedido' };
}

export default async function NewOrderPage() {
  const canCreate = await checkPermissionServer('operaciones', 'preparte', 'create');
  if (!canCreate) redirect('/dashboard/operations?tab=preparte');

  const [customers, contracts] = await Promise.all([fetchCustomersWithRelations(), fetchAllContracts()]);

  return <NewOrderView customers={customers} contratos={contracts} />;
}
