import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { prismaBase } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { runWithTenantContext } from '@/shared/lib/tenant-context';

const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

/** Usuario, empresa activa y los permisos de las pantallas móviles, todo evaluado por el servidor. */
export const GET = mobileRoute({
  run: async ({ ctx }) => {
    const [user, result] = await Promise.all([
      prismaSystem.user.findUnique({ where: { id: ctx.userId! }, select: { id: true, name: true, email: true } }),
      runWithTenantContext(prismaBase, ctx, async (tx) => {
        const company = await tx.company.findUnique({ where: { id: ctx.companyId }, select: { id: true, company_name: true } });
        const perms = await tx.$queryRaw<{ view: boolean; update: boolean; delete: boolean; assign_resources: boolean }[]>`
          SELECT
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'view') AS view,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'update') AS update,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'delete') AS delete,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'assign_resources') AS assign_resources`;
        return { company, perms: perms[0] };
      }),
    ]);
    if (!user || !result.company) return mobileError(404, 'NOT_FOUND', 'Usuario o empresa inexistente.');
    return mobileJson({
      user,
      company: { id: result.company.id, name: result.company.company_name },
      permissions: { [MODULE]: { [TAB]: result.perms } },
    });
  },
});
