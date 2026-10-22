import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { fetchAllWorkshopSectors, fetchInternalWorkshops } from '../../actions/workshops.server';
import { SectoresTabClient } from './sectores/SectoresTabClient';

/**
 * Sección Sectores de Taller, montable por sí sola. Ver la nota en `TalleresTab`.
 */
async function SectoresTab() {
  if (!(await checkPermissionServer('configuracion', 'sectores_taller', 'view'))) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver los sectores de taller"
        description="Pedile acceso a un administrador."
      />
    );
  }

  const workshopSectors = fetchAllWorkshopSectors();
  const internalWorkshops = fetchInternalWorkshops();
  const preferences = getTablePreferences('workshop-sectors');

  return (
    <SectoresTabClient
      workshopSectors={workshopSectors}
      internalWorkshops={internalWorkshops}
      preferences={preferences}
    />
  );
}

export default SectoresTab;
