import { checkPermissionServer } from '@/features/Permissions';
import { getActiveTreasuryAccountOptions } from '@/features/Treasury/actions/accounts.server';
import { getTreasuryConcepts } from '@/features/Treasury/actions/concepts.server';
import { getAccountStatementData } from '@/features/Treasury/actions/statement.server';
import { AccountStatementView } from '@/features/Treasury/Accounts/components/AccountStatementView';
import moment from 'moment';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Extracto del mes en curso: una sola lectura para la página y el título.
const getInitial = cache((id: string) =>
  getAccountStatementData(id, moment().startOf('month').format('YYYY-MM-DD'), moment().endOf('month').format('YYYY-MM-DD'))
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const data = await getInitial((await params).id);
  return { title: data ? `${data.account.name} | Tesorería` : 'Extracto | Tesorería' };
}

export default async function AccountStatementRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [initial, canCreate] = await Promise.all([getInitial(id), checkPermissionServer('tesoreria', 'movimientos', 'create')]);
  if (!initial) notFound();
  const [accounts, concepts] = canCreate ? await Promise.all([getActiveTreasuryAccountOptions(), getTreasuryConcepts()]) : [[], []];
  return <AccountStatementView initial={initial} canCreateMovement={canCreate && initial.account.is_active} accounts={accounts} concepts={concepts} />;
}
