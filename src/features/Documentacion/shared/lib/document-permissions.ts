import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { DocumentResourceKind } from './document-scope';

/**
 * Permisos de servidor del módulo Documentación para las acciones de `shared/`. Usan EXACTAMENTE
 * las mismas claves que los botones del cliente:
 * - Alta desde el encabezado de la lista: `documentos-de-<recurso>:create`.
 * - Alta desde una fila de la lista: subtab `docs-<recurso>-(permanentes|mensuales):update`, o
 *   `documentos-de-<recurso>:upload_private` si el tipo es privado.
 * - Renovar / reemplazar / eliminar (ficha del documento): `detalle-de-documento:update`.
 * - Ver la ficha: `detalle-de-documento:view`; ver las listas: `documentos-de-<recurso>:view`.
 * Módulo sin directiva: lo importan las server actions del módulo.
 */

const MODULE = 'documentacion';

const TAB_BY_KIND = {
  employee: 'documentos-de-empleados',
  vehicle: 'documentos-de-equipos',
  company: 'documentos-de-empresa',
} as const satisfies Record<DocumentResourceKind, string>;

const SUBTAB_BY_KIND = {
  employee: { permanent: 'docs-empleados-permanentes', monthly: 'docs-empleados-mensuales' },
  vehicle: { permanent: 'docs-equipos-permanentes', monthly: 'docs-equipos-mensuales' },
  company: { permanent: 'docs-empresa-permanentes', monthly: 'docs-empresa-mensuales' },
} as const satisfies Record<DocumentResourceKind, { permanent: string; monthly: string }>;

export type DocumentPermissionAction = 'view' | 'create' | 'update' | 'delete' | 'view_private';

const DETAIL_TAB = 'detalle-de-documento';

export class DocumentPermissionError extends Error {
  constructor(message = 'No tenés permiso para realizar esta acción sobre documentos.') {
    super(message);
    this.name = 'DocumentPermissionError';
  }
}

/**
 * Exige el permiso para operar sobre documentos de un recurso:
 * - `view` / `view_private` / `create`: sobre la tab de la lista del recurso.
 * - `update` / `delete`: sobre la ficha del documento (`detalle-de-documento:update`), que es lo
 *   que habilita los botones Renovar, Reemplazar y Eliminar. (Las tabs de lista no admiten
 *   `update`/`delete` en `permissions-map.ts`.)
 */
export async function assertDocumentPermission(
  kind: DocumentResourceKind,
  action: DocumentPermissionAction
): Promise<void> {
  const allowed =
    action === 'update' || action === 'delete'
      ? await checkPermissionServer(MODULE, DETAIL_TAB, 'update')
      : await checkPermissionServer(MODULE, TAB_BY_KIND[kind], action);
  if (!allowed) throw new DocumentPermissionError();
}

/** Puede ver los tipos/documentos privados de las listas del recurso. */
export function canViewPrivateDocuments(kind: DocumentResourceKind): Promise<boolean> {
  return checkPermissionServer(MODULE, TAB_BY_KIND[kind], 'view_private');
}

/**
 * Exige poder SUBIR un documento: tipo privado → `upload_private`; si no, `create` en la lista
 * del recurso o `update` en la subtab (permanentes/mensuales) desde la que se sube por fila.
 */
export async function assertDocumentUploadPermission(
  kind: DocumentResourceKind,
  options: { monthly: boolean; isPrivate: boolean }
): Promise<void> {
  const tab = TAB_BY_KIND[kind];
  if (options.isPrivate) {
    if (!(await checkPermissionServer(MODULE, tab, 'upload_private'))) {
      throw new DocumentPermissionError('No tenés permiso para subir documentos privados.');
    }
    return;
  }
  const subtab = options.monthly ? SUBTAB_BY_KIND[kind].monthly : SUBTAB_BY_KIND[kind].permanent;
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer(MODULE, tab, 'create'),
    checkPermissionServer(MODULE, subtab, 'update'),
  ]);
  if (!canCreate && !canUpdate) throw new DocumentPermissionError('No tenés permiso para subir documentos.');
}

/**
 * Puede abrir el modal de subida de un recurso (listar tipos y recursos): alguno de los permisos
 * de alta. Mismo criterio que `assertDocumentUploadPermission`, sin conocer todavía el tipo.
 */
export async function canAccessDocumentUpload(kind: DocumentResourceKind): Promise<boolean> {
  const tab = TAB_BY_KIND[kind];
  const checks = await Promise.all([
    checkPermissionServer(MODULE, tab, 'create'),
    checkPermissionServer(MODULE, tab, 'upload_private'),
    checkPermissionServer(MODULE, SUBTAB_BY_KIND[kind].permanent, 'update'),
    checkPermissionServer(MODULE, SUBTAB_BY_KIND[kind].monthly, 'update'),
  ]);
  return checks.some(Boolean);
}

export async function assertDocumentUploadAccess(kind: DocumentResourceKind): Promise<void> {
  if (!(await canAccessDocumentUpload(kind)))
    throw new DocumentPermissionError('No tenés permiso para subir documentos.');
}

/**
 * Puede ver (y por lo tanto elegir al subir) los tipos privados del recurso: `view_private` o
 * `upload_private`. Quien sólo tiene `upload_private` sube desde la fila de la lista.
 */
export async function canSeePrivateDocumentTypes(kind: DocumentResourceKind): Promise<boolean> {
  const tab = TAB_BY_KIND[kind];
  const [view, upload] = await Promise.all([
    checkPermissionServer(MODULE, tab, 'view_private'),
    checkPermissionServer(MODULE, tab, 'upload_private'),
  ]);
  return view || upload;
}

/** Puede ver documentos (lista del recurso o ficha): para resolver descargas. */
export async function canViewAnyDocument(): Promise<boolean> {
  const checks = await Promise.all([
    checkPermissionServer(MODULE, DETAIL_TAB, 'view'),
    ...Object.values(TAB_BY_KIND).map((tab) => checkPermissionServer(MODULE, tab, 'view')),
  ]);
  return checks.some(Boolean);
}

/** Puede abrir la ficha de un documento (`detalle-de-documento:view`): lecturas por id. */
export async function assertDocumentDetailView(): Promise<void> {
  if (!(await checkPermissionServer(MODULE, DETAIL_TAB, 'view'))) throw new DocumentPermissionError();
}
