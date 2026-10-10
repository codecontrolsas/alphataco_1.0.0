import { getTreasuryAccountCards } from '../actions/accounts.server';
import { NoPermission } from '../fallback/NoPermission';
import { AccountCards } from './components/AccountCards';

/** Tab Cuentas: saldo, a debitar, a acreditar y proyectado de cada cuenta y caja activa. */
export default async function AccountsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['tesoreria:cuentas:view'] !== true) return <NoPermission />;
  const accounts = await getTreasuryAccountCards();
  return <AccountCards accounts={accounts} canConfigure={permissions['tesoreria:config-tesoreria:view'] === true} />;
}
