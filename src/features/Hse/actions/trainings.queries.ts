import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { HSE_FILES_BUCKET, HSE_TARGET_KIND_LABELS, type HseTargetKind } from '../lib/constants';
import { isHseEnabled } from '../lib/feature-gate';
import type { HseTargetInput } from '../schemas/documents';

/**
 * Lecturas del detalle de una capacitación para el dashboard (Server Components; no son Server Actions). Exigen el
 * permiso de la pestaña y filtran por la empresa de la sesión; la RLS repite los dos controles. La clave de respuestas
 * se lee acá (con permiso) para el editor de preguntas; NUNCA en el portal.
 */

const logger = new Logger('features/Hse/trainings-queries');

export const getHseTrainingDetail = cache(async (trainingId: string) => {
  if (!isHseEnabled() || !UUID_RE.test(trainingId)) return null;
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  try {
    const [training, groups] = await Promise.all([
      prisma.hse_trainings.findFirst({
        where: { id: trainingId, company_id: companyId },
        select: {
          id: true,
          title: true,
          description: true,
          kind: true,
          status: true,
          passing_score: true,
          max_attempts: true,
          time_limit_minutes: true,
          shuffle_questions: true,
          validity_months: true,
          published_at: true,
          archived_at: true,
          created_at: true,
          updated_at: true,
          targets: {
            orderBy: { created_at: 'asc' },
            select: {
              kind: true,
              position: { select: { id: true, name: true } },
              sector: { select: { id: true, name: true } },
              employee: { select: { id: true, file: true, lastname: true, firstname: true } },
            },
          },
          materials: {
            orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
            select: {
              id: true,
              kind: true,
              title: true,
              url: true,
              file_path: true,
              file_name: true,
              file_size: true,
              is_required: true,
              _count: { select: { reads: true } },
            },
          },
          questions: {
            orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
            select: {
              id: true,
              prompt: true,
              points: true,
              options: { orderBy: { position: 'asc' }, select: { id: true, label: true } },
              answer_key: { select: { option_id: true } },
            },
          },
        },
      }),
      prisma.hse_training_assignments.groupBy({
        by: ['status'],
        where: { training_id: trainingId, company_id: companyId, archived_at: null },
        _count: true,
      }),
    ]);
    if (!training) return null;

    // Vencidas: aprobadas cuya vigencia ya pasó (no es un estado guardado).
    const expired = await prisma.hse_training_assignments.count({
      where: {
        training_id: trainingId,
        company_id: companyId,
        archived_at: null,
        status: 'passed',
        valid_until: { lt: new Date(`${argentinaDate()}T00:00:00.000Z`) },
      },
    });
    const summary = { pending: 0, in_progress: 0, passed: 0, failed: 0, expired };
    for (const g of groups) summary[g.status] = g._count;
    summary.passed -= expired;

    const targets = training.targets.map((t) => ({
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
    const totalPoints = training.questions.reduce((sum, q) => sum + q.points, 0);

    return {
      id: training.id,
      title: training.title,
      description: training.description,
      kind: training.kind,
      status: training.status,
      passingScore: training.passing_score,
      maxAttempts: training.max_attempts,
      timeLimitMinutes: training.time_limit_minutes,
      shuffleQuestions: training.shuffle_questions,
      validityMonths: training.validity_months,
      publishedAt: training.published_at,
      archivedAt: training.archived_at,
      updatedAt: training.updated_at,
      targets,
      materials: training.materials.map((m) => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        url: m.url,
        fileName: m.file_name,
        fileSize: m.file_size,
        isRequired: m.is_required,
        reads: m._count.reads,
        viewUrl: m.file_path ? buildStorageFileUrl(HSE_FILES_BUCKET, m.file_path) : m.url,
        downloadUrl: m.file_path ? buildStorageDownloadUrl(HSE_FILES_BUCKET, m.file_path) : null,
      })),
      questions: training.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        options: q.options,
        correctOptionId: q.answer_key?.option_id ?? null,
      })),
      totalPoints,
      summary,
      /** Valores iniciales del formulario de edición (estado real de ESTA capacitación). */
      formValues: {
        title: training.title,
        description: training.description ?? '',
        kind: training.kind,
        passingScore: training.passing_score,
        maxAttempts: training.max_attempts,
        timeLimitMinutes: training.time_limit_minutes ? String(training.time_limit_minutes) : '',
        shuffleQuestions: training.shuffle_questions,
        validityMonths: training.validity_months ? String(training.validity_months) : '',
        targets: targets.map(
          (t): HseTargetInput => (t.kind === 'all' ? { kind: 'all' } : { kind: t.kind, refId: t.refId ?? '' })
        ),
      },
    };
  } catch (error) {
    logger.error('Error al obtener el detalle de la capacitación', { data: { error, trainingId } });
    throw new Error('No se pudo obtener la capacitación');
  }
});
export type HseTrainingDetail = NonNullable<Awaited<ReturnType<typeof getHseTrainingDetail>>>;
