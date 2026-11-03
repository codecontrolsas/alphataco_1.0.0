import { documentFiltersResponseSchema } from '@/features/MobileApi/contracts/documents';
import { getDocumentFilterOptions } from '@/features/MobileApi/documents/queries.server';
import { loadDocumentAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';

/** Opciones de los filtros del listado de documentos: clases y períodos visibles, estados y tipos de documento. */
export const GET = mobileRoute({
  module: 'documentacion',
  run: async ({ req, ctx }) => {
    const [access, enabled] = await Promise.all([loadDocumentAccess(ctx), getEnabledModulesFor(ctx.companyId)]);
    const options = await getDocumentFilterOptions(ctx, access, enabled);
    if (options.resources.length === 0) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver documentos.');
    return mobileReadJson(req, documentFiltersResponseSchema, options);
  },
});
