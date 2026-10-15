import { StateBlock } from '@/shared/components/common/StateBlock';
import { getTreasuryAccounts } from '../actions/accounts.server';
import { getTreasuryConcepts } from '../actions/concepts.server';
import { getOpeningBalances } from '../actions/movements.server';
import { ConceptsSection } from './components/ConceptsSection';
import { TreasuryAccountsSection } from './components/TreasuryAccountsSection';

/** Configuración de Tesorería: cuentas y cajas (con saldo inicial) y conceptos. */
export default async function SettingsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['tesoreria:config-tesoreria:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const [accounts, openings, concepts] = await Promise.all([
    getTreasuryAccounts(),
    getOpeningBalances(),
    getTreasuryConcepts(),
  ]);
  const can = {
    create: permissions['tesoreria:config-tesoreria:create'] === true,
    update: permissions['tesoreria:config-tesoreria:update'] === true,
    delete: permissions['tesoreria:config-tesoreria:delete'] === true,
  };
  return (
    <div className="max-w-2xl space-y-6">
      <TreasuryAccountsSection
        accounts={accounts}
        openings={openings}
        canCreate={can.create}
        canUpdate={can.update}
        canDelete={can.delete}
      />
      <ConceptsSection concepts={concepts} canCreate={can.create} canUpdate={can.update} canDelete={can.delete} />
    </div>
  );
}
