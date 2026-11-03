import { documentResourceParamSchema } from '@/features/MobileApi/contracts/documents';
import { documentFileName, verifyDocumentFileSignature } from '@/features/MobileApi/documents/file-url';
import { findDocumentRef } from '@/features/MobileApi/documents/queries.server';
import { isResourceModuleEnabled } from '@/features/MobileApi/documents/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError } from '@/features/MobileApi/lib/http';
import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { Logger } from '@/lib/logger';
import { s3Client } from '@/shared/lib/s3';
import { DOCUMENT_FILES_BUCKET } from '@/shared/lib/storage';
import { isSafeStorageKey } from '@/shared/lib/storage-url';
import { runInTenantScope } from '@/shared/lib/tenant-context';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';

const logger = new Logger('app/api/mobile/v1/documents/file/content');

const querySchema = z.object({
  c: z.string().uuid(),
  exp: z.coerce.number().int(),
  sig: z.string().min(10).max(128),
});

/**
 * Archivo de un documento por URL prefirmada (la emite `GET .../file`; vence a los 5 minutos). Sin token de portador:
 * la firma ata empresa, clase, documento y vencimiento. El path sale de la base por id, dentro de la empresa de la
 * firma, y se vuelve a exigir que el documento no esté archivado, tenga archivo y que los módulos sigan encendidos.
 * Stream, no buffer (los documentos no tienen tope de tamaño).
 */
export const GET = mobileRoute<{ resource: string; documentId: string }>({
  module: 'documentacion',
  auth: false,
  run: async ({ req, params }) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    const resource = documentResourceParamSchema.safeParse(params.resource);
    if (!parsed.success || !resource.success || !z.string().uuid().safeParse(params.documentId).success) {
      return mobileError(422, 'INVALID_INPUT', 'URL de archivo inválida.');
    }
    const { c: companyId, exp, sig } = parsed.data;
    if (
      !verifyDocumentFileSignature({
        companyId,
        resource: resource.data,
        documentId: params.documentId,
        expires: exp,
        sig,
      })
    ) {
      return mobileError(403, 'FORBIDDEN', 'El enlace del archivo venció o no es válido.');
    }
    // Sin token: la empresa sale de la firma ya verificada, así que los módulos se miran para ESA empresa.
    if (
      !(await isModuleEnabledForCompany('documentacion', companyId)) ||
      !(await isResourceModuleEnabled(companyId, resource.data))
    ) {
      return mobileError(404, 'MODULE_DISABLED', 'Esta función no está habilitada.');
    }

    const ref = await runInTenantScope({ companyId, userId: null, kind: 'api' }, () =>
      findDocumentRef(companyId, resource.data, params.documentId)
    );
    const path = ref?.document_path ?? null;
    if (!ref || !path || !isSafeStorageKey(path)) return mobileError(404, 'NOT_FOUND', 'El archivo no existe.');

    try {
      const object = await s3Client().send(new GetObjectCommand({ Bucket: DOCUMENT_FILES_BUCKET, Key: path }));
      if (!object.Body) return mobileError(404, 'NOT_FOUND', 'El archivo no existe.');
      const name = documentFileName(ref.document_types?.name ?? 'documento', path);
      const headers = new Headers({
        'Content-Type': object.ContentType ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"`,
        'X-Mobile-Api-Version': '1',
      });
      if (object.ContentLength !== undefined) headers.set('Content-Length', String(object.ContentLength));
      return new Response(object.Body.transformToWebStream(), { status: 200, headers });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name !== 'NoSuchKey' && name !== 'NotFound') {
        logger.error('Error al leer el archivo del documento', { data: { error, documentId: params.documentId } });
      }
      return mobileError(404, 'NOT_FOUND', 'El archivo no existe.');
    }
  },
});
