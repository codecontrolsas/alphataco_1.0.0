import 'server-only';

import { JOB_SCHEDULE } from '@/features/Jobs/lib/schedule';
import { JOB_NAMES } from '@/features/Jobs/lib/types';
import { Logger } from '@/lib/logger';
import { readCompanyLimitStatus } from '@/shared/lib/instance-settings';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { listMigrationsOnDisk } from './migrations-on-disk.server';
import { getModulesStateSummary } from './modules.server';

const logger = new Logger('features/AdminApi/status');

const HOUR_MS = 3_600_000;

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

interface ModuleRow {
  slug: string | null;
  name: string;
  is_active: boolean | null;
  tabs_total: number;
  tabs_active: number;
  tabs_inactive_slugs: string[];
}

interface CompanyCountRow {
  companies_active: number;
  companies_inactive: number;
}

interface UserCountRow {
  users_active: number;
  users_banned: number;
}

interface JobRow {
  job: string;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_ok_at: Date | null;
  last_error_at: Date | null;
  errors_24h: number;
  last_status: string | null;
}

const toIso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/**
 * Estado interno de la instancia para la sala de control de TaskApp. Solo agregados: sin nombres de
 * empresas ni de usuarios, sin emails y sin `jobs_runs.error`/`metadata`/`company_id`.
 *
 * Corre con `prismaSystem` (BYPASSRLS): los conteos abarcan todas las empresas a la vez.
 */
