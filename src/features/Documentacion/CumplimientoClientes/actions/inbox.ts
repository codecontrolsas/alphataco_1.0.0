'use server';

import { uploadDocumentForRequirement } from '@/features/Documentacion/shared/actions/document-actions';
import { arToday } from '@/features/Documentacion/shared/compliance/dates';
import { validateDocumentFile } from '@/features/Documentacion/shared/lib/document-file-rules';
import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel, vehicleLabel } from '@/shared/lib/resource-labels';
import { getSessionUserId } from '@/shared/lib/session';
import { storageDownload, storageFileUrls, storageRemove } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { extractDocumentWithAi, isAiExtractionEnabled, type ExtractableType } from '../lib/ai-extract.server';
import {
  INBOX_BUCKET,
  findResourceByIdentifier,
  loadUploadableTypes,
  recordAuditEvent,
  saveInboxFile,
} from '../lib/inbox.server';

const logger = new Logger('features/Documentacion/CumplimientoClientes/inbox');

const MAX_FILES = 20;
/** Por debajo de esta confianza, lo que leyó la IA queda pendiente aunque todo coincida. */
const AUTO_VALIDATE_CONFIDENCE = 0.85;

type Kind = 'Persona' | 'Equipos';

/** Validar en la bandeja es subir el documento: mismos permisos que subir en cada lista. */
async function inboxPermissions() {
  const granted = await checkMultiplePermissionsServer([
    { moduleSlug: 'documentacion', tabSlug: 'docs-empleados-permanentes', actionSlug: 'update' },
    { moduleSlug: 'documentacion', tabSlug: 'docs-equipos-permanentes', actionSlug: 'update' },
  ]);
  const kinds: Kind[] = [];
  if (granted.get('documentacion:docs-empleados-permanentes:update') === true) kinds.push('Persona');
  if (granted.get('documentacion:docs-equipos-permanentes:update') === true) kinds.push('Equipos');
  return kinds;
}

/**
 * Ítems de la bandeja que puede ver quien tiene permiso sobre `kinds`: los de su tipo de recurso; los que todavía no
 * tienen tipo (sin clasificar), solo con permiso sobre personal y equipos.
 */
function kindScope(kinds: readonly Kind[]) {
  return kinds.length === 2 ? {} : { resource_kind: { in: [...kinds] } };
}

async function loadResourceOptions(companyId: string, kinds: readonly Kind[]) {
  const [employees, vehicles] = await Promise.all([
    kinds.includes('Persona')
      ? prisma.employees.findMany({
          where: { company_id: companyId, is_active: { not: false } },
          select: { id: true, file: true, lastname: true, firstname: true },
          orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        })
      : Promise.resolve([]),
    kinds.includes('Equipos')
      ? prisma.vehicles.findMany({
          where: { company_id: companyId, is_active: { not: false } },
          select: { id: true, intern_number: true, domain: true, serie: true },
          orderBy: { intern_number: 'asc' },
        })
      : Promise.resolve([]),
  ]);
  return {
    Persona: employees.map((e) => ({ value: e.id, label: employeeLabel(e) })),
    Equipos: vehicles.map((v) => ({ value: v.id, label: vehicleLabel(v) || v.serie || 'Equipo' })),
  };
}

