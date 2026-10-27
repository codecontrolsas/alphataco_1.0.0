import 'server-only';

import { HSE_FILES_BUCKET } from '@/features/Hse/lib/constants';
import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';
import { cache } from 'react';

/**
 * Documentos HSE del empleado del portal (lecturas para Server Components; no son Server Actions).
 *
 * Doble cerco: cada consulta filtra por el legajo de la sesión (que sale de `getPortalSession()`, nunca del cliente) y,
 * aunque se olvidara, la RLS por empleado solo devuelve SUS aceptaciones y los documentos publicados que le aplican
 * (`hse_employee_can_read_*`, prisma/sql/hse.sql). Lo vigente es la aceptación sin archivar de la versión actual de un
 * documento publicado: lo que dejó de aplicarle o una versión vieja no aparece.
 */

const ACK_SELECT = {
  id: true,
  status: true,
  responded_at: true,
  reject_reason: true,
  created_at: true,
  document: {
    select: { id: true, title: true, description: true, current_version_id: true, type: { select: { name: true } } },
  },
  version: {
    select: {
      id: true,
      version: true,
      file_path: true,
      file_name: true,
      file_size: true,
      change_log: true,
      expires_at: true,
      published_at: true,
    },
  },
} as const;

function vigentWhere(employeeId: string) {
  return { employee_id: employeeId, archived_at: null, document: { status: 'published' as const } };
}

type AckRow = Awaited<ReturnType<typeof fetchAcks>>[number];

function fetchAcks(employeeId: string) {
  return prisma.hse_document_acknowledgements.findMany({
    where: vigentWhere(employeeId),
    select: ACK_SELECT,
    orderBy: [{ created_at: 'desc' }],
  });
}

function toItem(row: AckRow) {
  return {
    ackId: row.id,
    status: row.status,
    respondedAt: row.responded_at,
    rejectReason: row.reject_reason,
    title: row.document.title,
    description: row.document.description,
    typeName: row.document.type?.name ?? null,
    version: row.version.version,
    changeLog: row.version.change_log,
    fileName: row.version.file_name,
    fileSize: row.version.file_size,
    // @db.Date: el día tal cual.
    expiresAt: row.version.expires_at ? row.version.expires_at.toISOString().slice(0, 10) : null,
    publishedAt: row.version.published_at,
    viewUrl: buildStorageFileUrl(HSE_FILES_BUCKET, row.version.file_path),
    downloadUrl: buildStorageDownloadUrl(HSE_FILES_BUCKET, row.version.file_path),
  };
}
export type PortalHseDocument = ReturnType<typeof toItem>;

const STATUS_ORDER = { pending: 0, rejected: 1, accepted: 2 } as const;

/** Documentos vigentes del empleado: pendientes primero, después los más nuevos. Vacío si HSE está apagado. */
export const getMyHseDocuments = cache(async (employee: PortalEmployee): Promise<PortalHseDocument[]> => {
  if (!isHseEnabled()) return [];
  const rows = await fetchAcks(employee.employeeId);
  return (
    rows
      // Defensa: solo la versión vigente (la conciliación ya archiva las viejas).
      .filter((r) => r.version.id === r.document.current_version_id)
      .map(toItem)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  );
});

/** Un documento vigente del empleado, o `null` (no existe, no es suyo, ya no le aplica o HSE apagado). */
export async function getMyHseDocument(employee: PortalEmployee, ackId: string): Promise<PortalHseDocument | null> {
  if (!isHseEnabled() || !UUID_RE.test(ackId)) return null;
  const row = await prisma.hse_document_acknowledgements.findFirst({
    where: { id: ackId, ...vigentWhere(employee.employeeId) },
    select: ACK_SELECT,
  });
  if (!row || row.version.id !== row.document.current_version_id) return null;
  return toItem(row);
}
