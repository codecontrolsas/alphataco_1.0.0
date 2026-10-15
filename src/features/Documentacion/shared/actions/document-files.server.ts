'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import {
  DOCUMENT_FILES_BUCKET,
  DOCUMENT_FILES_EXPIRED_BUCKET,
  storageDownload,
  storageDownloadUrls,
  storageRemove,
  storageUpload,
} from '@/shared/lib/storage';
import { toPathExtension } from '@/shared/lib/storage-file-name';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { refreshDocumentStatus } from '../compliance/server/document-status.server';
import { buildRenewedDocumentName, buildReplacedDocumentName, withUniqueFolder } from '../lib/document-file-names';
import { validateDocumentFile } from '../lib/document-file-rules';
import { assertDocumentPermission, canViewAnyDocument, canViewPrivateDocuments } from '../lib/document-permissions';
import {
  countOtherPathReferences,
  filterDownloadablePaths,
  findScopedDocument,
  isApprovedAndCurrent,
  isDocumentResourceKind,
  type DocumentResourceKind,
  type ScopedDocumentRow,
} from '../lib/document-scope';

/**
 * Operaciones sobre el ARCHIVO de un documento ya cargado (descargar, eliminar, reemplazar,
 * renovar). Antes: el cliente tocaba el storage y las tablas por PostgREST directamente.
 * Ahora todo pasa por acá: el archivo se verifica contra la empresa activa (perímetro sin RLS),
 * el storage se toca en el servidor y las filas se escriben con Prisma dentro de
 * `withActor` (actor de la auditoría) y, al final de cada escritura, refrescan el cache de status de los
 * recursos afectados con el motor de cumplimiento (`refreshDocumentStatus`).
 */
const logger = new Logger('Documentacion/document-files');

export type DocumentFileResult = { ok: true } | { ok: false; error: string };

async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

function fileExtension(file: File): string {
  const ext = file.name.split('.').pop();
  if (!ext || ext === file.name) throw new Error('El archivo no tiene extensión');
  return toPathExtension(ext);
}

// ============================================================================
// DESCARGA
// ============================================================================

/** Tope de paths por llamada: evita pedir firmas de miles de archivos de una sola vez. */
const MAX_DOWNLOAD_PATHS = 500;

/**
 * URLs para descargar documentos desde el navegador.
 * Sólo se resuelven paths de documentos de la empresa activa que el usuario puede ver (los de tipos
 * privados exigen `view_private` del recurso); el resto se omite del resultado.
 */
