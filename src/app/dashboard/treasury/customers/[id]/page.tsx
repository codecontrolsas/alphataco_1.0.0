import { checkPermissionServer } from '@/features/Permissions';
import { getCustomerStatementData } from '@/features/Treasury/actions/customer-statement.server';
import { CustomerStatementView } from '@/features/Treasury/Customers/components/CustomerStatementView';
import { NoPermission } from '@/features/Treasury/fallback/NoPermission';
import { defaultCustomerStatementRange } from '@/features/Treasury/lib/statement-range';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Últimos tres meses (el actual y los dos anteriores): una sola lectura para la página y el título.
const getInitial = cache((id: string) => {
  const { from, to } = defaultCustomerStatementRange();
  return getCustomerStatementData(id, from, to);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const data = await getInitial((await params).id);
  return { title: data ? `${data.customer.name} · cuenta corriente | Tesorería` : 'Cuenta corriente | Tesorería' };
}

export default async function CustomerStatementRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [canView, canCreate] = await Promise.all([checkPermissionServer('tesoreria', 'cobranzas', 'view'), checkPermissionServer('tesoreria', 'cobranzas', 'create')]);
  if (!canView) return <NoPermission />;
  const initial = await getInitial(id);
  if (!initial) notFound();
  return <CustomerStatementView initial={initial} canCreate={canCreate} />;
}
