import { dashboardListResponseSchema } from '@/features/MobileApi/contracts/dashboards';
import { listDashboards } from '@/features/MobileApi/dashboards/queries.server';
import { loadDashboardAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';

/**
 * Tableros que el usuario ve, con la MISMA lógica de la web: predefinidos, propios y compartidos, filtrados por los
 * permisos de cada widget. Sin ningún widget visible: 403.
 */
export const GET = mobileRoute({
  module: 'nucleo',
  run: async ({ req, ctx }) => {
    const access = await loadDashboardAccess(ctx);
    if (!access.available) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los tableros.');
    return mobileReadJson(req, dashboardListResponseSchema, await listDashboards(ctx, access));
  },
});
