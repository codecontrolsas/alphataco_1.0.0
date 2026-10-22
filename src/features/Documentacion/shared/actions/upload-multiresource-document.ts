'use server';

import { documentTypeCompanyScope } from '@/features/Documentacion/TiposDocumentos/lib/document-type-scope';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { calculateNameOFDocument } from '@/lib/utils';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { DOCUMENT_FILES_BUCKET, storageRemove, storageUpload } from '@/shared/lib/storage';
import { formatValidityDay, toPathExtension, toPathIdentifier } from '@/shared/lib/storage-file-name';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { formatDocumentTypeName, formatPathSegment } from '@/shared/utils/legacy-mappers';
import { arToday } from '@/features/Documentacion/shared/compliance/dates';
import { typeAppliesTo } from '@/features/Documentacion/shared/compliance/applicability';
import { loadComplianceDataset } from '../compliance/server/dataset.server';
import { refreshDocumentStatus } from '../compliance/server/document-status.server';
import { withUniqueFolder } from '../lib/document-file-names';
import { validateDocumentFile } from '../lib/document-file-rules';
import { DocumentPermissionError, assertDocumentUploadPermission } from '../lib/document-permissions';
import { countOtherPathReferences } from '../lib/document-scope';
import {
  normalizePeriod,
  planDocumentWrites,
  type DocumentWritePlan,
  type ExistingDocumentRow,
} from '../lib/plan-writes';

const logger = new Logger('Documentacion/uploadMultiResourceDocument');

/** `updated`: filas existentes renovadas o reutilizadas; `created`: filas nuevas; `skipped`: recursos que ya tenían el documento vigente. */
type Result =
  | { ok: true; updated: number; created: number; skipped: number }
  | { ok: false; error: string; code?: 'ALREADY_UPLOADED' };

/** Tope de recursos por subida: acota la transacción y el trabajo de cumplimiento. */
const MAX_APPLIES_IDS = 2000;

type ResourceKind = 'empleado' | 'equipo';

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Única vía de subida de documentos de empleados/equipos (`SimpleDocument` con N=1 y los
 * formularios multirrecurso con N recursos). Sube el archivo al storage y persiste las filas en una
 * transacción con actor, por (recurso, tipo, período), SIN filas pendientes (ver `lib/plan-writes.ts`):
 * el recurso que ya tiene un documento vigente se saltea, el que lo tiene vencido se renueva (se
 * actualiza esa fila), el que no tiene se crea (mismo `document_path` para todos). Una fila legacy
 * vacía se reutiliza. Nunca escribe `archived_at`. Al final refresca el status de TODOS los recursos
 * tocados, en lote, después de la última escritura. Si la transacción falla, borra el archivo
 * (compensación).
 *
 * FormData: `file`, `resource` ('empleado'|'equipo'), `documentTypeId`, `appliesIds` (JSON string[]),
 * `validity?` (ISO), `period?` (YYYY-MM), `policyNumber?` (sólo equipos). El nombre del archivo lo arma
 * siempre el servidor (segmentos saneados).
 * carpeta de la empresa activa. El usuario que sube sale de la sesión, nunca del cliente.
 *
 * Perímetro: todos los `appliesIds` deben pertenecer a la empresa activa y el tipo de documento
 * ser global o de la empresa; si no, no se escribe nada. Permisos: tipo privado → `upload_private`;
 * si no, `create` de la lista o `update` de la subtab (ver `document-permissions.ts`). Los recursos a
 * los que un tipo obligatorio no se les exige se descartan (si no queda ninguno, es un error).
 */
