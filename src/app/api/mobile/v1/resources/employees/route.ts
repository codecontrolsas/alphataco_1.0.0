import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';

const MAX = 30;

/** Empleados activos de la empresa para asignar a una línea; busca por legajo, apellido o nombre. */
export const GET = mobileRoute({
  run: async ({ req, ctx }) => {
    if (!(await hasDailyReportPermission(ctx, 'assign_resources')) && !(await hasDailyReportPermission(ctx, 'update'))) {
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para asignar recursos.');
    }
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
    const employees = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.employees.findMany({
        where: {
          company_id: ctx.companyId,
          is_active: true,
          ...(q ? { OR: [{ file: { contains: q, mode: 'insensitive' } }, { lastname: { contains: q, mode: 'insensitive' } }, { firstname: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        take: MAX,
        select: { id: true, file: true, firstname: true, lastname: true },
      })
    );
    return mobileJson({ employees: employees.map((e) => ({ id: e.id, file: e.file, name: `${e.lastname} ${e.firstname}` })) });
  },
});