/** Bandeja: lo pendiente de validar y lo último resuelto, con todo lo necesario para validar a mano. */
export async function getDocumentInbox() {
  const kinds = await inboxPermissions();
  if (kinds.length === 0)
    return { ok: false as const, error: 'No tenés permiso para subir documentos de personal ni de equipos' };
  try {
    const companyId = await getActiveCompanyId();
    const visible = kindScope(kinds);
    const [pending, recent, resources, types] = await Promise.all([
      prisma.document_inbox.findMany({
        where: { company_id: companyId, status: 'pending', ...visible },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
      prisma.document_inbox.findMany({
        where: { company_id: companyId, status: { in: ['validated', 'discarded'] }, ...visible },
        orderBy: { reviewed_at: 'desc' },
        take: 20,
      }),
      loadResourceOptions(companyId, kinds),
      Promise.all(kinds.map(async (kind) => ({ kind, types: await loadUploadableTypes(prisma, companyId, kind) }))),
    ]);
    const urls = pending.length
      ? await storageFileUrls(
          INBOX_BUCKET,
          pending.map((p) => p.file_path)
        )
      : { ok: true as const, data: [] };
    const urlByPath = new Map(urls.ok ? urls.data.map((u) => [u.path, u.url]) : []);
    const typeById = new Map(types.flatMap((t) => t.types.map((x) => [x.id, x.name] as const)));
    const resourceById = new Map([...resources.Persona, ...resources.Equipos].map((r) => [r.value, r.label]));
    const toItem = (row: (typeof pending)[number]) => ({
      id: row.id,
      source: row.source as 'ai' | 'external',
      fileName: row.file_name,
      fileUrl: urlByPath.get(row.file_path) ?? null,
      status: row.status,
      kind: (row.resource_kind as Kind | null) ?? null,
      resourceId: row.resource_id,
      resourceLabel: row.resource_id ? resourceById.get(row.resource_id) ?? null : null,
      documentTypeId: row.document_type_id,
      documentTypeName: row.document_type_id ? typeById.get(row.document_type_id) ?? null : null,
      validity: row.validity ? row.validity.toISOString().slice(0, 10) : null,
      period: row.period,
      reason: row.reason,
      uploaderName: row.uploader_name,
      createdAt: row.created_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
    });
    return {
      ok: true as const,
      aiEnabled: isAiExtractionEnabled(),
      kinds,
      resources,
      types: Object.fromEntries(
        types.map((t) => [
          t.kind,
          t.types.map((x) => ({ id: x.id, name: x.name, hasExpiry: x.explired, monthly: x.is_it_montlhy === true })),
        ])
      ) as Partial<Record<Kind, { id: string; name: string; hasExpiry: boolean; monthly: boolean }[]>>,
      pending: pending.map(toItem),
      recent: recent.map(toItem),
    };
  } catch (error) {
    logger.error('Error al leer la bandeja de documentos', { data: { error } });
    throw new Error('No se pudo leer la bandeja');
  }
}

export type DocumentInboxData = Extract<Awaited<ReturnType<typeof getDocumentInbox>>, { ok: true }>;

/**
 * Sube un documento al recurso y lo marca validado en la bandeja. Reusa la vía única de subida (permisos, tipo que le
 * aplica al recurso, fila `presentado`, status del recurso), así que validar acá es lo mismo que subir desde una lista.
 */
async function createDocumentFromFile(input: {
  kind: Kind;
  resourceId: string;
  documentTypeId: string;
  file: File;
  validity: string | null;
  period: string | null;
}) {
  return uploadDocumentForRequirement({
    kind: input.kind === 'Persona' ? 'employee' : 'vehicle',
    resourceId: input.resourceId,
    documentTypeId: input.documentTypeId,
    file: input.file,
    validity: input.validity ? new Date(`${input.validity}T12:00:00Z`) : null,
    period: input.period ?? undefined,
  });
}

/**
 * Carga masiva: varios archivos a la vez. Con IA, cada uno se lee y, si el tipo, el titular y la fecha se identifican
 * con confianza y coinciden con lo cargado, se valida solo; si no, queda en la bandeja con el motivo. Sin IA, todos
 * quedan en la bandeja para clasificarlos.
 */
export async function uploadDocumentsToInbox(formData: FormData) {
  const kinds = await inboxPermissions();
  if (kinds.length === 0) return { ok: false as const, error: 'No tenés permiso para subir documentos' };
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false as const, error: 'Elegí al menos un archivo' };
  if (files.length > MAX_FILES) return { ok: false as const, error: `Máximo ${MAX_FILES} archivos por carga` };
  for (const file of files) {
    const error = validateDocumentFile(file);
    if (error) return { ok: false as const, error: `${file.name}: ${error}` };
  }

  const companyId = await getActiveCompanyId();
  const userId = await getSessionUserId();
  const aiEnabled = isAiExtractionEnabled();
  const typeLists = await Promise.all(
    kinds.map(async (kind) => (await loadUploadableTypes(prisma, companyId, kind)).map((t) => ({ ...t, kind })))
  );
  const types: ExtractableType[] = typeLists.flat().map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    hasExpiry: t.explired,
    monthly: t.is_it_montlhy === true,
  }));
  const today = arToday();
  let validated = 0;
  let pending = 0;

  const failed: string[] = [];
  // En serie: cada lectura de IA tarda unos segundos y en paralelo saturaría la API y el pool de la base.
  for (const file of files) {
    const path = await saveInboxFile(companyId, file);
    if (!path) {
      failed.push(`${file.name}: no se pudo guardar el archivo`);
      continue;
    }
    try {
      let reason = aiEnabled ? null : 'Sin carga con IA configurada: completá tipo, recurso y vencimiento';
      let kind: Kind | null = null;
      let resourceId: string | null = null;
      let typeId: string | null = null;
      let validity: string | null = null;
      let period: string | null = null;
      let extracted: Record<string, unknown> | null = null;

      if (aiEnabled) {
        const ai = await extractDocumentWithAi(file, types, today);
        if (!ai.ok) {
          reason = ai.reason;
        } else {
          extracted = ai.data;
          const type = types.find((t) => t.id === ai.data.documentTypeId) ?? null;
          typeId = type?.id ?? null;
          kind = type?.kind ?? ai.data.resourceKind;
          validity = ai.data.validity && /^\d{4}-\d{2}-\d{2}$/.test(ai.data.validity) ? ai.data.validity : null;
          period = ai.data.period && /^\d{4}-(0[1-9]|1[0-2])$/.test(ai.data.period) ? ai.data.period : null;
          const identifiers =
            kind === 'Persona' ? [ai.data.cuil, ai.data.dni] : [ai.data.domain, ai.data.internalNumber];
          for (const identifier of identifiers) {
            if (resourceId || !identifier || !kind) continue;
            resourceId = (await findResourceByIdentifier(prisma, companyId, kind, identifier))?.id ?? null;
          }
          const problems = [
            !type && 'no se reconoció el tipo de documento',
            type &&
              !resourceId &&
              `no se encontró ${kind === 'Persona' ? 'la persona (CUIL/DNI)' : 'el equipo (dominio/interno)'} en la empresa`,
            type?.hasExpiry && !validity && 'no se leyó la fecha de vencimiento',
            type?.monthly && !period && 'no se leyó el período',
            validity && validity < today && `el documento ya venció el ${validity.split('-').reverse().join('/')}`,
            ai.data.confidence < AUTO_VALIDATE_CONFIDENCE &&
              `confianza baja (${Math.round(ai.data.confidence * 100)}%)`,
            ai.data.notes,
          ].filter((p): p is string => Boolean(p));

          if (problems.length === 0 && type && resourceId && kind) {
            const created = await createDocumentFromFile({
              kind,
              resourceId,
              documentTypeId: type.id,
              file,
              validity,
              period,
            });
            if (created.ok) {
              await prisma.document_inbox.create({
                data: {
                  source: 'ai',
                  file_path: path,
                  file_name: file.name,
                  status: 'validated',
                  resource_kind: kind,
                  resource_id: resourceId,
                  document_type_id: type.id,
                  validity: validity ? new Date(`${validity}T00:00:00Z`) : null,
                  period,
                  extracted: extracted as object,
                  reviewed_by: userId,
                  reviewed_at: new Date(),
                },
              });
              await recordAuditEvent(prisma, {
                companyId,
                kind,
                event: 'ai_validated',
                resourceId,
                documentTypeId: type.id,
                actorId: userId,
                actorKind: 'ai',
                detail: `${file.name}: la IA identificó tipo, titular y vencimiento y coincidieron con lo cargado`,
              });
              // El archivo ya quedó en el documento: la copia de la bandeja sobra.
              await storageRemove(INBOX_BUCKET, [path]);
              validated += 1;
              continue;
            }
            problems.push('error' in created ? created.error : 'no se pudo crear el documento');
          }
          reason = `IA: ${problems.join('; ')}`;
        }
      }

      await prisma.document_inbox.create({
        data: {
          source: 'ai',
          file_path: path,
          file_name: file.name,
          resource_kind: kind,
          resource_id: resourceId,
          document_type_id: typeId,
          validity: validity ? new Date(`${validity}T00:00:00Z`) : null,
          period,
          reason,
          extracted: (extracted ?? undefined) as object | undefined,
        },
      });
      if (aiEnabled && kind) {
        await recordAuditEvent(prisma, {
          companyId,
          kind,
          event: 'ai_pending',
          resourceId,
          documentTypeId: typeId,
          actorId: userId,
          actorKind: 'ai',
          detail: `${file.name}: ${reason ?? 'pendiente de revisión'}`,
        });
      }
      pending += 1;
    } catch (error) {
      logger.error('Error al procesar un archivo de la carga masiva', { data: { error, file: file.name } });
      failed.push(`${file.name}: no se pudo procesar`);
    }
  }

  return { ok: true as const, validated, pending, failed };
}

const validateSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['Persona', 'Equipos']),
  resourceId: z.string().uuid('Elegí el recurso'),
  documentTypeId: z.string().uuid('Elegí el tipo de documento'),
  validity: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida')
    .nullable(),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El período tiene que ser AAAA-MM, por ejemplo 2026-11')
    .nullable(),
});

/** Una persona revisó el documento de la bandeja: se sube al recurso y queda validado. */
export async function validateInboxItem(input: z.input<typeof validateSchema>) {
  const parsed = validateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const kinds = await inboxPermissions();
  if (!kinds.includes(parsed.data.kind))
    return { ok: false as const, error: 'No tenés permiso para subir esos documentos' };
  const companyId = await getActiveCompanyId();
  const item = await prisma.document_inbox.findFirst({
    where: { id: parsed.data.id, company_id: companyId, status: 'pending', ...kindScope(kinds) },
  });
  if (!item) return { ok: false as const, error: 'El documento ya fue resuelto' };

  // Reclamo atómico: un doble clic o dos personas a la vez no crean el documento dos veces.
  const claimed = await prisma.document_inbox.updateMany({
    where: { id: item.id, company_id: companyId, status: 'pending' },
    data: { status: 'validating' },
  });
  if (claimed.count !== 1) return { ok: false as const, error: 'El documento ya se está validando' };
  const release = () =>
    prisma.document_inbox.updateMany({ where: { id: item.id, status: 'validating' }, data: { status: 'pending' } });

  const blob = await storageDownload(INBOX_BUCKET, item.file_path);
  if (!blob.ok) {
    await release();
    return { ok: false as const, error: 'No se encontró el archivo' };
  }
  const file = new File([blob.data], item.file_name, { type: blob.data.type });
  const created = await createDocumentFromFile({ ...parsed.data, file });
  if (!created.ok) {
    await release();
    return { ok: false as const, error: 'error' in created ? created.error : 'No se pudo subir el documento' };
  }

  await prisma.document_inbox.updateMany({
    where: { id: item.id, company_id: companyId },
    data: {
      status: 'validated',
      resource_kind: parsed.data.kind,
      resource_id: parsed.data.resourceId,
      document_type_id: parsed.data.documentTypeId,
      validity: parsed.data.validity ? new Date(`${parsed.data.validity}T00:00:00Z`) : null,
      period: parsed.data.period,
      reviewed_by: await getSessionUserId(),
      reviewed_at: new Date(),
    },
  });
  await storageRemove(INBOX_BUCKET, [item.file_path]);
  return { ok: true as const };
}

/** Se descarta un documento de la bandeja (no correspondía, ilegible, duplicado). El archivo se borra. */
export async function discardInboxItem(id: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, error: 'Documento inválido' };
  const kinds = await inboxPermissions();
  if (kinds.length === 0) return { ok: false as const, error: 'No tenés permiso para gestionar la bandeja' };
  const companyId = await getActiveCompanyId();
  const item = await prisma.document_inbox.findFirst({
    where: { id, company_id: companyId, status: 'pending', ...kindScope(kinds) },
  });
  if (!item) return { ok: false as const, error: 'El documento ya fue resuelto' };
  const result = await prisma.document_inbox.updateMany({
    where: { id, company_id: companyId, status: 'pending' },
    data: { status: 'discarded', reviewed_by: await getSessionUserId(), reviewed_at: new Date() },
  });
  if (result.count !== 1) return { ok: false as const, error: 'El documento ya fue resuelto' };
  await storageRemove(INBOX_BUCKET, [item.file_path]);
  return { ok: true as const };
}