export async function getDocumentDownloadUrls(paths: string[]): Promise<{ path: string; url: string }[]> {
  if (paths.length > MAX_DOWNLOAD_PATHS) {
    throw new Error(`Se pueden descargar hasta ${MAX_DOWNLOAD_PATHS} documentos por vez`);
  }
  if (!(await canViewAnyDocument())) throw new Error('No tenés permiso para ver documentos.');
  const companyId = await getActiveCompanyId();
  const [employee, vehicle, company] = await Promise.all([
    canViewPrivateDocuments('employee'),
    canViewPrivateDocuments('vehicle'),
    canViewPrivateDocuments('company'),
  ]);
  const owned = await filterDownloadablePaths(prisma, paths, companyId, { employee, vehicle, company });
  const allowed = [...new Set(paths)].filter((p) => owned.has(p));
  if (allowed.length !== new Set(paths).size) {
    logger.warn('Se pidieron descargas de paths ajenos a la empresa activa o privados', {
      data: { requested: paths.length, allowed: allowed.length },
    });
  }
  if (allowed.length === 0) return [];
  const result = await storageDownloadUrls(DOCUMENT_FILES_BUCKET, allowed);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

// ============================================================================
// ELIMINAR
// ============================================================================

/** Filas de documentos de un recurso (empleado/equipo) que comparten un criterio, acotadas a la empresa. */
type SharedRowsWhere = { id: string } | { document_path: string };

/**
 * `applies` (ids de recurso) de las filas de empleados/equipos que cumplen `where` en la empresa.
 * Las filas de empresa no tienen status cacheado: devuelve `[]`.
 */
async function findAffectedResourceIds(
  tx: Prisma.TransactionClient,
  kind: DocumentResourceKind,
  where: SharedRowsWhere,
  companyId: string
): Promise<string[]> {
  const rows =
    kind === 'employee'
      ? await tx.documents_employees.findMany({
          where: { ...where, employees: { company_id: companyId } },
          select: { applies: true },
        })
      : kind === 'vehicle'
        ? await tx.documents_equipment.findMany({
            where: { ...where, vehicles: { company_id: companyId } },
            select: { applies: true },
          })
        : [];
  return [...new Set(rows.flatMap((r) => (r.applies ? [r.applies] : [])))];
}

/** Refresca el cache de status de los recursos afectados (después de la última escritura de documentos). */
async function refreshAffectedStatus(
  tx: Prisma.TransactionClient,
  kind: DocumentResourceKind,
  ids: string[],
  companyId: string
): Promise<void> {
  if (ids.length === 0 || kind === 'company') return;
  await refreshDocumentStatus(tx, kind === 'employee' ? 'Persona' : 'Equipos', { ids, companyId });
}

/**
 * Elimina un documento: BORRA físicamente TODAS las filas que referencian el mismo archivo (un
 * documento multirecurso comparte el path entre recursos), acotado a la empresa activa, y luego el
 * archivo del storage. El hecho de que el documento no esté deja al recurso con un faltante
 * derivado: ya no se deja una fila `pendiente` vacía. El evento queda en el log de la app.
 */
export async function deleteDocumentFile(input: { id: string; resource: string }): Promise<DocumentFileResult> {
  try {
    if (!isDocumentResourceKind(input.resource)) return { ok: false, error: 'Tipo de recurso inválido' };
    const kind = input.resource;
    await assertDocumentPermission(kind, 'delete');
    const companyId = await getActiveCompanyId();
    const actor = await requireActor();
    const doc = await findScopedDocument(prisma, kind, input.id, companyId);
    if (!doc) return { ok: false, error: 'Documento no encontrado' };
    if (!(await canAccessDocument(kind, doc))) return { ok: false, error: 'Documento no encontrado' };
    if (!doc.document_path) return { ok: false, error: 'El documento no tiene archivo cargado' };
    const path = doc.document_path;

    const deletedRows = await withActor(actor, async (tx) => {
      const affected = await findAffectedResourceIds(tx, kind, { document_path: path }, companyId);
      let count = 0;
      switch (kind) {
        case 'employee':
          count = (
            await tx.documents_employees.deleteMany({
              where: { document_path: path, employees: { company_id: companyId } },
            })
          ).count;
          break;
        case 'vehicle':
          count = (
            await tx.documents_equipment.deleteMany({
              where: { document_path: path, vehicles: { company_id: companyId } },
            })
          ).count;
          break;
        case 'company':
          count = (await tx.documents_company.deleteMany({ where: { document_path: path, applies: companyId } })).count;
          break;
      }
      if (count === 0) throw new Error('El documento ya no existe');
      await refreshAffectedStatus(tx, kind, affected, companyId);
      return count;
    });

    logger.info('Documento eliminado', {
      data: { actor, companyId, resource: kind, path, deletedRows },
    });

    // Un archivo que otra fila (de cualquiera de las 3 tablas) todavía referencia no se borra.
    await removeFileIfUnreferenced(path);
    return { ok: true };
  } catch (error) {
    logger.error('Error al eliminar el documento', { data: { error, input } });
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo eliminar el documento' };
  }
}

/** Un documento de tipo privado sólo lo opera quien tiene `view_private` del recurso. */
async function canAccessDocument(
  kind: DocumentResourceKind,
  doc: Pick<ScopedDocumentRow, 'private'>
): Promise<boolean> {
  return !doc.private || (await canViewPrivateDocuments(kind));
}

/** Borra el archivo del storage sólo si ninguna fila de documentos lo referencia; un fallo sólo se avisa. */
async function removeFileIfUnreferenced(path: string): Promise<void> {
  if ((await countOtherPathReferences(prisma, path)) > 0) return;
  const removed = await storageRemove(DOCUMENT_FILES_BUCKET, [path]);
  if (!removed.ok) {
    // Las filas ya no lo referencian: el archivo huérfano no afecta al cumplimiento, sólo se avisa.
    logger.warn('No se pudo eliminar el archivo del storage', { data: { path } });
  }
}

// ============================================================================
// REEMPLAZAR / RENOVAR
// ============================================================================

interface FileMutationInput {
  kind: DocumentResourceKind;
  id: string;
  file: File;
  validity: Date | undefined;
  period: string | undefined;
}

/** Lee y valida el FormData común a reemplazar y renovar. */
function parseFileMutation(formData: FormData): FileMutationInput | { error: string } {
  const file = formData.get('file');
  const id = formData.get('id');
  const resource = formData.get('resource');
  const validityRaw = formData.get('validity');
  const periodRaw = formData.get('period');
  if (!(file instanceof File) || file.size === 0) return { error: 'El documento es requerido' };
  const fileError = validateDocumentFile(file);
  if (fileError) return { error: fileError };
  if (typeof id !== 'string' || !id) return { error: 'Documento inválido' };
  if (!isDocumentResourceKind(resource)) return { error: 'Tipo de recurso inválido' };
  let validity: Date | undefined;
  if (typeof validityRaw === 'string' && validityRaw) {
    validity = new Date(validityRaw);
    if (Number.isNaN(validity.getTime())) return { error: 'Fecha de vencimiento inválida' };
  }
  const period = typeof periodRaw === 'string' && periodRaw ? periodRaw : undefined;
  return { kind: resource, id, file, validity, period };
}

type DocumentUpdateData = {
  document_path: string;
  created_at: Date;
  state: 'presentado';
  validity?: Date | null;
  period?: string;
};

/**
 * `validity` es `DateTime` en empleados/equipos y `String` en empresa. Si no actualiza ninguna fila
 * (el documento se borró en el medio) lanza: así la transacción se revierte y se compensa el storage.
 */
async function updateDocumentRow(
  tx: Prisma.TransactionClient,
  kind: DocumentResourceKind,
  where: { id: string } | { document_path: string },
  companyId: string,
  data: DocumentUpdateData
): Promise<void> {
  const { count } = await updateDocumentRowUnchecked(tx, kind, where, companyId, data);
  if (count === 0) throw new Error('El documento ya no existe');
}

async function updateDocumentRowUnchecked(
  tx: Prisma.TransactionClient,
  kind: DocumentResourceKind,
  where: { id: string } | { document_path: string },
  companyId: string,
  data: DocumentUpdateData
) {
  switch (kind) {
    case 'employee':
      return tx.documents_employees.updateMany({ where: { ...where, employees: { company_id: companyId } }, data });
    case 'vehicle':
      return tx.documents_equipment.updateMany({ where: { ...where, vehicles: { company_id: companyId } }, data });
    case 'company': {
      // documents_company: `validity` es texto.
      const { validity, ...rest } = data;
      return tx.documents_company.updateMany({
        where: { ...where, applies: companyId },
        data: { ...rest, ...(validity !== undefined ? { validity: validity ? validity.toISOString() : null } : {}) },
      });
    }
  }
}

/** Rechaza reemplazar/renovar un documento aprobado y vigente (la UI avisa que no se puede modificar). */
function approvedError(doc: ScopedDocumentRow): string | null {
  return isApprovedAndCurrent(doc) ? 'El documento está aprobado y no puede ser modificado' : null;
}

/**
 * Path final del archivo nuevo: si otra fila (distinta de la que se modifica) ya usa ese path, se le
 * agrega una carpeta única para no pisar el archivo compartido.
 */
async function resolveFreePath(candidate: string, excludeId: string): Promise<string> {
  return (await countOtherPathReferences(prisma, candidate, [excludeId])) > 0 ? withUniqueFolder(candidate) : candidate;
}

/** Deshace una subida cuando la BD falló: sólo borra el archivo nuevo si no es el vigente ni lo referencia otra fila. */
async function rollbackUploadedFile(uploadedPath: string, currentPath: string): Promise<void> {
  if (uploadedPath === currentPath) return;
  if ((await countOtherPathReferences(prisma, uploadedPath)) > 0) return;
  await storageRemove(DOCUMENT_FILES_BUCKET, [uploadedPath]);
}

/**
 * Reemplaza el archivo de un documento (mismo registro): sube el nuevo, actualiza la fila y deja
 * la fila en `presentado`; recién después borra el anterior, y sólo si ninguna otra fila (de las 3
 * tablas) lo referencia. Si la BD falla, se borra el nuevo. FormData: `id`, `resource`, `file`,
 * `validity?` (ISO), `period?` (YYYY-MM).
 */
export async function replaceDocumentFile(formData: FormData): Promise<DocumentFileResult> {
  try {
    const parsed = parseFileMutation(formData);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    await assertDocumentPermission(parsed.kind, 'update');
    const companyId = await getActiveCompanyId();
    const actor = await requireActor();
    const doc = await findScopedDocument(prisma, parsed.kind, parsed.id, companyId);
    if (!doc || !(await canAccessDocument(parsed.kind, doc))) return { ok: false, error: 'Documento no encontrado' };
    if (!doc.document_path) return { ok: false, error: 'El documento no tiene archivo cargado' };
    const blocked = approvedError(doc);
    if (blocked) return { ok: false, error: blocked };
    const currentPath = doc.document_path;

    const newPath = await resolveFreePath(
      buildReplacedDocumentName(currentPath, fileExtension(parsed.file), parsed.validity),
      parsed.id
    );

    const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, newPath, parsed.file, { upsert: true });
    if (!uploaded.ok) return { ok: false, error: 'No se pudo subir el nuevo archivo' };

    try {
      await withActor(actor, async (tx) => {
        const affected = await findAffectedResourceIds(tx, parsed.kind, { id: parsed.id }, companyId);
        await updateDocumentRow(tx, parsed.kind, { id: parsed.id }, companyId, {
          document_path: uploaded.data.path,
          validity: parsed.validity ?? null,
          ...(parsed.period ? { period: parsed.period } : {}),
          created_at: new Date(),
          // Al reemplazar, el estado vuelve a 'presentado' (pendiente de aprobación): un documento
          // 'vencido' no debe quedar pegado en ese estado con una validez nueva.
          state: 'presentado',
        });
        await refreshAffectedStatus(tx, parsed.kind, affected, companyId);
      });
    } catch (error) {
      await rollbackUploadedFile(uploaded.data.path, currentPath);
      throw error;
    }

    // Recién con la fila ya apuntando al archivo nuevo se descarta el anterior (si nadie más lo usa).
    if (uploaded.data.path !== currentPath) await removeFileIfUnreferenced(currentPath);
    return { ok: true };
  } catch (error) {
    logger.error('Error al reemplazar el documento', { data: { error } });
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo reemplazar el documento' };
  }
}

