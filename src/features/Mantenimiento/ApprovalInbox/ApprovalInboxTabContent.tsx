import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveWorkshopSectors } from '../OrderManagement/actions/queries.server';
import {
  getOrdersPendingValidation,
  getPendingApprovalTasks,
  getReturnedOrders,
  getReturnedTasks,
} from './actions/actionsServer';
import { ApprovalInboxClient } from './components/ApprovalInboxClient';

const logger = new Logger('ApprovalInbox/TabContent');

/** Valor de una consulta aislada: si falla se loguea y queda `undefined` (el cliente reintenta y muestra su error). */
function valueOrUndefined<T>(label: string, result: PromiseSettledResult<T>): T | undefined {
  if (result.status === 'fulfilled') return result.value;
  logger.error('Error al cargar un bloque de la bandeja de aprobaciones', { data: { error: result.reason, label } });
  return undefined;
}

/**
 * Tab de Aprobaciones - Jefe de Taller (Paso 4)
 *
 * Una sola pantalla con cuatro bloques: Autorizaciones, Reasignaciones, Validación de cierre y Órdenes
 * devueltas (informativa). Cada consulta va aislada: si una falla, su bloque muestra el error con reintento
 * y los demás siguen funcionando.
 *
 * Las acciones de validacion de ordenes se importan de MaintenanceOrders/actions/actionsServer.ts
 */
export async function ApprovalInboxTabContent() {
  if (!(await checkPermissionServer('mantenimiento', 'bandeja_aprobaciones', 'view'))) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin acceso a Aprobaciones"
        description="No tenés permiso para ver la bandeja de aprobaciones."
      />
    );
  }

  const [validationOrders, pendingTasks, returnedTasks, returnedOrders, sectorsData] = await Promise.allSettled([
    getOrdersPendingValidation(),
    getPendingApprovalTasks(),
    getReturnedTasks(),
    getReturnedOrders(),
    getActiveWorkshopSectors(),
  ]);

  const sectors = (valueOrUndefined('sectors', sectorsData) ?? []).map((s) => ({ id: s.id, name: s.name }));

  return (
    <ApprovalInboxClient
      initialValidationOrders={valueOrUndefined('validation-orders', validationOrders)}
      initialPendingTasks={valueOrUndefined('pending-tasks', pendingTasks)}
      initialReturnedTasks={valueOrUndefined('returned-tasks', returnedTasks)}
      initialReturnedOrders={valueOrUndefined('returned-orders', returnedOrders)}
      sectors={sectors}
    />
  );
}
