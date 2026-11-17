import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { storageUpload } from '@/shared/lib/storage';
import { randomUUID } from 'node:crypto';

/**
 * Piezas comunes de la bandeja de entrada de documentos (carga externa y carga con IA): guardar el archivo, encontrar
 * el recurso por su identificador y anotar la auditoría. Reciben el cliente de base: la carga externa no tiene sesión y
 * usa el de sistema (con la empresa SIEMPRE explícita); la interna usa el contextual.
 */

export const INBOX_BUCKET = 'compliance-files';

type Db = Pick<Prisma.TransactionClient, 'employees' | 'vehicles' | 'document_types' | 'document_audit_events'>;

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80);

/** Sube el archivo a `<empresa>/inbox/<uuid>-<nombre>`. `null` si falla. */
export async function saveInboxFile(companyId: string, file: File): Promise<string | null> {
  const path = `${companyId}/inbox/${randomUUID()}-${safeName(file.name)}`;
  const result = await storageUpload(INBOX_BUCKET, path, file);
  return result.ok ? path : null;
}

const digits = (value: string) => value.replace(/\D+/g, '');
const plate = (value: string) => value.replace(/[\s.-]+/g, '').toUpperCase();

/**
 * Persona por CUIL o DNI, o equipo por dominio, número interno o serie. Solo recursos activos de la empresa. Devuelve el
 * id si hay exactamente uno.
 */
export async function findResourceByIdentifier(
  db: Db,
  companyId: string,
  kind: 'Persona' | 'Equipos',
  identifier: string
): Promise<{ id: string; label: string } | null> {
  const raw = identifier.trim();
  if (!raw) return null;
  if (kind === 'Persona') {
    const number = digits(raw);
    if (number.length < 7) return null;
    const rows = await db.employees.findMany({
      where: {
        company_id: companyId,
        is_active: { not: false },
        OR: [{ cuil: number }, { document_number: number }, { cuil: raw }, { document_number: raw }],
      },
      select: { id: true, file: true, lastname: true, firstname: true },
      take: 2,
    });
    return rows.length === 1
      ? { id: rows[0].id, label: `[${rows[0].file}] ${rows[0].lastname} ${rows[0].firstname}` }
      : null;
  }
  const value = plate(raw);
  const rows = await db.vehicles.findMany({
    where: {
      company_id: companyId,
      is_active: { not: false },
      OR: [
        { domain: { equals: value, mode: 'insensitive' } },
        { intern_number: { equals: raw, mode: 'insensitive' } },
        { serie: { equals: raw, mode: 'insensitive' } },
      ],
    },
    select: { id: true, domain: true, intern_number: true },
    take: 2,
  });
  return rows.length === 1
    ? { id: rows[0].id, label: [rows[0].intern_number, rows[0].domain].filter(Boolean).join(' - ') }
    : null;
}

/** Tipos de documento activos de la empresa para un tipo de recurso (lo que se puede cargar). */
export async function loadUploadableTypes(db: Db, companyId: string, kind: 'Persona' | 'Equipos') {
  return db.document_types.findMany({
    where: { company_id: companyId, applies: kind, is_active: true, down_document: { not: true } },
    select: { id: true, name: true, explired: true, is_it_montlhy: true, private: true },
    orderBy: { name: 'asc' },
  });
}

export async function recordAuditEvent(
  db: Db,
  event: {
    companyId: string;
    kind: 'Persona' | 'Equipos';
    event: 'external_upload' | 'ai_validated' | 'ai_pending';
    resourceId: string | null;
    documentTypeId: string | null;
    actorId: string | null;
    actorKind: 'external' | 'ai' | 'user';
    detail?: string | null;
  }
) {
  await db.document_audit_events.create({
    data: {
      company_id: event.companyId,
      resource_kind: event.kind,
      resource_id: event.resourceId,
      document_type_id: event.documentTypeId,
      event: event.event,
      actor_id: event.actorId,
      actor_kind: event.actorKind,
      detail: event.detail ?? null,
    },
  });
}
