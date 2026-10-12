import { getTreasuryAccounts } from '../actions/accounts.server';
import { getTreasuryConcepts } from '../actions/concepts.server';
import { getOpeningBalances } from '../actions/movements.server';
import { NoPermission } from '../fallback/NoPermission';
import { ConceptsSection } from './components/ConceptsSection';
import { TreasuryAccountsSection } from './components/TreasuryAccountsSection';

/** Configuración de Tesorería: cuentas y cajas (con saldo inicial) y conceptos. */
export default async function SettingsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['tesoreria:config-tesoreria:view'] !== true) return <NoPermission />;
  const [accounts, openings, concepts] = await Promise.all([getTreasuryAccounts(), getOpeningBalances(), getTreasuryConcepts()]);
  const canUpdate = permissions['tesoreria:config-tesoreria:update'] === true;
  return (
    <div className="max-w-2xl space-y-6">
      <TreasuryAccountsSection accounts={accounts} openings={openings} canUpdate={canUpdate} />
      <ConceptsSection concepts={concepts} canUpdate={canUpdate} />
    </div>
  );
}
