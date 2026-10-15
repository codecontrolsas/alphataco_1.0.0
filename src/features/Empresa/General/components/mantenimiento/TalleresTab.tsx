import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { fetchAllWorkshops } from '../../actions/workshops.server';
import { TalleresTabClient } from './talleres/TalleresTabClient';

/**
 * Sección Talleres, montable por sí sola.
 *
 * La promesa de `fetchAllWorkshops()` se pasa SIN await a propósito: el cliente la consume
 * con `use()`, así el componente no bloquea el render de la sección. Sin permiso `view` se
 * muestra "sin permiso" (nunca una lista vacía).
 */
async function TalleresTab() {
  if (!(await checkPermissionServer('configuracion', 'talleres', 'view'))) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver los talleres"
        description="Pedile acceso a un administrador."
      />
    );
  }

  const workshops = fetchAllWorkshops();
  const preferences = getTablePreferences('workshops');

  return <TalleresTabClient workshops={workshops} preferences={preferences} />;
}

export default TalleresTab;
