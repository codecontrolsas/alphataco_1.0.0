import {
  documentGroupedListResponseSchema,
  documentListQuerySchema,
  documentListResponseSchema,
} from '@/features/MobileApi/contracts/documents';
import { DocumentQueryError, listDocuments, listDocumentsByExpiry } from '@/features/MobileApi/documents/queries.server';
import { loadDocumentAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { InvalidCursorError } from '@/features/MobileApi/lib/labels';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';

/**
 * Listado de documentos (solo lectura) de empleados, equipos y empresa, con el estado del motor de cumplimiento de la
 * web: filtros por clase de recurso, período, tipo de documento y estado (vigente, por vencer, vencido, faltante,
 * rechazado), búsqueda y paginación por cursor. Lo que pide acción va primero.
 */
export const GET = mobileRoute({
  module: 'documentacion',
  run: async ({ req, ctx }) => {
    const parsed = documentListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    const [access, enabled] = await Promise.all([loadDocumentAccess(ctx), getEnabledModulesFor(ctx.companyId)]);
    try {
      if (parsed.data.group === 'expiry') {
        return mobileReadJson(
          req,
          documentGroupedListResponseSchema,
          await listDocumentsByExpiry(ctx, parsed.data, access, enabled)
        );
      }
      return mobileReadJson(req, documentListResponseSchema, await listDocuments(ctx, parsed.data, access, enabled));
    } catch (error) {
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      if (error instanceof DocumentQueryError)
        return error.status === 403
          ? mobileError(403, 'FORBIDDEN', error.message)
          : mobileError(422, 'INVALID_INPUT', error.message);
      throw error;
    }
  },
});
