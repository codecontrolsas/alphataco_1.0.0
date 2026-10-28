'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { HSE_FILES_BUCKET } from '../lib/constants';
import { cleanFileName, hseVersionPath, validatePdfUpload } from '../lib/pdf-file';
import {
  hseDocumentFormSchema,
  hseNewVersionSchema,
  type HseDocumentFormValues,
  type HseTargetInput,
} from '../schemas/documents';
import { syncHseAcknowledgements } from '../use-cases/sync-acknowledgements';

/**
 * Mutaciones de los documentos HSE (dashboard). Cada una: módulo prendido, permiso de la acción, empresa de la sesión
 * (nunca del pedido) y transacción con el actor. La RLS repite el control de empresa y de permiso en la base.
 *
 * Ciclo: borrador (versión 1 sin publicar) → publicar (`approve`) → versión nueva (`approve`, vuelve las aceptaciones a
 * pendiente) → retirar (`delete`, archiva: no se borra nada). Un PDF publicado no se reemplaza: es una versión nueva.
 */

const logger = new Logger('features/Hse/documents');

const NO_PERMISSION = 'No tenés permiso para hacer esto';
const NOT_FOUND = 'El documento no existe';
const SESSION_EXPIRED = 'Tu sesión venció. Volvé a iniciar sesión.';

type HseAction = 'create' | 'update' | 'delete' | 'approve';

async function requireHse(
  action: HseAction
): Promise<{ ok: true; companyId: string; profileId: string; credentialId: string } | { ok: false; error: string }> {
  if (!(await isModuleEnabled('hse'))) return { ok: false, error: 'El módulo HSE no está disponible' };
  if (!(await checkPermissionServer('hse', 'documentos-hse', action))) return { ok: false, error: NO_PERMISSION };
  const [profile, companyId] = await Promise.all([getServerAuthProfile(), getActiveCompanyId()]);
  if (!profile) return { ok: false, error: SESSION_EXPIRED };
  return { ok: true, companyId, profileId: profile.id, credentialId: profile.credentialId };
}

function revalidateHse(documentId?: string) {
  revalidatePath('/dashboard/hse');
  if (documentId) revalidatePath(`/dashboard/hse/documents/${documentId}`);
  revalidatePath('/portal', 'layout');
}

