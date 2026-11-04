import { equipmentListQuerySchema, equipmentListResponseSchema } from '@/features/MobileApi/contracts/equipment';
import { listEquipment } from '@/features/MobileApi/equipment/queries.server';
import { loadMobileAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { InvalidCursorError } from '@/features/MobileApi/lib/labels';

/**
 * Listado de equipos (solo lectura) de UNA clase (`kind=vehicle|other`), activos o dados de baja, con búsqueda por
 * dominio, interno, serie, marca o modelo, filtros por tipo, condición y estado documental, y paginación por cursor.
 * Cada listado exige el `view` de su subpestaña en la web (`vehicles`, `others`, `inactive`).
 */
export const GET = mobileRoute({
  module: 'equipos',
  run: async ({ req, ctx }) => {
    const parsed = equipmentListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    const full = await loadMobileAccess(ctx);
    const access = full.equipment[parsed.data.kind];
    const allowed = parsed.data.status === 'active' ? access.listActive : access.listInactive;
    if (!allowed) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver estos equipos.');
    try {
      return mobileReadJson(req, equipmentListResponseSchema, await listEquipment(ctx, parsed.data, full.equipment, full.employees));
    } catch (error) {
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      throw error;
    }
  },
});
