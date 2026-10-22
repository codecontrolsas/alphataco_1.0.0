import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { document_applies } from '@/generated/prisma/enums';
import { prisma } from '@/shared/lib/prisma';
import { findScopedDocumentType } from './document-type-scope';

/**
 * Permisos de servidor de los tipos de documento.
 *
 * Las tabs `tipos-docs-*` viven en el módulo `configuracion` (migración
 * `20260924180000_move_config_sections_to_configuracion`), colgando de la tab `documentos`. Sus acciones
 * son `view`, `create`, `update` y `view_private`: no existe `delete`, así que desactivar, reactivar
 * y eliminar exigen `update` (el mismo permiso con que el modal habilita editar).
 * Módulo sin directiva: lo importan las server actions de la feature.
 */

const PERMISSION_MODULE = 'configuracion';
const PARENT_TAB = 'documentos';

const TAB_BY_APPLIES: Record<document_applies, string> = {
  Persona: 'tipos-docs-personas',
  Equipos: 'tipos-docs-equipos',
  Empresa: 'tipos-docs-empresa',
};

export type DocTypePermissionAction = 'view' | 'create' | 'update' | 'view_private';

const ACTION_LABELS: Record<DocTypePermissionAction, string> = {
  view: 'ver tipos de documento',
  create: 'crear tipos de documento',
  update: 'modificar tipos de documento',
  view_private: 'ver tipos de documento privados',
};

/** `true` si el usuario tiene el permiso sobre la tab de tipos del alcance `applies`. */
export async function hasDocTypePermission(
  applies: document_applies,
  action: DocTypePermissionAction
): Promise<boolean> {
  if (await checkPermissionServer(PERMISSION_MODULE, TAB_BY_APPLIES[applies], action)) return true;
  // El botón "Nuevo tipo" lo habilita `configuracion:documentos:create` (tab padre): se respeta el mismo criterio.
  if (action === 'create') return checkPermissionServer(PERMISSION_MODULE, PARENT_TAB, 'create');
  return false;
}

/** Lanza si el usuario no tiene el permiso sobre los tipos del alcance `applies`. */
export async function assertDocTypePermission(
  applies: document_applies,
  action: DocTypePermissionAction
): Promise<void> {
  if (!(await hasDocTypePermission(applies, action))) {
    throw new Error(`No tenés permiso para ${ACTION_LABELS[action]}.`);
  }
}

/**
 * Para acciones que reciben solo el id del tipo: resuelve su alcance (acotado a la empresa activa) y exige
 * `action` sobre ese alcance. Si el tipo es privado, además exige `view_private` (se responde "no encontrado"
 * para no revelar que existe). Devuelve el `applies` resuelto.
 */
export async function assertDocTypeIdPermission(
  docTypeId: string,
  companyId: string,
  action: DocTypePermissionAction
): Promise<document_applies> {
  const docType = await findScopedDocumentType(prisma, docTypeId, companyId, { applies: true, private: true });
  await assertDocTypePermission(docType.applies, action);
  if (docType.private && !(await hasDocTypePermission(docType.applies, 'view_private'))) {
    throw new Error('Tipo de documento no encontrado');
  }
  return docType.applies;
}