export async function uploadMultiResourceDocument(formData: FormData): Promise<Result> {
  const file = formData.get('file');
  const resource = formString(formData, 'resource');
  const documentTypeId = formString(formData, 'documentTypeId');
  const appliesRaw = formString(formData, 'appliesIds');
  const validityRaw = formString(formData, 'validity');
  const period = formString(formData, 'period');
  // Solo aplica a equipos (documents_equipment.policy_number)
  const policyNumber = formString(formData, 'policyNumber');

  if (!(file instanceof File) || file.size === 0 || !resource || !documentTypeId || !appliesRaw) {
    return { ok: false, error: 'Faltan datos para subir el documento' };
  }
  const fileError = validateDocumentFile(file);
  if (fileError) return { ok: false, error: fileError };
  if (resource !== 'empleado' && resource !== 'equipo') {
    return { ok: false, error: 'Tipo de recurso inválido' };
  }

  let appliesIds: string[];
  try {
    const parsed: unknown = JSON.parse(appliesRaw);
    if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === 'string')) {
      return { ok: false, error: 'Lista de recursos inválida' };
    }
    appliesIds = [...new Set(parsed)];
  } catch {
    return { ok: false, error: 'Lista de recursos inválida' };
  }
  if (!appliesIds.length) return { ok: false, error: 'No hay recursos para vincular' };
  if (appliesIds.length > MAX_APPLIES_IDS) return { ok: false, error: 'Demasiados recursos en una sola subida' };

  const validity = validityRaw ? new Date(validityRaw) : null;
  if (validity && Number.isNaN(validity.getTime())) return { ok: false, error: 'Fecha de vencimiento inválida' };

  const companyId = await getActiveCompanyId();
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: 'Sesión requerida' };

  // ─── Perímetro: empresa, tipo de documento y recursos ──────────────────────
  const [company, docType, resources] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true, company_cuit: true } }),
    prisma.document_types.findFirst({
      where: { id: documentTypeId, is_active: true, AND: [documentTypeCompanyScope(companyId)] },
      select: { name: true, applies: true, is_it_montlhy: true, explired: true, private: true },
    }),
    loadOwnedResources(resource, appliesIds, companyId),
  ]);
  if (!company) return { ok: false, error: 'Empresa activa no encontrada' };
  if (!docType || docType.applies !== (resource === 'empleado' ? 'Persona' : 'Equipos')) {
    return { ok: false, error: 'Tipo de documento no válido para este recurso' };
  }
  if (resources.length !== appliesIds.length) {
    logger.warn('Intento de subir documento a recursos de otra empresa', {
      data: { resource, companyId, requested: appliesIds.length, owned: resources.length },
    });
    return { ok: false, error: 'Alguno de los recursos no pertenece a la empresa activa' };
  }

  // ─── Permiso de rol (según el tipo: privado / mensual) ─────────────────────
  try {
    await assertDocumentUploadPermission(resource === 'empleado' ? 'employee' : 'vehicle', {
      monthly: docType.is_it_montlhy === true,
      isPrivate: docType.private === true,
    });
  } catch (error) {
    if (error instanceof DocumentPermissionError) return { ok: false, error: error.message };
    throw error;
  }

  // ─── Aplicabilidad: sólo los recursos a los que el tipo se les exige ────────
  const applicableIds = await filterApplicableResourceIds(resource, documentTypeId, appliesIds, companyId);
  if (applicableIds.length === 0) return { ok: false, error: 'Este documento no se le exige al recurso' };
  if (applicableIds.length !== appliesIds.length) {
    logger.warn('Se descartaron recursos a los que el tipo no aplica', {
      data: { resource, documentTypeId, requested: appliesIds.length, applicable: applicableIds.length },
    });
  }
  appliesIds = applicableIds;
  const targetResources = resources.filter((r) => applicableIds.includes(r.id));

  // ─── Nombre del archivo ────────────────────────────────────────────────────
  const extension = file.name.split('.').pop();
  if (!extension || extension === file.name) return { ok: false, error: 'El archivo no tiene extensión' };
  // El servidor arma SIEMPRE la ruta (saneada); la que mande el cliente se ignora.
  const sharedPath = buildServerPath({
    company,
    docType,
    resource,
    resources: targetResources,
    validity,
    period,
    extension,
  });

  // ─── Qué filas escribir, por (recurso, tipo, período) — antes de subir ─────
  // Un mensual admite una fila por período; un permanente, una. N=1 informa "ya subido"; multi saltea.
  const monthly = docType.is_it_montlhy === true;
  if (monthly && !normalizePeriod(period)) {
    return { ok: false, error: 'Falta seleccionar el período (AAAA-MM)' };
  }
  const targetPeriod = monthly ? normalizePeriod(period) : null;
  const plan = planDocumentWrites(await loadExistingRows(resource, appliesIds, documentTypeId), appliesIds, {
    period: targetPeriod,
    hasExpiry: docType.explired,
    today: arToday(),
  });
  if (appliesIds.length === 1 && plan.skipped.length === 1) {
    return {
      ok: false,
      error: targetPeriod
        ? `El documento ya ha sido subido para el período ${targetPeriod}`
        : 'El documento ya ha sido subido anteriormente',
      code: 'ALREADY_UPLOADED',
    };
  }
  const updatedCount = plan.toRenew.length + plan.toFill.length;
  if (updatedCount + plan.toCreate.length === 0) {
    // Multi: todos ya lo tienen vigente para ese período → nada que escribir, no se sube un archivo huérfano.
    return { ok: true, updated: 0, created: 0, skipped: plan.skipped.length };
  }

  // 1. Subir el archivo al storage. El path multirecurso lleva un id único, así que `upsert` nunca
  // pisa el archivo de otra subida y la compensación de abajo sólo borra lo que subió esta llamada.
  const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, sharedPath, file, { cacheControl: '0', upsert: true });
  if (!uploaded.ok) {
    return { ok: false, error: 'No se pudo subir el archivo al storage' };
  }

  // 2. Persistir en una transacción con actor (auditoría) y refrescar el status al final
  try {
    await withActor(userId, (tx) =>
      persistPlan(tx, {
        resource,
        plan,
        documentTypeId,
        sharedPath,
        validity,
        userId,
        targetPeriod,
        policyNumber: policyNumber ?? null,
        companyId,
      })
    );
    return { ok: true, updated: updatedCount, created: plan.toCreate.length, skipped: plan.skipped.length };
  } catch (error) {
    // Compensación: la BD falló → borrar el archivo subido para no dejar huérfanos
    logger.error('Error al persistir documentos multirecurso; revirtiendo storage', { data: { error } });
    // Con un solo recurso el path es determinístico y `upsert` pudo pisar un archivo que otra fila sigue
    // usando: sólo se borra si nadie más lo referencia.
    if ((await countOtherPathReferences(prisma, sharedPath)) === 0) {
      await storageRemove(DOCUMENT_FILES_BUCKET, [sharedPath]);
    }
    return { ok: false, error: 'No se pudieron guardar los documentos. Se revirtió la subida.' };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

type OwnedResource = { id: string; name: string; document: string };

/** Recursos de la empresa activa entre los pedidos (perímetro), con nombre y documento para el path. */
async function loadOwnedResources(resource: ResourceKind, ids: string[], companyId: string): Promise<OwnedResource[]> {
  if (resource === 'empleado') {
    const rows = await prisma.employees.findMany({
      where: { id: { in: ids }, company_id: companyId },
      select: { id: true, firstname: true, lastname: true, document_number: true },
    });
    return rows.map((r) => ({ id: r.id, name: `${r.firstname} ${r.lastname}`, document: r.document_number }));
  }
  const rows = await prisma.vehicles.findMany({
    where: { id: { in: ids }, company_id: companyId },
    select: { id: true, domain: true, serie: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.domain || r.serie || '', document: r.serie || r.domain || '' }));
}

/**
 * Path del archivo cuando el cliente no lo manda:
 * - N=1 → `<empresa>/<persona|equipos>/<nombre>-(<documento>)/<tipo>-(<marca>).<ext>`
 * - N>1 → `<empresa>/multirecursos/<persona|equipos>/<tipo>-(<marca>).<ext>`
 * `<marca>` = fecha de vencimiento `DD-MM-YYYY`, período o `v0`.
 */
function buildServerPath(input: {
  company: { company_name: string; company_cuit: string };
  docType: { name: string };
  resource: ResourceKind;
  resources: OwnedResource[];
  validity: Date | null;
  period: string | undefined;
  extension: string;
}): string {
  const { company, docType, resource, resources, validity, period, extension } = input;
  const resourceFolder = resource === 'empleado' ? 'persona' : 'equipos';
  const version = validity ? formatValidityDay(validity) : period || 'v0';
  if (resources.length === 1) {
    // Carpeta por recurso `<nombre>-(<documento>)`: se arma a mano porque `calculateNameOFDocument`
    // normaliza el segmento y perdería los paréntesis que usan las carpetas existentes.
    const target = resources[0];
    const companyFolder = `${formatPathSegment(company.company_name)}-(${toPathIdentifier(company.company_cuit)})`;
    const resourceSegment = `${formatPathSegment(target.name)}-(${toPathIdentifier(target.document)})`;
    const fileName = `${formatDocumentTypeName(docType.name)}-(${version}).${toPathExtension(extension)}`;
    return `${companyFolder}/${resourceFolder}/${resourceSegment}/${fileName}`;
  }
  // Id único: dos subidas multirecurso del mismo tipo/versión no deben pisarse.
  return withUniqueFolder(
    calculateNameOFDocument(
      company.company_name,
      company.company_cuit,
      resourceFolder,
      docType.name,
      version,
      extension,
      'multirecursos'
    )
  );
}

/**
 * Ids (de los pedidos) a los que el tipo se les exige según el motor de cumplimiento. Un tipo no
 * obligatorio se puede subir a cualquier recurso de la empresa.
 */
async function filterApplicableResourceIds(
  resource: ResourceKind,
  documentTypeId: string,
  ids: string[],
  companyId: string
): Promise<string[]> {
  const dataset = await loadComplianceDataset(prisma, {
    companyId,
    kind: resource === 'empleado' ? 'Persona' : 'Equipos',
    resourceIds: ids,
    includeDocs: false,
  });
  const type = dataset.types.find((t) => t.id === documentTypeId);
  if (!type || !type.isActive) return [];
  if (!type.mandatory) return ids;
  const applicable = new Set(dataset.resources.filter((r) => typeAppliesTo(type, r)).map((r) => r.id));
  return ids.filter((id) => applicable.has(id));
}

interface PersistPlanInput {
  resource: ResourceKind;
  plan: DocumentWritePlan;
  documentTypeId: string;
  sharedPath: string;
  validity: Date | null;
  userId: string;
  targetPeriod: string | null;
  /** Sólo equipos (`documents_equipment.policy_number`). */
  policyNumber: string | null;
  companyId: string;
}

/**
 * Escribe el plan: una sola actualización para las filas renovadas/reutilizadas (mismos datos para
 * todas), un `createMany` para las ausentes y, al final, el refresh de status de todos los tocados.
 */
async function persistPlan(tx: Prisma.TransactionClient, input: PersistPlanInput): Promise<void> {
  const { resource, plan, documentTypeId, sharedPath, validity, userId, targetPeriod, policyNumber, companyId } = input;
  const common = { state: 'presentado' as const, document_path: sharedPath, validity, user_id: userId };
  const updateIds = [...plan.toRenew, ...plan.toFill].map((r) => r.id);
  const touched = [...new Set([...plan.toRenew, ...plan.toFill].map((r) => r.applies).concat(plan.toCreate))];

  if (resource === 'empleado') {
    if (updateIds.length > 0) {
      await tx.documents_employees.updateMany({
        where: { id: { in: updateIds } },
        // Refleja el momento real de la subida; el período queda normalizado.
        data: { ...common, period: targetPeriod, created_at: new Date() },
      });
    }
    if (plan.toCreate.length > 0) {
      await tx.documents_employees.createMany({
        data: plan.toCreate.map((applies) => ({
          ...common,
          period: targetPeriod,
          applies,
          id_document_types: documentTypeId,
        })),
      });
    }
  } else {
    const equipmentData = { ...common, policy_number: policyNumber };
    if (updateIds.length > 0) {
      await tx.documents_equipment.updateMany({
        where: { id: { in: updateIds } },
        data: { ...equipmentData, period: targetPeriod, created_at: new Date() },
      });
    }
    if (plan.toCreate.length > 0) {
      await tx.documents_equipment.createMany({
        data: plan.toCreate.map((applies) => ({
          ...equipmentData,
          period: targetPeriod,
          applies,
          id_document_types: documentTypeId,
        })),
      });
    }
  }

  // Después de la ÚLTIMA escritura de documentos: así este valor es el que queda del status.
  await refreshDocumentStatus(tx, resource === 'empleado' ? 'Persona' : 'Equipos', { ids: touched, companyId });
}

/** Filas existentes del tipo para los recursos pedidos (todos los períodos; `planDocumentWrites` filtra). */
async function loadExistingRows(
  resource: ResourceKind,
  appliesIds: string[],
  documentTypeId: string
): Promise<ExistingDocumentRow[]> {
  const where = { applies: { in: appliesIds }, id_document_types: documentTypeId };
  const select = { id: true, applies: true, state: true, document_path: true, period: true, validity: true } as const;
  return resource === 'empleado'
    ? prisma.documents_employees.findMany({ where, select })
    : prisma.documents_equipment.findMany({ where, select });
}

export type UploadMultiResourceDocumentResult = Awaited<ReturnType<typeof uploadMultiResourceDocument>>;
