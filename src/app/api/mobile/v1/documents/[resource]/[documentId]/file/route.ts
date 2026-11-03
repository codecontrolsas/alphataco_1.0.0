import { documentFileLinkResponseSchema } from '@/features/MobileApi/contracts/documents';
import { buildDocumentFileUrl, documentFileName } from '@/features/MobileApi/documents/file-url';
import { resolveVisibleDocument } from '@/features/MobileApi/documents/queries.server';
import { withDocumentParams } from '@/features/MobileApi/documents/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileJson } from '@/features/MobileApi/lib/http';

/**
 * Enlace firmado (5 minutos) para ver o descargar el archivo de un documento. Se emite con los MISMOS chequeos que la
 * ficha; la URL no lleva el path del archivo (lo resuelve la base por id). Sin caché: cada pedido es un enlace nuevo.
 */
export const GET = mobileRoute<{ resource: string; documentId: string }>({
  module: 'documentacion',
  run: async ({ ctx, params }) =>
    withDocumentParams(ctx, params, async (resource, documentId, access) => {
      const { ref, row } = await resolveVisibleDocument(ctx, resource, documentId, access);
      const link = buildDocumentFileUrl(ctx.companyId, resource, documentId);
      return mobileJson(
        documentFileLinkResponseSchema.parse({ ...link, fileName: documentFileName(row.type.name, ref.document_path ?? '') })
      );
    }),
});
