import { searchQuerySchema, searchResponseSchema } from '@/features/MobileApi/contracts/search';
import { loadSearchAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { searchAll } from '@/features/MobileApi/search/queries.server';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';

/**
 * Búsqueda global: empleados (nombre, legajo, CUIL o DNI), equipos (dominio, interno, serie, marca o modelo), documentos
 * (tipo o propietario), capacitaciones (título), partes diarios (por fecha) y módulos de la app (por nombre). Máximo 5
 * por grupo y el `total` de cada uno; un grupo sin permiso no aparece.
 */
export const GET = mobileRoute({
  run: async ({ req, ctx }) => {
    const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return mobileError(422, 'INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Búsqueda inválida.');
    const [access, enabled] = await Promise.all([loadSearchAccess(ctx), getEnabledModulesFor(ctx.companyId)]);
    return mobileReadJson(req, searchResponseSchema, await searchAll(ctx, parsed.data.q, access, enabled));
  },
});