/**
 * Renueva un documento: el archivo vigente pasa al bucket de vencidos (historial) y el nuevo
 * queda como vigente con versión/fecha/período nuevos. Para los mensuales sólo se sube el nuevo
 * período (el anterior sigue siendo válido para su mes). FormData igual que `replaceDocumentFile`.
 * El archivo vigente sólo se retira del bucket principal si ninguna otra fila lo referencia.
 */
export async function renewDocumentFile(formData: FormData): Promise<DocumentFileResult> {
  try {
    const parsed = parseFileMutation(formData);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    await assertDocumentPermission(parsed.kind, 'update');
    const companyId = await getActiveCompanyId();
    const actor = await requireActor();
    const doc = await findScopedDocument(prisma, parsed.kind, parsed.id, companyId);
    if (!doc || !(await canAccessDocument(parsed.kind, doc))) return { ok: false, error: 'Documento no encontrado' };
    if (!doc.document_path) return { ok: false, error: 'El documento no tiene archivo cargado' };
    const blocked = approvedError(doc);
    if (blocked) return { ok: false, error: blocked };
    const currentPath = doc.document_path;

    const docType = doc.id_document_types
      ? await prisma.document_types.findUnique({
          where: { id: doc.id_document_types },
          select: { is_it_montlhy: true },
        })
      : null;
    const monthly = docType?.is_it_montlhy === true;

    const newPath = await resolveFreePath(
      buildRenewedDocumentName(currentPath, fileExtension(parsed.file), {
        validity: parsed.validity,
        period: parsed.period,
      }),
      parsed.id
    );

    if (monthly) {
      const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, newPath, parsed.file, { upsert: true });
      if (!uploaded.ok) return { ok: false, error: 'No se pudo subir el nuevo archivo' };
      try {
        await withActor(actor, async (tx) => {
          const affected = await findAffectedResourceIds(tx, parsed.kind, { document_path: currentPath }, companyId);
          await updateDocumentRow(tx, parsed.kind, { document_path: currentPath }, companyId, {
            document_path: uploaded.data.path,
            ...(parsed.period ? { period: parsed.period } : {}),
            created_at: new Date(),
            state: 'presentado',
          });
          await refreshAffectedStatus(tx, parsed.kind, affected, companyId);
        });
      } catch (error) {
        await rollbackUploadedFile(uploaded.data.path, currentPath);
        throw error;
      }
      return { ok: true };
    }

    // Archivar el vigente en el bucket de vencidos (copia); el original se retira recién al final.
    const current = await storageDownload(DOCUMENT_FILES_BUCKET, currentPath);
    if (!current.ok) return { ok: false, error: 'No se pudo leer el archivo vigente' };
    const archived = await storageUpload(DOCUMENT_FILES_EXPIRED_BUCKET, currentPath, current.data, { upsert: true });
    if (!archived.ok) return { ok: false, error: 'No se pudo archivar el documento vencido' };
    const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, newPath, parsed.file, { upsert: true });
    if (!uploaded.ok) return { ok: false, error: 'No se pudo subir el nuevo archivo' };

    try {
      await withActor(actor, async (tx) => {
        const affected = await findAffectedResourceIds(tx, parsed.kind, { id: parsed.id }, companyId);
        await updateDocumentRow(tx, parsed.kind, { id: parsed.id }, companyId, {
          document_path: uploaded.data.path,
          validity: parsed.validity ?? null,
          created_at: new Date(),
          state: 'presentado',
        });
        await refreshAffectedStatus(tx, parsed.kind, affected, companyId);
      });
    } catch (error) {
      await rollbackUploadedFile(uploaded.data.path, currentPath);
      throw error;
    }

    if (uploaded.data.path !== currentPath) await removeFileIfUnreferenced(currentPath);
    return { ok: true };
  } catch (error) {
    logger.error('Error al renovar el documento', { data: { error } });
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo renovar el documento' };
  }
}
