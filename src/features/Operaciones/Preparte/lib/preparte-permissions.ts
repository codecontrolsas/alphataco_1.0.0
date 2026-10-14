import { checkPermissionServer } from '@/features/Permissions/actionsServer';

export type PreparteWriteAction = 'create' | 'update' | 'delete';

const ACTION_LABELS: Record<PreparteWriteAction, string> = {
  create: 'crear pedidos',
  update: 'modificar pedidos',
  delete: 'eliminar pedidos',
};

/**
 * Exige en el servidor el permiso `operaciones:preparte:<acción>` (las mismas claves que
 * usan los botones del cliente). Con varias acciones alcanza con tener una de ellas.
 * Módulo sin directiva: lo importan las server actions del módulo.
 */
export async function assertPreparteActionAllowed(...actions: PreparteWriteAction[]): Promise<void> {
  const results = await Promise.all(actions.map((action) => checkPermissionServer('operaciones', 'preparte', action)));
  if (!results.some(Boolean)) {
    throw new Error(`No tenés permiso para ${ACTION_LABELS[actions[0]]}.`);
  }
}
