import 'server-only';

import { daysUntil } from '@/features/Documentacion/shared/compliance/dates';
import { HSE_TARGET_KIND_LABELS, HSE_TRAINING_KIND_LABELS, type HseAssignmentStatus } from '@/features/Hse/lib/constants';
import { HSE_RECORD_MODALITY_LABELS, HSE_RECORD_STATUS_LABELS } from '@/features/Hse/lib/pdf-content';
import { effectiveAssignmentStatus } from '@/features/Hse/lib/training-status';
import { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext, type TenantContext, type TenantTx } from '@/shared/lib/tenant-context';
import moment from 'moment';
import { z } from 'zod';
import type { TrainingListQuery, TrainingPeopleQuery } from '../contracts/trainings';
import { argentinaDateTime, decodeCursor, encodeCursor, isoDay, type Tone } from '../lib/labels';
import type { TrainingAccess } from './access';
import { trainingStatusOf } from './status';

/**
 * Consultas de Capacitaciones (HSE) para la API móvil, solo lectura. Corren con el contexto de la petición (RLS por
 * empresa) y filtran por `company_id` explícito. Cobertura, vencidas y «por vencer» se cuentan en la base, una consulta
 * agrupada por pedido, nunca por capacitación (sin N+1). Solo se listan capacitaciones PUBLICADAS: los borradores y las
 * retiradas son de administración.
 *
 * Criterio de cobertura (el del detalle web): «aprobados» = aprobada y con la vigencia al día; una aprobación vencida NO
 * cuenta como aprobada (la lista web la cuenta como aprobada; acá se sigue al detalle para que ambas pantallas coincidan).
 */

export class TrainingNotFoundError extends Error {}

const EXPIRING_DAYS = 30;

// ─── Cobertura ────────────────────────────────────────────────────────────────

interface CoverageRow {
  trainingId: string;
  applies: number;
  approved: number;
  expired: number;
  expiring: number;
  pending: number;
}

interface Coverage {
  approved: number;
  applies: number;
  expired: number;
  expiring: number;
  pending: number;
}

const EMPTY_COVERAGE: Coverage = { approved: 0, applies: 0, expired: 0, expiring: 0, pending: 0 };

/**
 * Asignaciones vigentes (sin archivar) agrupadas por capacitación, con los conteos por situación efectiva. `today` es el
 * día argentino. Con `trainingIds` acota a esas capacitaciones; si no, toda la empresa.
 */
async function loadCoverage(
  tx: TenantTx,
  companyId: string,
  today: string,
  trainingIds?: string[]
): Promise<Map<string, Coverage>> {
  const rows = await tx.$queryRaw<CoverageRow[]>(Prisma.sql`
    SELECT a.training_id::text AS "trainingId",
      count(*)::int AS applies,
      (count(*) FILTER (WHERE a.status = 'passed' AND (a.valid_until IS NULL OR a.valid_until >= ${today}::date)))::int AS approved,
      (count(*) FILTER (WHERE a.status = 'passed' AND a.valid_until < ${today}::date))::int AS expired,
      (count(*) FILTER (WHERE a.status = 'passed' AND a.valid_until >= ${today}::date
                          AND a.valid_until <= ${today}::date + ${EXPIRING_DAYS}::int))::int AS expiring,
      (count(*) FILTER (WHERE a.status <> 'passed'))::int AS pending
    FROM hse_training_assignments a
    WHERE a.company_id = ${companyId}::uuid
      AND a.archived_at IS NULL
      ${trainingIds ? Prisma.sql`AND a.training_id = ANY(${trainingIds}::uuid[])` : Prisma.empty}
    GROUP BY a.training_id`);
  return new Map(
    rows.map((row) => [
      row.trainingId,
      {
        approved: row.approved,
        applies: row.applies,
        expired: row.expired,
        expiring: row.expiring,
        pending: row.pending,
      },
    ])
  );
}

/** Estado agregado: lo peor manda (vencida > pendiente > por vencer > al día); sin asignaciones, `none`. */
const AGGREGATE_STATUS = {
  expired: { code: 'expired', label: 'Con aprobaciones vencidas', tone: 'danger' as Tone },
  pending: { code: 'pending', label: 'Con pendientes', tone: 'warn' as Tone },
  expiring: { code: 'expiring', label: 'Con aprobaciones por vencer', tone: 'warn' as Tone },
  valid: { code: 'valid', label: 'Al día', tone: 'ok' as Tone },
  none: { code: 'none', label: 'Sin asignaciones', tone: 'neutral' as Tone },
};
const AGGREGATE_RANK = { expired: 0, pending: 1, expiring: 2, valid: 3, none: 4 } as const;
type AggregateCode = keyof typeof AGGREGATE_RANK;

