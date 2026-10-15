import { getReconciliationAccounts, getReconciliationData } from '../actions/reconciliation.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ReconciliationView } from './components/ReconciliationView';

/**
 * Tab Conciliación (spec Tesorería etapa 4 §4.2): la cuenta bancaria elegida (`?cuenta=`, si no la
 * primera activa) con sus importaciones, sus líneas pendientes y el libro sin conciliar.
 */
export default async function ReconciliationTabContent({
  searchParams,
  permissions,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:conciliacion:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const accounts = await getReconciliationAccounts();
  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay cuentas bancarias. Creá una en Tesorería → Configuración para conciliar su extracto.</p>;
  }
  const requested = typeof searchParams.cuenta === 'string' ? searchParams.cuenta : null;
  const accountId = accounts.find((a) => a.id === requested)?.id ?? accounts[0]!.id;
  const data = await getReconciliationData(accountId);
  if (!data) return <StateBlock variant="error" title="No se pudo cargar la información" description="Actualizá la pantalla para intentarlo de nuevo." />;
  const can = {
    import: permissions['tesoreria:conciliacion:create'] === true,
    update: permissions['tesoreria:conciliacion:update'] === true,
    delete: permissions['tesoreria:conciliacion:delete'] === true,
    debitChecks: permissions['tesoreria:cheques-propios:update'] === true,
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Importá el extracto del banco y conciliá cada línea con un movimiento del libro, o registrala si falta (gastos, intereses, impuestos).
      </p>
      <ReconciliationView key={accountId} accounts={accounts} accountId={accountId} initialData={data} can={can} />
    </div>
  );
}
