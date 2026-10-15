import 'server-only';

import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';
import { getSupervisorFilterInfo } from '../../utils/supervisorFilter';

/**
 * Perímetro de la lista "Validar Solicitud": empresa, solo pendientes de aprobación, tipos de equipamiento
 * ocultos y filtro de supervisor. Lo comparten el listado, el export, las facets, las métricas y el contador
 * del pipeline: cada cifra se calcula con EL MISMO `where` que la tabla que dice contar (decisión D-4).
 *
 * Módulo server-only SIN `'use server'`: no es un endpoint, lo importan los archivos de acciones.
 */
export interface RequestListScope {
  companyId: string;
  /** `null` si el usuario ve todas las solicitudes; si no, el perfil del supervisor. */
  supervisorId: string | null;
  /** Sin perfil resuelto no se puede saber qué ve: no ve nada (antes quedaba sin restricción). */
  userUnresolved: boolean;
  hiddenTypeIds: readonly string[];
}

export async function resolveRequestListScope(companyId: string): Promise<RequestListScope> {
  const [filterInfo, hiddenTypeIds] = await Promise.all([getSupervisorFilterInfo(), getHiddenEquipmentTypeIds()]);

  return {
    companyId,
    supervisorId: filterInfo?.shouldFilterBySupervisor ? filterInfo.userId : null,
    userUnresolved: filterInfo === null,
    hiddenTypeIds,
  };
}

/** Condiciones de perímetro, para meter dentro de un único `AND`. */
export function requestScopeConditions(scope: RequestListScope): Record<string, unknown>[] {
  const equipmentCondition = visibleEquipmentTypeCondition(scope.hiddenTypeIds);
  const conditions: Record<string, unknown>[] = [
    { company_id: scope.companyId },
    // Solo solicitudes pendientes de aprobación (paso "Validar Solicitud"). Las rechazadas se limpian de este
    // listado: quedan como registro histórico en el legajo del equipo, tab "Historial de Mantenimiento".
    { status: 'pending_approval' },
  ];
  if (equipmentCondition) conditions.push(equipmentCondition);
  if (scope.userUnresolved) conditions.push({ id: { in: [] } });
  else if (scope.supervisorId) conditions.push({ supervisor_id: scope.supervisorId });
  return conditions;
}
