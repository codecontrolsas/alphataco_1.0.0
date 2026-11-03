import { equipmentFiltersResponseSchema } from '@/features/MobileApi/contracts/equipment';
import { getEquipmentFilterOptions } from '@/features/MobileApi/equipment/queries.server';
import { loadEquipmentAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';

/** Opciones de los filtros del listado de equipos: solo las clases y estados que el usuario puede listar. */
export const GET = mobileRoute({
  module: 'equipos',
  run: async ({ req, ctx }) => {
    const access = await loadEquipmentAccess(ctx);
    const options = await getEquipmentFilterOptions(ctx, access);
    if (options.kinds.length === 0) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los equipos.');
    return mobileReadJson(req, equipmentFiltersResponseSchema, options);
  },
});
