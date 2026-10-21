import { MOBILE_API_VERSION, MOBILE_MODULES } from '@/features/MobileApi/lib/config';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileJson } from '@/features/MobileApi/lib/http';

/** Versión de la API, del servidor y módulos habilitados. Sin autenticación: la app lo consulta antes de iniciar sesión. */
export const GET = mobileRoute({
  auth: false,
  run: async () =>
    mobileJson({ apiVersion: MOBILE_API_VERSION, serverSha: process.env.GIT_SHA || null, modules: MOBILE_MODULES }),
});
