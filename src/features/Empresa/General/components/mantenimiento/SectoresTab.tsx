import { getTablePreferences } from '@/shared/actions/table-preferences';
import { fetchAllWorkshopSectors, fetchInternalWorkshops } from '../../actions/workshops.server';
import { SectoresTabClient } from './sectores/SectoresTabClient';

/**
 * Sección Sectores de Taller, montable por sí sola. Ver la nota en `TalleresTab`.
 */
function SectoresTab() {
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
