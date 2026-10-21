import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';

const MAX = 30;

/** Vehículos activos de la empresa para asignar a una línea; busca por dominio o número interno. */
export const GET = mobileRoute({
  run: async ({ req, ctx }) => {
    if (!(await hasDailyReportPermission(ctx, 'assign_resources')) && !(await hasDailyReportPermission(ctx, 'update'))) {
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para asignar recursos.');
    }
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
    const vehicles = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.vehicles.findMany({
        where: {
          company_id: ctx.companyId,
          is_active: true,
          ...(q ? { OR: [{ domain: { contains: q, mode: 'insensitive' } }, { intern_number: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: { domain: 'asc' },
        take: MAX,
        select: { id: true, domain: true, intern_number: true },
      })
    );
    return mobileJson({ equipment: vehicles.map((v) => ({ id: v.id, kind: 'vehicle' as const, label: v.domain ?? v.intern_number ?? v.id })) });
  },
});