export async function getInstanceStatus() {
  const latencyStart = performance.now();
  await prismaSystem.$queryRaw`SELECT 1`;
  const latencyMs = Math.round(performance.now() - latencyStart);

  const [migrationRows, onDisk, moduleRows, companyRows, userRows, sessionRows, jobRows, companyLimit, modulesState] =
    await Promise.all([
      prismaSystem.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations ORDER BY started_at`,
      listMigrationsOnDisk(),
      prismaSystem.$queryRaw<ModuleRow[]>`
      SELECT m.slug, m.name, m.is_active,
             count(t.id)::int AS tabs_total,
             count(t.id) FILTER (WHERE t.is_active)::int AS tabs_active,
             coalesce(array_agg(t.slug) FILTER (WHERE t.id IS NOT NULL AND t.is_active IS DISTINCT FROM true), '{}') AS tabs_inactive_slugs
      FROM modules m LEFT JOIN tabs t ON t.module_id = m.id
      GROUP BY m.id ORDER BY m.order_index, m.slug`,
      prismaSystem.$queryRaw<CompanyCountRow[]>`
      SELECT count(*) FILTER (WHERE is_active)::int AS companies_active,
             count(*) FILTER (WHERE NOT is_active)::int AS companies_inactive
      FROM company`,
      prismaSystem.$queryRaw<UserCountRow[]>`
      SELECT count(*) FILTER (WHERE NOT banned AND NOT is_anonymous)::int AS users_active,
             count(*) FILTER (WHERE banned)::int AS users_banned
      FROM auth_user`,
      prismaSystem.$queryRaw<{ users_seen_30d: number }[]>`
      SELECT count(DISTINCT user_id)::int AS users_seen_30d
      FROM auth_session WHERE updated_at > NOW() - interval '30 days'`,
      prismaSystem.$queryRaw<JobRow[]>`
      SELECT job,
             max(started_at)                                         AS last_started_at,
             max(finished_at)                                        AS last_finished_at,
             max(finished_at) FILTER (WHERE status = 'ok')           AS last_ok_at,
             max(finished_at) FILTER (WHERE status = 'error')        AS last_error_at,
             count(*) FILTER (WHERE status = 'error' AND started_at > NOW() - interval '24 hours')::int AS errors_24h,
             (array_agg(status ORDER BY started_at DESC))[1]::text   AS last_status
      FROM jobs_runs
      WHERE started_at > NOW() - interval '30 days'
      GROUP BY job`,
      readCompanyLimitStatus(prismaSystem),
      // Control de módulos (F3): si la base todavía no tiene la migración, `null` (no rompe el estado).
      getModulesStateSummary().catch((error: unknown) => {
        logger.warn('No se pudo leer el estado de los módulos', { data: { error } });
        return null;
      }),
    ]);

  // Migraciones: aplicadas / fallidas según _prisma_migrations; pendientes = carpetas en disco sin aplicar.
  const appliedRows = migrationRows.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
  const failedNames = migrationRows
    .filter((row) => row.finished_at === null && row.rolled_back_at === null)
    .map((row) => row.migration_name);
  const appliedNames = new Set(appliedRows.map((row) => row.migration_name));
  const pendingNames = onDisk.filter((name) => !appliedNames.has(name));
  const lastApplied = appliedRows.reduce<MigrationRow | null>(
    (latest, row) => (!latest || (row.finished_at as Date) > (latest.finished_at as Date) ? row : latest),
    null
  );

  // Jobs: los de JOB_NAMES sin filas también aparecen; solo cuentan como atrasados si el proceso lleva
  // más de maxAgeHours arriba (una instancia recién creada no queda en rojo).
  const nowMs = Date.now();
  const uptimeMs = process.uptime() * 1000;
  const rowsByJob = new Map(jobRows.map((row) => [row.job, row]));
  const jobs = JOB_NAMES.map((job) => {
    const row = rowsByJob.get(job);
    const { cron, maxAgeHours } = JOB_SCHEDULE[job];
    const maxAgeMs = maxAgeHours * HOUR_MS;
    const overdue = row?.last_started_at ? nowMs - row.last_started_at.getTime() > maxAgeMs : uptimeMs > maxAgeMs;
    return {
      job,
      schedule: cron,
      max_age_hours: maxAgeHours,
      last_started_at: toIso(row?.last_started_at),
      last_finished_at: toIso(row?.last_finished_at),
      last_status: row?.last_status ?? null,
      last_ok_at: toIso(row?.last_ok_at),
      last_error_at: toIso(row?.last_error_at),
      errors_24h: row?.errors_24h ?? 0,
      overdue,
    };
  });

  logger.debug('Estado de la instancia armado', { data: { latencyMs, pending: pendingNames.length } });

  return {
    schema: 1 as const,
    generated_at: new Date(nowMs).toISOString(),
    version: {
      sha: process.env.GIT_SHA || null,
      node: process.version,
      process_started_at: new Date(nowMs - uptimeMs).toISOString(),
    },
    database: { latency_ms: latencyMs },
    migrations: {
      applied: appliedRows.length,
      on_disk: onDisk.length,
      pending: pendingNames.length,
      failed: failedNames.length,
      last: lastApplied ? { name: lastApplied.migration_name, finished_at: toIso(lastApplied.finished_at) } : null,
      pending_names: pendingNames,
      failed_names: failedNames,
    },
    // Bandera de catálogo (`modules.is_active`): se conserva para el panel F2. El encendido real es `modules_state`.
    modules: moduleRows.map((row) => ({
      slug: row.slug,
      name: row.name,
      is_active: row.is_active,
      tabs_total: row.tabs_total,
      tabs_active: row.tabs_active,
      tabs_inactive_slugs: row.tabs_inactive_slugs,
    })),
    // Control de módulos (F3): claves encendidas y apagadas en la instancia, empresas con apagados propios y la versión
    // del estado. El detalle por empresa está en GET /api/admin/v1/modules.
    modules_state: modulesState,
    counts: {
      companies_active: companyRows[0]?.companies_active ?? 0,
      companies_inactive: companyRows[0]?.companies_inactive ?? 0,
      users_active: userRows[0]?.users_active ?? 0,
      users_banned: userRows[0]?.users_banned ?? 0,
      users_seen_30d: sessionRows[0]?.users_seen_30d ?? 0,
    },
    jobs,
    // Límite de empresas de la instancia (ticket 807, `instance_settings.max_companies`) y cuántas hay hoy.
    limits: {
      max_companies: companyLimit.max,
      companies_total: companyLimit.count,
      companies_limit_reached: companyLimit.reached,
    },
  };
}
