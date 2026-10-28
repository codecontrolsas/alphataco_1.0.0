'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { isHseEnabled } from '../lib/feature-gate';
import { getHseDocumentFormOptions } from './queries.server';

/**
 * Opciones del formulario de documento HSE, pedidas al ABRIR el diálogo (no viajan en cada página: la lista de
 * empleados puede ser larga). Exige poder crear o editar documentos.
 */
export async function fetchHseDocumentFormOptions() {
  if (!(await isHseEnabled())) throw new Error('El módulo HSE no está disponible');
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('hse', 'documentos-hse', 'create'),
    checkPermissionServer('hse', 'documentos-hse', 'update'),
  ]);
  if (!canCreate && !canUpdate) throw new Error('No tenés permiso para editar documentos HSE');
  return getHseDocumentFormOptions();
}
