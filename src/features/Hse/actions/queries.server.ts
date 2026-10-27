import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { HSE_FILES_BUCKET, HSE_TARGET_KIND_LABELS, type HseTargetKind } from '../lib/constants';
import { isHseEnabled } from '../lib/feature-gate';
import type { HseTargetInput } from '../schemas/documents';

/**
 * Lecturas del dashboard HSE para Server Components (no son Server Actions). Todas exigen el permiso de la pestaña y
 * filtran por la empresa de la sesión; la RLS repite los dos controles en la base.
 */

const logger = new Logger('features/Hse/queries');

/** Opciones del formulario de documento: tipos, puestos, sectores y empleados activos (con legajo). */
export async function getHseDocumentFormOptions() {
  const companyId = await getActiveCompanyId();
  const [types, positions, sectors, employees] = await Promise.all([
    prisma.hse_document_types.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.company_positions.findMany({
      where: { company_id: companyId, OR: [{ is_active: true }, { is_active: null }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.hierarchy.findMany({
      where: { company_id: companyId, OR: [{ is_active: true }, { is_active: null }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employees.findMany({
      where: { company_id: companyId, OR: [{ is_active: true }, { is_active: null }] },
      select: { id: true, file: true, lastname: true, firstname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    }),
  ]);
  return {
    types,
    positions: positions.map((p) => ({ id: p.id, name: p.name ?? 'Sin nombre' })),
    sectors,
    // Selector: el legajo va combinado en la etiqueta (regla del legajo).
    employees: employees.map((e) => ({ id: e.id, name: `[${e.file}] ${e.lastname} ${e.firstname}`.trim() })),
  };
}
export type HseDocumentFormOptions = Awaited<ReturnType<typeof getHseDocumentFormOptions>>;

/** Detalle de un documento: datos, versiones, destinatarios y cumplimiento de la versión vigente. */
export const getHseDocumentDetail = cache(async (documentId: string) => {
  if (!isHseEnabled() || !UUID_RE.test(documentId)) return null;
  if (!(await checkPermissionServer('hse', 'documentos-hse', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  try {
    const [document, canSeeCompliance] = await Promise.all([
      prisma.hse_documents.findFirst({
        where: { id: documentId, company_id: companyId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          created_at: true,
          updated_at: true,
          archived_at: true,
          current_version_id: true,
          type: { select: { id: true, name: true } },
          versions: {
            orderBy: { version: 'desc' },
            select: {
              id: true,
              version: true,
              file_path: true,
              file_name: true,
              file_size: true,
              file_sha256: true,
              change_log: true,
              expires_at: true,
              published_at: true,
            },
          },
          targets: {
            orderBy: { created_at: 'asc' },
            select: {
              kind: true,
              position: { select: { id: true, name: true } },
              sector: { select: { id: true, name: true } },
              employee: { select: { id: true, file: true, lastname: true, firstname: true } },
            },
          },
        },
      }),
      checkPermissionServer('hse', 'cumplimiento', 'view'),
    ]);
    if (!document) return null;

    const counts = { pending: 0, accepted: 0, rejected: 0 };
    if (canSeeCompliance && document.current_version_id) {
      const groups = await prisma.hse_document_acknowledgements.groupBy({
        by: ['status'],
        where: { document_id: documentId, version_id: document.current_version_id, archived_at: null },
        _count: true,
      });
      for (const g of groups) counts[g.status] = g._count;
    }

    const targets = document.targets.map((t) => ({
      kind: t.kind as HseTargetKind,
      refId: t.position?.id ?? t.sector?.id ?? t.employee?.id ?? null,
      label:
        t.kind === 'all'
          ? HSE_TARGET_KIND_LABELS.all
          : t.kind === 'position'
            ? t.position?.name ?? 'Puesto'
            : t.kind === 'sector'
              ? t.sector?.name ?? 'Sector'
              : t.employee
                ? `[${t.employee.file}] ${t.employee.lastname} ${t.employee.firstname}`
                : 'Empleado',
    }));
    const draftVersion = document.versions.find((v) => v.published_at === null) ?? null;
    const currentVersion = document.versions.find((v) => v.id === document.current_version_id) ?? null;
    const editingVersion = currentVersion ?? draftVersion;

    return {
      id: document.id,
      title: document.title,
      description: document.description,
      status: document.status,
      type: document.type,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      archivedAt: document.archived_at,
      currentVersionId: document.current_version_id,
      versions: document.versions.map((v) => ({
        id: v.id,
        version: v.version,
        fileName: v.file_name,
        fileSize: v.file_size,
        sha256: v.file_sha256,
        changeLog: v.change_log,
        expiresAt: v.expires_at ? v.expires_at.toISOString().slice(0, 10) : null,
        publishedAt: v.published_at,
        isCurrent: v.id === document.current_version_id,
        viewUrl: buildStorageFileUrl(HSE_FILES_BUCKET, v.file_path),
        downloadUrl: buildStorageDownloadUrl(HSE_FILES_BUCKET, v.file_path),
      })),
      targets,
      compliance: canSeeCompliance ? counts : null,
      /** Valores iniciales del formulario de edición (estado real de ESTE documento). */
      formValues: {
        title: document.title,
        description: document.description ?? '',
        typeId: document.type?.id ?? '',
        expiresAt: editingVersion?.expires_at ? editingVersion.expires_at.toISOString().slice(0, 10) : '',
        targets: targets.map(
          (t): HseTargetInput => (t.kind === 'all' ? { kind: 'all' } : { kind: t.kind, refId: t.refId ?? '' })
        ),
      },
    };
  } catch (error) {
    logger.error('Error al obtener el detalle del documento HSE', { data: { error, documentId } });
    throw new Error('No se pudo obtener el documento');
  }
});
export type HseDocumentDetail = NonNullable<Awaited<ReturnType<typeof getHseDocumentDetail>>>;

/** Tipos de documento de la empresa con la cantidad de documentos que los usan (configuración). */
export async function getHseDocumentTypes() {
  const companyId = await getActiveCompanyId();
  const rows = await prisma.hse_document_types.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true, description: true, is_active: true, _count: { select: { documents: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
    documents: r._count.documents,
  }));
}
export type HseDocumentTypeRow = Awaited<ReturnType<typeof getHseDocumentTypes>>[number];
