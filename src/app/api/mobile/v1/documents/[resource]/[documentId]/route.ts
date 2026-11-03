import { documentDetailResponseSchema } from '@/features/MobileApi/contracts/documents';
import { getDocumentDetail } from '@/features/MobileApi/documents/queries.server';
import { withDocumentParams } from '@/features/MobileApi/documents/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileReadJson } from '@/features/MobileApi/lib/http';

/**
 * Ficha de un documento real (`resource` = employee | equipment | company): recurso (con el legajo si es un empleado),
 * tipo, fechas, estado y si tiene archivo. El archivo se pide aparte con `GET .../file`.
 */
export const GET = mobileRoute<{ resource: string; documentId: string }>({
  module: 'documentacion',
  run: async ({ req, ctx, params }) =>
    withDocumentParams(ctx, params, async (resource, documentId, access) =>
      mobileReadJson(req, documentDetailResponseSchema, await getDocumentDetail(ctx, resource, documentId, access))
    ),
});
