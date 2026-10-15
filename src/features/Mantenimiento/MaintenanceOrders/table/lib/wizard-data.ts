import 'server-only';

import { fetchAllTypesOfRepairs } from '@/features/Mantenimiento/TiposReparaciones/actions/actions';
import {
  getActiveExternalWorkshops,
  getActiveWorkshopSectors,
  type ExternalWorkshop,
  type WorkshopSector,
} from '../../../OrderManagement/actions/queries.server';
import { DIAGNOSTICO_REPAIR_TYPE_ID } from '../../../utils/constants';

export interface MaintenanceOrderWizardData {
  sectors: WorkshopSector[];
  repairTypes: Array<{ id: string; name: string }>;
  externalWorkshops: ExternalWorkshop[];
}

/**
 * Datos del wizard de gestión (sectores, tipos de reparación y talleres externos). Se piden en paralelo
 * con la tabla y viajan como props serializables hasta el cliente.
 */
export async function loadWizardData(): Promise<MaintenanceOrderWizardData> {
  const [sectors, repairTypesData, externalWorkshops] = await Promise.all([
    getActiveWorkshopSectors(),
    fetchAllTypesOfRepairs(),
    getActiveExternalWorkshops(),
  ]);

  const repairTypes = repairTypesData
    .filter((r) => r.id !== DIAGNOSTICO_REPAIR_TYPE_ID)
    .map((r) => ({ id: r.id, name: r.name }));

  return { sectors, repairTypes, externalWorkshops };
}