/** `YYYY-MM-DD` → Date (medianoche UTC, columna @db.Date), o null. */
function toDay(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Sin duplicados y, si está "todo el personal", solo eso (los demás quedan incluidos). */
function normalizeTargets(targets: HseTargetInput[]): HseTargetInput[] {
  if (targets.some((t) => t.kind === 'all')) return [{ kind: 'all' }];
  const seen = new Set<string>();
  return targets.filter((t) => {
    const key = `${t.kind}:${'refId' in t ? t.refId : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Los puestos, sectores y empleados elegidos tienen que ser de la empresa activa: la FK sola no lo garantiza. */
async function assertTargetsInCompany(
  tx: Prisma.TransactionClient,
  companyId: string,
  targets: HseTargetInput[]
): Promise<void> {
  const ids = (kind: HseTargetInput['kind']) =>
    targets.flatMap((t) => (t.kind !== 'all' && t.kind === kind ? [t.refId] : []));
  const [positions, sectors, employees] = [ids('position'), ids('sector'), ids('employee')];
  const [p, s, e] = await Promise.all([
    positions.length
      ? tx.company_positions.count({ where: { id: { in: positions }, company_id: companyId } })
      : Promise.resolve(0),
    sectors.length ? tx.hierarchy.count({ where: { id: { in: sectors }, company_id: companyId } }) : Promise.resolve(0),
    employees.length
      ? tx.employees.count({ where: { id: { in: employees }, company_id: companyId } })
      : Promise.resolve(0),
  ]);
  if (p !== positions.length || s !== sectors.length || e !== employees.length) {
    throw new Error('Alguno de los destinatarios no es de la empresa');
  }
}

function targetRows(companyId: string, documentId: string, targets: HseTargetInput[]) {
  return targets.map((t) => ({
    company_id: companyId,
    document_id: documentId,
    kind: t.kind,
    position_id: t.kind === 'position' ? t.refId : null,
    sector_id: t.kind === 'sector' ? t.refId : null,
    employee_id: t.kind === 'employee' ? t.refId : null,
  }));
}

async function assertTypeInCompany(tx: Prisma.TransactionClient, companyId: string, typeId: string | null) {
  if (!typeId) return;
  const type = await tx.hse_document_types.findFirst({
    where: { id: typeId, company_id: companyId },
    select: { id: true },
  });
  if (!type) throw new Error('El tipo de documento no existe');
}

function parsePayload<T>(formData: FormData, parse: (value: unknown) => T): T {
  const raw = formData.get('payload');
  if (typeof raw !== 'string') throw new Error('Faltan los datos del documento');
  return parse(JSON.parse(raw));
}

/** Errores de Prisma que se traducen a un mensaje para el usuario. */
function friendlyError(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code;
  if (code === 'P2002') return 'Otra persona acaba de modificar este documento. Recargá la página.';
  return errorMessage(error, fallback);
}

// ============================================================================
// ALTA (borrador)
// ============================================================================

/** FormData `{ payload: JSON de HseDocumentFormValues, file: PDF }`. Crea el documento en borrador con su versión 1. */
export async function createHseDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await requireHse('create');
  if (!auth.ok) return fail(auth.error);

  let values: HseDocumentFormValues;
  try {
    values = parsePayload(formData, (v) => hseDocumentFormSchema.parse(v));
  } catch {
    return fail('Revisá los datos del documento');
  }
  const pdf = await validatePdfUpload(formData.get('file'));
  if (!pdf.ok) return fail(pdf.error);

  const documentId = randomUUID();
  const versionId = randomUUID();
  const path = hseVersionPath(auth.companyId, documentId, versionId);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, pdf.file);
  if (!uploaded.ok) return fail('No se pudo subir el PDF. Intentá de nuevo.');

  try {
    const targets = normalizeTargets(values.targets);
    await withActor(auth.credentialId, async (tx) => {
      await assertTypeInCompany(tx, auth.companyId, values.typeId || null);
      await assertTargetsInCompany(tx, auth.companyId, targets);
      await tx.hse_documents.create({
        data: {
          id: documentId,
          company_id: auth.companyId,
          title: values.title,
          description: values.description || null,
          type_id: values.typeId || null,
          created_by: auth.profileId,
        },
        select: { id: true },
      });
      await tx.hse_document_versions.create({
        data: {
          id: versionId,
          company_id: auth.companyId,
          document_id: documentId,
          version: 1,
          file_path: path,
          file_name: cleanFileName(pdf.file.name),
          file_size: pdf.size,
          file_sha256: pdf.sha256,
          expires_at: toDay(values.expiresAt),
          created_by: auth.profileId,
        },
        select: { id: true },
      });
      await tx.hse_document_targets.createMany({ data: targetRows(auth.companyId, documentId, targets) });
    });
    logger.info('Documento HSE creado', { data: { documentId } });
    revalidateHse(documentId);
    return ok({ id: documentId });
  } catch (error) {
    await storageRemove(HSE_FILES_BUCKET, [path]);
    logger.error('Error al crear el documento HSE', { data: { error } });
    return fail(friendlyError(error, 'No se pudo crear el documento'));
  }
}

// ============================================================================
// EDICIÓN (datos y destinatarios)
// ============================================================================

/**
 * Edita título, tipo, descripción, vencimiento y destinatarios. Los destinatarios se reemplazan enteros: el formulario
 * se arma desde el servidor con el estado real de ESTE documento (excepción admitida en la regla de M:M). Si está
 * publicado, se concilian las aceptaciones: los nuevos destinatarios quedan pendientes y los que salen, archivados.
 */
export async function updateHseDocument(
  documentId: string,
  input: HseDocumentFormValues
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireHse('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(documentId)) return fail(NOT_FOUND);
  const parsed = hseDocumentFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos del documento');
  const values = parsed.data;

  try {
    const targets = normalizeTargets(values.targets);
    await withActor(auth.credentialId, async (tx) => {
      const document = await tx.hse_documents.findFirst({
        where: { id: documentId, company_id: auth.companyId },
        select: {
          status: true,
          current_version_id: true,
          versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
        },
      });
      if (!document) throw new Error(NOT_FOUND);
      if (document.status === 'archived') throw new Error('El documento está retirado: no se edita');
      await assertTypeInCompany(tx, auth.companyId, values.typeId || null);
      await assertTargetsInCompany(tx, auth.companyId, targets);

      await tx.hse_documents.update({
        where: { id: documentId },
        data: {
          title: values.title,
          description: values.description || null,
          type_id: values.typeId || null,
          updated_at: new Date(),
        },
        select: { id: true },
      });
      // El vencimiento es de la versión vigente (o la del borrador): es un dato, no el contenido del PDF.
      const versionId = document.current_version_id ?? document.versions[0]?.id;
      if (versionId) {
        await tx.hse_document_versions.update({
          where: { id: versionId },
          data: { expires_at: toDay(values.expiresAt) },
          select: { id: true },
        });
      }
      await tx.hse_document_targets.deleteMany({ where: { document_id: documentId } });
      await tx.hse_document_targets.createMany({ data: targetRows(auth.companyId, documentId, targets) });
      if (document.status === 'published') {
        await syncHseAcknowledgements(tx, { companyId: auth.companyId, documentId });
      }
    });
    logger.info('Documento HSE editado', { data: { documentId } });
    revalidateHse(documentId);
    return ok({ id: documentId });
  } catch (error) {
    logger.error('Error al editar el documento HSE', { data: { error, documentId } });
    return fail(friendlyError(error, 'No se pudo guardar el documento'));
  }
}

/** Reemplaza el PDF de un BORRADOR (todavía nadie lo vio). Publicado, el cambio es una versión nueva. */
export async function replaceHseDraftFile(documentId: string, formData: FormData): Promise<ActionResult<null>> {
  const auth = await requireHse('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(documentId)) return fail(NOT_FOUND);
  const pdf = await validatePdfUpload(formData.get('file'));
  if (!pdf.ok) return fail(pdf.error);

  const draft = await prisma.hse_documents.findFirst({
    where: { id: documentId, company_id: auth.companyId },
    select: {
      status: true,
      versions: { where: { published_at: null }, take: 1, select: { id: true, file_path: true } },
    },
  });
  const version = draft?.versions[0];
  if (!draft || !version) return fail(NOT_FOUND);
  if (draft.status !== 'draft') return fail('Solo se reemplaza el PDF de un borrador: publicá una versión nueva');

  // Key nueva (otra URL): el navegador no sirve el PDF viejo de su caché.
  const path = hseVersionPath(auth.companyId, documentId, `${version.id}-${Date.now()}`);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, pdf.file);
  if (!uploaded.ok) return fail('No se pudo subir el PDF. Intentá de nuevo.');
  try {
    await withActor(auth.credentialId, (tx) =>
      tx.hse_document_versions.update({
        where: { id: version.id, published_at: null },
        data: {
          file_path: path,
          file_name: cleanFileName(pdf.file.name),
          file_size: pdf.size,
          file_sha256: pdf.sha256,
        },
        select: { id: true },
      })
    );
  } catch (error) {
    await storageRemove(HSE_FILES_BUCKET, [path]);
    logger.error('Error al reemplazar el PDF del borrador', { data: { error, documentId } });
    return fail('No se pudo reemplazar el PDF');
  }
  await storageRemove(HSE_FILES_BUCKET, [version.file_path]);
  revalidateHse(documentId);
  return ok(null);
}

// ============================================================================
// PUBLICACIÓN Y VERSIONES
// ============================================================================

/** Publica el borrador: su versión pasa a vigente y quedan pendientes de aceptar todos los empleados que alcanza. */
export async function publishHseDocument(documentId: string): Promise<ActionResult<{ pending: number }>> {
  const auth = await requireHse('approve');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(documentId)) return fail(NOT_FOUND);

  try {
    const pending = await withActor(auth.credentialId, async (tx) => {
      const document = await tx.hse_documents.findFirst({
        where: { id: documentId, company_id: auth.companyId },
        select: {
          status: true,
          _count: { select: { targets: true } },
          versions: { where: { published_at: null }, orderBy: { version: 'desc' }, take: 1, select: { id: true } },
        },
      });
      const version = document?.versions[0];
      if (!document || !version) throw new Error(NOT_FOUND);
      if (document.status !== 'draft') throw new Error('El documento ya está publicado o retirado');
      if (document._count.targets === 0) throw new Error('Elegí a quién aplica antes de publicar');

      const now = new Date();
      await tx.hse_document_versions.update({
        where: { id: version.id },
        data: { published_at: now, published_by: auth.profileId },
        select: { id: true },
      });
      // `status: 'draft'` en el where: dos publicaciones simultáneas no publican dos veces.
      const updated = await tx.hse_documents.updateMany({
        where: { id: documentId, status: 'draft' },
        data: { status: 'published', current_version_id: version.id, updated_at: now },
      });
      if (updated.count !== 1) throw new Error('El documento ya está publicado o retirado');
      await syncHseAcknowledgements(tx, { companyId: auth.companyId, documentId });
      return tx.hse_document_acknowledgements.count({
        where: { version_id: version.id, archived_at: null, status: 'pending' },
      });
    });
    logger.info('Documento HSE publicado', { data: { documentId, pending } });
    revalidateHse(documentId);
    return ok({ pending });
  } catch (error) {
    logger.error('Error al publicar el documento HSE', { data: { error, documentId } });
    return fail(friendlyError(error, 'No se pudo publicar el documento'));
  }
}

/**
 * FormData `{ payload: JSON de HseNewVersionValues, file: PDF }`. Publica una versión nueva de un documento publicado:
 * las aceptaciones de la versión anterior quedan como historia (archivadas) y todos vuelven a pendiente.
 */
export async function publishHseDocumentVersion(
  documentId: string,
  formData: FormData
): Promise<ActionResult<{ version: number; pending: number }>> {
  const auth = await requireHse('approve');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(documentId)) return fail(NOT_FOUND);
  let values: ReturnType<typeof hseNewVersionSchema.parse>;
  try {
    values = parsePayload(formData, (v) => hseNewVersionSchema.parse(v));
  } catch {
    return fail('Contá qué cambió en esta versión');
  }
  const pdf = await validatePdfUpload(formData.get('file'));
  if (!pdf.ok) return fail(pdf.error);

  const versionId = randomUUID();
  const path = hseVersionPath(auth.companyId, documentId, versionId);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, pdf.file);
  if (!uploaded.ok) return fail('No se pudo subir el PDF. Intentá de nuevo.');

  try {
    const result = await withActor(auth.credentialId, async (tx) => {
      const document = await tx.hse_documents.findFirst({
        where: { id: documentId, company_id: auth.companyId },
        select: { status: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } } },
      });
      if (!document) throw new Error(NOT_FOUND);
      if (document.status !== 'published') throw new Error('Solo un documento publicado recibe versiones nuevas');
      const version = (document.versions[0]?.version ?? 0) + 1;
      const now = new Date();
      // La unicidad (documento, versión) frena dos versiones nuevas simultáneas con el mismo número.
      await tx.hse_document_versions.create({
        data: {
          id: versionId,
          company_id: auth.companyId,
          document_id: documentId,
          version,
          file_path: path,
          file_name: cleanFileName(pdf.file.name),
          file_size: pdf.size,
          file_sha256: pdf.sha256,
          change_log: values.changeLog,
          expires_at: toDay(values.expiresAt),
          published_at: now,
          published_by: auth.profileId,
          created_by: auth.profileId,
        },
        select: { id: true },
      });
      await tx.hse_documents.update({
        where: { id: documentId },
        data: { current_version_id: versionId, updated_at: now },
        select: { id: true },
      });
      await syncHseAcknowledgements(tx, { companyId: auth.companyId, documentId });
      const pending = await tx.hse_document_acknowledgements.count({
        where: { version_id: versionId, archived_at: null, status: 'pending' },
      });
      return { version, pending };
    });
    logger.info('Versión nueva de documento HSE', { data: { documentId, version: result.version } });
    revalidateHse(documentId);
    return ok(result);
  } catch (error) {
    await storageRemove(HSE_FILES_BUCKET, [path]);
    logger.error('Error al publicar la versión del documento HSE', { data: { error, documentId } });
    return fail(friendlyError(error, 'No se pudo publicar la versión'));
  }
}

/**
 * Retira un documento: queda archivado con todas sus versiones y aceptaciones (constancia), sale del portal y deja de
 * pedirse. No se borra nada.
 */
export async function archiveHseDocument(documentId: string): Promise<ActionResult<null>> {
  const auth = await requireHse('delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(documentId)) return fail(NOT_FOUND);
  try {
    const updated = await withActor(auth.credentialId, (tx) =>
      tx.hse_documents.updateMany({
        where: { id: documentId, company_id: auth.companyId, status: { not: 'archived' } },
        data: { status: 'archived', archived_at: new Date(), archived_by: auth.profileId, updated_at: new Date() },
      })
    );
    if (updated.count !== 1) return fail('El documento no existe o ya está retirado');
    logger.info('Documento HSE retirado', { data: { documentId } });
    revalidateHse(documentId);
    return ok(null);
  } catch (error) {
    logger.error('Error al retirar el documento HSE', { data: { error, documentId } });
    return fail('No se pudo retirar el documento');
  }
}
