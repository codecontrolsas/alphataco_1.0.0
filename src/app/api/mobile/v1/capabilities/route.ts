import { MOBILE_API_VERSION, mobileModulesFor } from '@/features/MobileApi/lib/config';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileJson } from '@/features/MobileApi/lib/http';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';

/**
 * Versión de la API, del servidor y módulos habilitados. Sin autenticación: la app lo consulta antes de iniciar sesión,
 * así que solo puede informar lo que decide la INSTANCIA; lo que apaga una empresa viaja en `/me`.
 */
export const GET = mobileRoute({
  auth: false,
  run: async () =>
    mobileJson({
      apiVersion: MOBILE_API_VERSION,
      serverSha: process.env.GIT_SHA || null,
      modules: mobileModulesFor(await getEnabledModulesFor(null)),
    }),
});
