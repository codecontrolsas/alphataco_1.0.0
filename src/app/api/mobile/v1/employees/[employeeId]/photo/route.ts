import {
  PHOTO_VARIANTS,
  decodePictureDataUrl,
  photoEtag,
  pictureVersion,
  renderPhotoVariant,
  verifyPhotoSignature,
} from '@/features/MobileApi/employees/photo';
import { getEmployeePicture } from '@/features/MobileApi/employees/queries.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError } from '@/features/MobileApi/lib/http';
import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { z } from 'zod';

const querySchema = z.object({
  c: z.string().uuid(),
  variant: z.enum(PHOTO_VARIANTS),
  exp: z.coerce.number().int(),
  sig: z.string().min(10).max(128),
  v: z.string().max(64).optional(),
});

/**
 * Foto de un empleado por URL prefirmada (la emiten el listado y el legajo; vence a los 15 minutos). No pide token de
 * portador: la firma ata empresa, empleado, variante y vencimiento. `ETag` + `If-None-Match` evitan reenviar bytes.
 */
export const GET = mobileRoute<{ employeeId: string }>({
  module: 'empleados',
  auth: false,
  run: async ({ req, params }) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success || !z.string().uuid().safeParse(params.employeeId).success) {
      return mobileError(422, 'INVALID_INPUT', 'URL de foto inválida.');
    }
    const { c: companyId, variant, exp, sig } = parsed.data;
    if (!verifyPhotoSignature({ companyId, employeeId: params.employeeId, variant, expires: exp, sig })) {
      return mobileError(403, 'FORBIDDEN', 'La URL de la foto venció o no es válida.');
    }
    // Sin token: la empresa sale de la firma ya verificada, así que el módulo se mira para ESA empresa.
    if (!(await isModuleEnabledForCompany('empleados', companyId))) {
      return mobileError(404, 'MODULE_DISABLED', 'Esta función no está habilitada.');
    }

    const picture = await getEmployeePicture(companyId, params.employeeId);
    const photo = decodePictureDataUrl(picture);
    if (!picture || !photo) return mobileError(404, 'NOT_FOUND', 'El empleado no tiene foto.');

    const etag = photoEtag(pictureVersion(picture), variant);
    const cacheHeaders = { 'Cache-Control': 'private, max-age=900', ETag: etag, 'X-Mobile-Api-Version': '1' };
    if (
      req.headers
        .get('if-none-match')
        ?.split(',')
        .some((tag) => tag.trim() === etag)
    ) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    const rendered = await renderPhotoVariant(photo, variant);
    return new Response(new Uint8Array(rendered.bytes), {
      status: 200,
      headers: {
        ...cacheHeaders,
        'Content-Type': rendered.contentType,
        'Content-Length': String(rendered.bytes.length),
      },
    });
  },
});
