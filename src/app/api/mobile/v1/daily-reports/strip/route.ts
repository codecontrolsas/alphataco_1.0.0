import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';
import moment from 'moment';
import { z } from 'zod';

const RADIUS_MAX = 31;

const querySchema = z.object({
  /** Día central (`YYYY-MM-DD`); por defecto, hoy en hora argentina. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  before: z.coerce.number().int().min(0).max(RADIUS_MAX).default(14),
  after: z.coerce.number().int().min(0).max(RADIUS_MAX).default(14),
});

const stripResponseSchema = z.object({
  today: z.string(),
  from: z.string(),
  to: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      /** `noReport`: no hay parte; `withNews`: hay líneas pendientes o sin recursos; `complete`: hay parte y nada pendiente. */
      state: z.enum(['complete', 'withNews', 'noReport']),
      reportId: z.string().uuid().nullable(),
      /** Estado del encabezado del parte (abierto, cerrado...); null sin parte. */
      reportStatus: z.string().nullable(),
      rowCount: z.number().int(),
      pendingCount: z.number().int(),
      unassignedCount: z.number().int(),
    })
  ),
});

type StripRow = {
  day: string;
  report_id: string | null;
  status: string | null;
  total: number;
  pending: number;
  unassigned: number;
};

/**
 * Tira de días: el estado de los partes de un rango alrededor de una fecha (por defecto ±14 días), en una sola consulta.
 * El criterio es el de la web para «partes que requieren atención» (`getDailyReportAttentionCounts`): un parte con
 * líneas `pendiente` o `sin_recursos_asignados`. Mismo permiso que ver los partes diarios.
 */
export const GET = mobileRoute({
  module: 'operaciones',
  run: async ({ req, ctx }) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success || (parsed.data.date && !moment.utc(parsed.data.date, 'YYYY-MM-DD', true).isValid())) {
      return mobileError(422, 'INVALID_INPUT', 'Parámetros inválidos: date (AAAA-MM-DD), before y after (0 a 31).');
    }
    if (!(await hasDailyReportPermission(ctx, 'view')))
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los partes diarios.');

    const today = argentinaDate();
    const center = moment.utc(parsed.data.date ?? today, 'YYYY-MM-DD');
    const from = center.clone().subtract(parsed.data.before, 'days').format('YYYY-MM-DD');
    const to = center.clone().add(parsed.data.after, 'days').format('YYYY-MM-DD');

    const rows = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.$queryRaw<StripRow[]>`
        SELECT to_char(g.d, 'YYYY-MM-DD') AS day,
               r.id::text AS report_id,
               r.status::text AS status,
               COALESCE(c.total, 0)::int AS total,
               COALESCE(c.pending, 0)::int AS pending,
               COALESCE(c.unassigned, 0)::int AS unassigned
        FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS g(d)
        LEFT JOIN dailyreport r ON r.date = g.d::date AND r.company_id = ${ctx.companyId}::uuid
        LEFT JOIN LATERAL (
          SELECT count(*) AS total,
                 count(*) FILTER (WHERE status = 'pendiente') AS pending,
                 count(*) FILTER (WHERE status = 'sin_recursos_asignados') AS unassigned
          FROM dailyreportrows WHERE daily_report_id = r.id
        ) c ON r.id IS NOT NULL
        ORDER BY g.d`
    );

    return mobileReadJson(req, stripResponseSchema, {
      today,
      from,
      to,
      days: rows.map((row) => ({
        date: row.day,
        state: !row.report_id ? ('noReport' as const) : row.pending + row.unassigned > 0 ? ('withNews' as const) : ('complete' as const),
        reportId: row.report_id,
        reportStatus: row.status,
        rowCount: row.total,
        pendingCount: row.pending,
        unassignedCount: row.unassigned,
      })),
    });
  },
});
