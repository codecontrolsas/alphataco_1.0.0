import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { toReportDateString } from '@/features/Operaciones/PartesDiarios/detail/lib/report-date';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';

const ISO_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Partes diarios de una fecha (por defecto, hoy en hora argentina) con la cantidad de líneas. */
export const GET = mobileRoute({
  module: 'operaciones',
  run: async ({ req, ctx }) => {
    if (!(await hasDailyReportPermission(ctx, 'view')))
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los partes diarios.');
    const requested = new URL(req.url).searchParams.get('date');
    const day = requested ?? argentinaDate();
    if (!ISO_DAY.safeParse(day).success) return mobileError(422, 'INVALID_INPUT', 'date debe ser AAAA-MM-DD.');

    const reports = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.dailyreport.findMany({
        where: { company_id: ctx.companyId, date: new Date(`${day}T00:00:00.000Z`) },
        select: { id: true, date: true, status: true, _count: { select: { dailyreportrows: true } } },
      })
    );
    return mobileJson({
      date: day,
      reports: reports.map((report) => ({
        id: report.id,
        date: toReportDateString(report.date),
        status: report.status,
        rowCount: report._count.dailyreportrows,
      })),
    });
  },
});