function aggregateStatusOf(coverage: Coverage): (typeof AGGREGATE_STATUS)[AggregateCode] {
  if (coverage.applies === 0) return AGGREGATE_STATUS.none;
  if (coverage.expired > 0) return AGGREGATE_STATUS.expired;
  if (coverage.pending > 0) return AGGREGATE_STATUS.pending;
  if (coverage.expiring > 0) return AGGREGATE_STATUS.expiring;
  return AGGREGATE_STATUS.valid;
}

const kindOf = (code: string) => ({
  code,
  label: (HSE_TRAINING_KIND_LABELS as Record<string, string>)[code] ?? code,
});

// ─── Listado ──────────────────────────────────────────────────────────────────

const listCursorSchema = z.object({ r: z.number().int(), t: z.string(), id: z.string().uuid() });
type ListCursor = z.infer<typeof listCursorSchema>;

const collator = new Intl.Collator('es');
const compareKeys = (a: ListCursor, b: ListCursor) =>
  a.r - b.r || collator.compare(a.t, b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Mismo criterio de «aplica a» que la web: destinatario «Todo el personal» o el sector / puesto pedido. */
function appliesToFilter(query: TrainingListQuery): Prisma.hse_trainingsWhereInput[] {
  const and: Prisma.hse_trainingsWhereInput[] = [];
  if (query.sectorId) {
    and.push({ targets: { some: { OR: [{ kind: 'all' }, { sector_id: query.sectorId }] } } });
  }
  if (query.positionId) {
    and.push({ targets: { some: { OR: [{ kind: 'all' }, { position_id: query.positionId }] } } });
  }
  return and;
}

export async function listTrainings(ctx: TenantContext, query: TrainingListQuery, access: TrainingAccess) {
  const cursor = decodeCursor(query.cursor, listCursorSchema);
  const today = argentinaDate();
  const { companyId } = ctx;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const search = query.q?.trim();
    const trainings = await tx.hse_trainings.findMany({
      where: {
        company_id: companyId,
        status: 'published',
        ...(search
          ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }
          : {}),
        AND: appliesToFilter(query),
      },
      select: { id: true, title: true, kind: true, validity_months: true },
    });
    const ids = trainings.map((training) => training.id);
    const [coverageById, sessionRows] = await Promise.all([
      ids.length > 0 ? loadCoverage(tx, companyId, today, ids) : Promise.resolve(new Map<string, Coverage>()),
      access.sessions && ids.length > 0
        ? tx.hse_training_records.findMany({
            where: { company_id: companyId, training_id: { in: ids }, status: { not: 'voided' }, held_on: { gte: new Date(`${today}T00:00:00.000Z`) } },
            orderBy: [{ held_on: 'asc' }, { number: 'asc' }],
            select: { training_id: true, held_on: true, location: true },
          })
        : Promise.resolve([]),
    ]);
    const nextSessionById = new Map<string, { date: string; location: string | null }>();
    for (const row of sessionRows) {
      if (!nextSessionById.has(row.training_id)) {
        nextSessionById.set(row.training_id, { date: moment.utc(row.held_on).format('YYYY-MM-DD'), location: row.location });
      }
    }

    const all = trainings.map((training) => {
      const coverage = coverageById.get(training.id) ?? EMPTY_COVERAGE;
      const status = aggregateStatusOf(coverage);
      return {
        id: training.id,
        title: training.title,
        kind: kindOf(training.kind),
        validityMonths: training.validity_months,
        coverage,
        status,
        rank: AGGREGATE_RANK[status.code as AggregateCode],
        ...(access.sessions ? { nextSession: nextSessionById.get(training.id) ?? null } : {}),
      };
    });

    const filtered = (query.status ? all.filter((item) => item.status.code === query.status) : all).sort((a, b) =>
      compareKeys({ r: a.rank, t: a.title, id: a.id }, { r: b.rank, t: b.title, id: b.id })
    );
    const afterCursor = cursor
      ? filtered.filter((item) => compareKeys({ r: item.rank, t: item.title, id: item.id }, cursor) > 0)
      : filtered;
    const page = afterCursor.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      afterCursor.length > query.limit && last ? encodeCursor({ r: last.rank, t: last.title, id: last.id }) : null;

    // Totales sobre lo que cumple q / sector / puesto (sin `status`), solo en la primera página.
    let totals: { coverage: number | null; expired: number; expiring: number } | null = null;
    if (!cursor) {
      const sum = all.reduce(
        (acc, item) => ({
          approved: acc.approved + item.coverage.approved,
          applies: acc.applies + item.coverage.applies,
          expired: acc.expired + item.coverage.expired,
          expiring: acc.expiring + item.coverage.expiring,
        }),
        { approved: 0, applies: 0, expired: 0, expiring: 0 }
      );
      totals = {
        coverage: sum.applies > 0 ? Math.round((sum.approved / sum.applies) * 1000) / 10 : null,
        expired: sum.expired,
        expiring: sum.expiring,
      };
    }

    return {
      items: page.map(({ rank: _rank, ...item }) => item),
      nextCursor,
      total: cursor ? null : filtered.length,
      totals,
    };
  });
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

