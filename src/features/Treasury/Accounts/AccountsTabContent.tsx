import { getTreasuryAccountCards } from '../actions/accounts.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { AccountCards } from './components/AccountCards';

/** Tab Cuentas: saldo, a debitar, a acreditar y proyectado de cada cuenta y caja activa. */
export default async function AccountsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['tesoreria:cuentas:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const accounts = await getTreasuryAccountCards();
  return <AccountCards accounts={accounts} canConfigure={permissions['tesoreria:config-tesoreria:view'] === true} />;
}
