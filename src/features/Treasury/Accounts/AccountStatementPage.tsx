import { checkPermissionServer } from '@/features/Permissions';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getActiveMoneyAccountOptions } from '../actions/accounts.server';
import { getTreasuryConcepts } from '../actions/concepts.server';
import { getAccountStatementData } from '../actions/statement.server';
import { defaultAccountStatementRange } from '../lib/statement-range';
import { AccountStatementView } from './components/AccountStatementView';

// Extracto del mes en curso: una sola lectura para la página y el título.
const getInitial = cache((id: string) => {
  const { from, to } = defaultAccountStatementRange();
  return getAccountStatementData(id, from, to);
});

/** Título de la pestaña del extracto (sin datos si falta permiso o la cuenta no existe). */
export async function getAccountStatementTitle(id: string) {
  const data = await getInitial(id);
  return data ? `${data.account.name} | Tesorería` : 'Extracto | Tesorería';
}

/** Página del extracto de una cuenta: permiso de lectura, 404 solo si la cuenta no existe. */
export async function AccountStatementPage({ id }: { id: string }) {
  const [initial, canView, canCreate] = await Promise.all([
    getInitial(id),
    checkPermissionServer('tesoreria', 'cuentas', 'view'),
    checkPermissionServer('tesoreria', 'movimientos', 'create'),
  ]);
  if (!canView) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  if (!initial) notFound();
  const [accounts, concepts] = canCreate ? await Promise.all([getActiveMoneyAccountOptions(), getTreasuryConcepts()]) : [[], []];
  // Una cartera de cheques no lleva movimientos manuales: sus cheques entran y salen por sus operaciones.
  const canCreateMovement = canCreate && initial.account.is_active && initial.account.kind !== 'CHECK_PORTFOLIO';
  return <AccountStatementView initial={initial} canCreateMovement={canCreateMovement} accounts={accounts} concepts={concepts} />;
}
