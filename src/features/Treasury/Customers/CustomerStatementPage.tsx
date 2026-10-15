import { checkPermissionServer } from '@/features/Permissions';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getCustomerStatementData } from '../actions/customer-statement.server';
import { defaultCustomerStatementRange } from '../lib/statement-range';
import { CustomerStatementView } from './components/CustomerStatementView';

// Últimos tres meses (el actual y los dos anteriores): una sola lectura para la página y el título.
const getInitial = cache((id: string) => {
  const { from, to } = defaultCustomerStatementRange();
  return getCustomerStatementData(id, from, to);
});

export async function customerStatementTitle(id: string): Promise<string> {
  const data = await getInitial(id);
  return data ? `${data.customer.name} · cuenta corriente | Tesorería` : 'Cuenta corriente | Tesorería';
}

/** `/dashboard/treasury/customers/[id]`: cuenta corriente del cliente. */
export async function CustomerStatementPage({ id }: { id: string }) {
  const [canView, canCreate] = await Promise.all([
    checkPermissionServer('tesoreria', 'cobranzas', 'view'),
    checkPermissionServer('tesoreria', 'cobranzas', 'create'),
  ]);
  if (!canView) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const initial = await getInitial(id);
  if (!initial) notFound();
  return <CustomerStatementView initial={initial} canCreate={canCreate} />;
}
