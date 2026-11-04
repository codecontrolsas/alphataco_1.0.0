import { dashboardDetailResponseSchema } from '@/features/MobileApi/contracts/dashboards';
import { DashboardNotFoundError, getDashboard } from '@/features/MobileApi/dashboards/queries.server';
import { loadDashboardAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { z } from 'zod';

/**
 * Datos de los widgets de un tablero (`key` = el de `/dashboards`). Cada widget se calcula por separado: si uno falla
 * llega con `error` y el resto se entrega igual. Un tablero que el usuario no ve (o que no existe) es 404.
 */
export const GET = mobileRoute<{ boardKey: string }>({
  module: 'nucleo',
  run: async ({ req, ctx, params }) => {
    if (!z.string().min(1).max(64).safeParse(params.boardKey).success)
      return mobileError(422, 'INVALID_INPUT', 'boardKey inválido.');
    const access = await loadDashboardAccess(ctx);
    if (!access.available) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los tableros.');
    try {
      return mobileReadJson(req, dashboardDetailResponseSchema, await getDashboard(ctx, params.boardKey, access));
    } catch (error) {
      if (error instanceof DashboardNotFoundError)
        return mobileError(404, 'NOT_FOUND', 'El tablero no existe o no está disponible para tu usuario.');
      throw error;
    }
  },
});
