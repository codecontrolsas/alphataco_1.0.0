'use server';

import { validateDocumentFile } from '@/features/Documentacion/shared/lib/document-file-rules';
import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { Logger } from '@/lib/logger';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { storageRemove } from '@/shared/lib/storage';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  findResourceByIdentifier,
  INBOX_BUCKET,
  loadUploadableTypes,
  recordAuditEvent,
  saveInboxFile,
} from '../lib/inbox.server';

const logger = new Logger('features/Documentacion/CumplimientoClientes/external-upload');

/** Tope de archivos por link y por día: un link filtrado no puede llenar el storage. */
const MAX_UPLOADS_PER_DAY = 300;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Link vigente por su token, SIN sesión: se busca con el cliente de sistema por el hash, y todo lo que sigue va acotado
 * a la empresa del link.
 */
async function resolveLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const link = await prismaSystem.external_upload_links.findUnique({
    where: { token_hash: hashToken(token) },
    select: {
      id: true,
      company_id: true,
      label: true,
      scope: true,
      expires_at: true,
      revoked_at: true,
    },
  });
  if (!link || link.revoked_at || link.expires_at.getTime() < Date.now()) return null;
  // Con Documentación apagada para la empresa, el link no existe.
  if (!(await isModuleEnabledForCompany('documentacion', link.company_id))) return null;
  return link;
}

/** Lo que necesita la página pública: empresa, para quién es el link y los tipos que se pueden cargar. */
export async function getExternalUploadContext(token: string) {
  const link = await resolveLink(token);
  if (!link) return null;
  const company = await prismaSystem.company.findUnique({
    where: { id: link.company_id },
    select: { company_name: true },
  });
  const kinds = link.scope === 'Ambos' ? (['Persona', 'Equipos'] as const) : [link.scope as 'Persona' | 'Equipos'];
  const types = await Promise.all(
    kinds.map(async (kind) => ({
      kind,
      types: (await loadUploadableTypes(prismaSystem, link.company_id, kind))
        .filter((t) => !t.private)
        .map((t) => ({ id: t.id, name: t.name, hasExpiry: t.explired, monthly: t.is_it_montlhy === true })),
    }))
  );
  return {
    companyName: company?.company_name ?? 'la empresa',
    label: link.label,
    expiresAt: link.expires_at.toISOString(),
    kinds: types,
  };
}

export type ExternalUploadContext = NonNullable<Awaited<ReturnType<typeof getExternalUploadContext>>>;

const submitSchema = z.object({
  token: z.string(),
  uploaderName: z.string().trim().min(3, 'Indicá tu nombre o el de tu estudio').max(120),
  kind: z.enum(['Persona', 'Equipos']),
  identifier: z.string().trim().min(3, 'Indicá el CUIL/DNI o el dominio').max(40),
  documentTypeId: z.string().uuid('Elegí el tipo de documento'),
  validity: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .or(z.literal('')),
});

/**
 * Recibe un documento por el link externo. No crea el documento: lo deja en la bandeja de entrada de la empresa para
 * que alguien lo valide (el tercero no es usuario y no puede dar por bueno un papel). Si no encuentra el recurso por
 * su identificador, igual lo guarda con el motivo a la vista.
 */
export async function submitExternalDocument(formData: FormData) {
  const parsed = submitSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string'))
  );
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const data = parsed.data;
  const link = await resolveLink(data.token);
  if (!link) return { ok: false as const, error: 'El link venció o fue revocado. Pedile uno nuevo a la empresa.' };
  if (link.scope !== 'Ambos' && link.scope !== data.kind)
    return { ok: false as const, error: 'Este link no admite ese tipo de documento' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: 'Elegí el archivo' };
  const fileError = validateDocumentFile(file);
  if (fileError) return { ok: false as const, error: fileError };

  const companyId = link.company_id;
  const since = new Date(Date.now() - 86_400_000);
  const recent = await prismaSystem.document_inbox.count({ where: { link_id: link.id, created_at: { gte: since } } });
  if (recent >= MAX_UPLOADS_PER_DAY)
    return { ok: false as const, error: 'Se alcanzó el máximo de cargas del día para este link' };

  const types = await loadUploadableTypes(prismaSystem, companyId, data.kind);
  const type = types.find((t) => t.id === data.documentTypeId && !t.private);
  if (!type) return { ok: false as const, error: 'Tipo de documento no válido' };
  if (type.explired && !data.validity)
    return { ok: false as const, error: 'Este documento vence: indicá la fecha de vencimiento' };
  if (type.is_it_montlhy && !data.period)
    return { ok: false as const, error: 'Este documento es mensual: indicá el período' };

  const resource = await findResourceByIdentifier(prismaSystem, companyId, data.kind, data.identifier);
  const path = await saveInboxFile(companyId, file);
  if (!path) return { ok: false as const, error: 'No se pudo guardar el archivo. Intentá de nuevo.' };

  try {
    await prismaSystem.$transaction(async (tx) => {
      await tx.document_inbox.create({
        data: {
          company_id: companyId,
          source: 'external',
          link_id: link.id,
          file_path: path,
          file_name: file.name,
          resource_kind: data.kind,
          resource_id: resource?.id ?? null,
          document_type_id: type.id,
          validity: data.validity ? new Date(`${data.validity}T00:00:00Z`) : null,
          period: data.period || null,
          uploader_name: data.uploaderName,
          reason: resource
            ? `Carga externa de ${data.uploaderName} (${link.label}): revisar y validar`
            : `Carga externa de ${data.uploaderName} (${link.label}): no se encontró ${
                data.kind === 'Persona' ? 'la persona con CUIL/DNI' : 'el equipo con dominio/interno'
              } «${data.identifier}»`,
          extracted: { identifier: data.identifier },
        },
      });
      await tx.external_upload_links.update({
        where: { id: link.id },
        data: { uploads_count: { increment: 1 }, last_used_at: new Date() },
      });
      await recordAuditEvent(tx, {
        companyId,
        kind: data.kind,
        event: 'external_upload',
        resourceId: resource?.id ?? null,
        documentTypeId: type.id,
        actorId: null,
        actorKind: 'external',
        detail: `${data.uploaderName} (${link.label}) subió ${file.name}: queda en la bandeja para validar`,
      });
    });
    // Mismo mensaje haya o no coincidencia: quien tiene el link no puede usarlo para averiguar qué CUIL o dominios
    // tiene la empresa. El motivo de la no coincidencia lo ve solo el personal, en la bandeja.
    return { ok: true as const };
  } catch (error) {
    await storageRemove(INBOX_BUCKET, [path]);
    logger.error('Error al recibir un documento externo', { data: { error, linkId: link.id } });
    return { ok: false as const, error: 'No se pudo recibir el documento. Intentá de nuevo.' };
  }
}