type MediaType = 'video' | 'pdf' | 'image' | 'document' | 'link' | 'other';

/**
 * La base solo distingue `file` y `link`: el tipo de medio se deduce de la extensión del archivo o del sitio del enlace
 * (YouTube / Vimeo = video). Es una pista de presentación, no un dato guardado.
 */
export function mediaTypeOf(kind: 'file' | 'link', fileName: string | null, url: string | null): MediaType {
  if (kind === 'link') return /(youtube\.com|youtu\.be|vimeo\.com)/i.test(url ?? '') ? 'video' : 'link';
  const extension = /\.([a-z0-9]+)$/i.exec(fileName ?? '')?.[1]?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(extension)) return 'video';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) return 'image';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv'].includes(extension)) return 'document';
  return 'other';
}

const SESSIONS_LIMIT = 20;

const RECORD_STATUS_TONE: Record<string, Tone> = { draft: 'neutral', closed: 'ok', voided: 'danger' };

export async function getTrainingDetail(ctx: TenantContext, trainingId: string, access: TrainingAccess) {
  const today = argentinaDate();
  const { companyId } = ctx;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    // El examen se lee SOLO como conteos y puntos: ni el enunciado ni las opciones ni la clave de respuestas viajan.
    const training = await tx.hse_trainings.findFirst({
      where: { id: trainingId, company_id: companyId, status: 'published' },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        passing_score: true,
        max_attempts: true,
        time_limit_minutes: true,
        shuffle_questions: true,
        validity_months: true,
        published_at: true,
        targets: {
          orderBy: { created_at: 'asc' },
          select: {
            kind: true,
            position: { select: { name: true } },
            sector: { select: { name: true } },
            employee: { select: { file: true, lastname: true, firstname: true } },
          },
        },
        materials: {
          orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            kind: true,
            title: true,
            url: true,
            file_name: true,
            file_size: true,
            is_required: true,
            _count: { select: { reads: true } },
          },
        },
        questions: { select: { points: true } },
      },
    });
    if (!training) throw new TrainingNotFoundError();

    const [coverageById, attempts, passedAttempts, certificates, records] = await Promise.all([
      loadCoverage(tx, companyId, today, [trainingId]),
      tx.hse_training_attempts.groupBy({
        by: ['attempt_number'],
        where: { training_id: trainingId, company_id: companyId, status: 'submitted' },
        _count: { _all: true },
        _avg: { score_percent: true },
        orderBy: { attempt_number: 'asc' },
      }),
      tx.hse_training_attempts.groupBy({
        by: ['attempt_number'],
        where: { training_id: trainingId, company_id: companyId, status: 'submitted', passed: true },
        _count: { _all: true },
      }),
      tx.hse_training_certificates.aggregate({
        where: { training_id: trainingId, company_id: companyId, voided_at: null },
        _count: { _all: true },
        _max: { signed_at: true },
      }),
      access.sessions
        ? tx.hse_training_records.findMany({
            where: { training_id: trainingId, company_id: companyId },
            orderBy: { number: 'desc' },
            take: SESSIONS_LIMIT,
            select: {
              id: true,
              number: true,
              held_on: true,
              modality: true,
              location: true,
              duration_minutes: true,
              status: true,
              pdf_path: true,
              instructors: { orderBy: [{ position: 'asc' }, { full_name: 'asc' }], select: { full_name: true, kind: true } },
              attendees: { select: { attended: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    const coverage = coverageById.get(trainingId) ?? EMPTY_COVERAGE;
    const passedByAttempt = new Map(passedAttempts.map((row) => [row.attempt_number, row._count._all]));

    return {
      id: training.id,
      title: training.title,
      description: training.description,
      kind: kindOf(training.kind),
      status: aggregateStatusOf(coverage),
      publishedAt: training.published_at ? argentinaDateTime(training.published_at) : null,
      summary: {
        passingScore: training.passing_score,
        maxAttempts: training.max_attempts,
        timeLimitMinutes: training.time_limit_minutes,
        shuffleQuestions: training.shuffle_questions,
        validityMonths: training.validity_months,
      },
      audience: training.targets.map((target) => ({
        kind: target.kind,
        label:
          target.kind === 'all'
            ? HSE_TARGET_KIND_LABELS.all
            : target.kind === 'position'
              ? target.position?.name ?? HSE_TARGET_KIND_LABELS.position
              : target.kind === 'sector'
                ? target.sector?.name ?? HSE_TARGET_KIND_LABELS.sector
                : target.employee
                  ? `[${target.employee.file}] ${target.employee.lastname} ${target.employee.firstname}`
                  : HSE_TARGET_KIND_LABELS.employee,
      })),
      coverage,
      ...(records
        ? {
            sessions: records.map((record) => {
              const date = moment.utc(record.held_on).format('YYYY-MM-DD');
              return {
                id: record.id,
                number: record.number,
                date,
                status: {
                  code: record.status,
                  label: HSE_RECORD_STATUS_LABELS[record.status],
                  tone: RECORD_STATUS_TONE[record.status] ?? 'neutral',
                },
                modality: { code: record.modality, label: HSE_RECORD_MODALITY_LABELS[record.modality] },
                location: record.location,
                durationMinutes: record.duration_minutes,
                instructors: record.instructors.map((instructor) => ({ name: instructor.full_name, kind: instructor.kind })),
                attendance: {
                  present: record.attendees.filter((attendee) => attendee.attended).length,
                  registered: record.attendees.length,
                },
                hasMinutes: record.pdf_path !== null,
                upcoming: record.status !== 'voided' && date >= today,
              };
            }),
          }
        : {}),
      content: {
        required: training.materials.filter((material) => material.is_required).length,
        materials: training.materials.map((material) => ({
          id: material.id,
          title: material.title,
          kind: material.kind,
          mediaType: mediaTypeOf(material.kind, material.file_name, material.url),
          fileName: material.file_name,
          fileSize: material.file_size,
          // Solo los enlaces externos viajan con su URL (la web los muestra tal cual); los archivos, solo metadatos.
          url: material.kind === 'link' ? material.url : null,
          required: material.is_required,
          viewedBy: material._count.reads,
        })),
      },
      exam: {
        questions: training.questions.length,
        totalPoints: training.questions.reduce((sum, question) => sum + question.points, 0),
        results: attempts.map((row) => ({
          attempt: row.attempt_number,
          submitted: row._count._all,
          passed: passedByAttempt.get(row.attempt_number) ?? 0,
          averageScore: row._avg.score_percent === null ? null : Math.round(row._avg.score_percent.toNumber() * 100) / 100,
        })),
      },
      certificate:
        certificates._count._all > 0
          ? {
              issued: certificates._count._all,
              lastIssuedAt: certificates._max.signed_at ? argentinaDateTime(certificates._max.signed_at) : null,
            }
          : null,
    };
  });
}

// ─── Personas ─────────────────────────────────────────────────────────────────

const peopleCursorSchema = z.object({
  r: z.number().int(),
  l: z.string(),
  f: z.string(),
  id: z.string().uuid(),
});

/** Orden de las personas: lo que pide acción primero (vencida, sin aprobar, por vencer, al día). */
const PEOPLE_RANK = { expired: 0, pending: 1, expiring: 2, valid: 3 } as const;

interface PersonRow {
  id: string;
  status: HseAssignmentStatus;
  attemptsUsed: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  score: number | null;
  passedAt: Date | null;
  validUntil: Date | null;
  employeeId: string;
  file: string;
  firstname: string;
  lastname: string;
  isActive: boolean | null;
  position: string | null;
  rank: number;
}

export async function listTrainingPeople(
  ctx: TenantContext,
  trainingId: string,
  query: TrainingPeopleQuery
) {
  const cursor = decodeCursor(query.cursor, peopleCursorSchema);
  const today = argentinaDate();
  const { companyId } = ctx;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const exists = await tx.hse_trainings.findFirst({
      where: { id: trainingId, company_id: companyId, status: 'published' },
      select: { id: true },
    });
    if (!exists) throw new TrainingNotFoundError();

    const search = query.q?.trim();
    const like = search ? `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const inner = Prisma.sql`
      SELECT a.id::text AS id, a.status::text AS status, a.attempts_used AS "attemptsUsed", t.max_attempts AS "maxAttempts",
        a.last_attempt_at AS "lastAttemptAt", a.last_score_percent::float8 AS score, a.passed_at AS "passedAt",
        a.valid_until AS "validUntil", e.id::text AS "employeeId", e.file AS file, e.firstname AS firstname,
        e.lastname AS lastname, e.is_active AS "isActive", cp.name AS position,
        CASE WHEN a.status = 'passed' AND a.valid_until < ${today}::date THEN 0
             WHEN a.status <> 'passed' THEN 1
             WHEN a.valid_until IS NOT NULL AND a.valid_until <= ${today}::date + ${EXPIRING_DAYS}::int THEN 2
             ELSE 3 END AS rank
      FROM hse_training_assignments a
      JOIN hse_trainings t ON t.id = a.training_id
      JOIN employees e ON e.id = a.employee_id
      LEFT JOIN company_positions cp ON cp.id = e.company_position
      WHERE a.company_id = ${companyId}::uuid AND a.training_id = ${trainingId}::uuid AND a.archived_at IS NULL
        ${like ? Prisma.sql`AND (e.file ILIKE ${like} OR e.lastname ILIKE ${like} OR e.firstname ILIKE ${like} OR (e.lastname || ' ' || e.firstname) ILIKE ${like})` : Prisma.empty}`;
    const rankFilter = query.status ? Prisma.sql`WHERE r.rank = ${PEOPLE_RANK[query.status]}::int` : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      tx.$queryRaw<PersonRow[]>(Prisma.sql`
        SELECT r.* FROM (${inner}) r
        ${rankFilter}
        ${
          cursor
            ? Prisma.sql`${query.status ? Prisma.sql`AND` : Prisma.sql`WHERE`}
                (r.rank, r.lastname, r.firstname, r.id) > (${cursor.r}::int, ${cursor.l}, ${cursor.f}, ${cursor.id})`
            : Prisma.empty
        }
        ORDER BY r.rank, r.lastname, r.firstname, r.id
        LIMIT ${query.limit + 1}`),
      cursor
        ? Promise.resolve(null)
        : tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM (${inner}) r ${rankFilter}`),
    ]);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor({ r: last.rank, l: last.lastname, f: last.firstname, id: last.id })
        : null;

    return {
      items: page.map((row) => {
        const validUntil = isoDay(row.validUntil);
        const result = effectiveAssignmentStatus(row.status as Exclude<HseAssignmentStatus, 'expired'>, validUntil, today);
        return {
          id: row.id,
          employee: {
            id: row.employeeId,
            fileNumber: row.file,
            fullName: `${row.lastname} ${row.firstname}`.trim(),
            position: row.position,
            isActive: row.isActive !== false,
          },
          status: trainingStatusOf(result, validUntil, today),
          result,
          attempts: { used: row.attemptsUsed, max: row.maxAttempts },
          score: row.score,
          lastAttemptAt: row.lastAttemptAt ? argentinaDateTime(row.lastAttemptAt) : null,
          approvedAt: row.passedAt ? argentinaDate(row.passedAt) : null,
          expiresAt: validUntil,
          daysLeft: validUntil && row.status === 'passed' ? daysUntil(validUntil, today) : null,
        };
      }),
      nextCursor,
      total: countRows ? (countRows[0]?.total ?? 0) : null,
    };
  });
}
