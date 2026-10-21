import { signInBodySchema } from '@/features/MobileApi/contracts/schemas';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { auth } from '@/shared/lib/auth';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { APIError } from 'better-auth/api';

/**
 * Login móvil: el contrato propio (congelado) en vez de `/api/auth/*`, que atiende el contenedor `app`. Devuelve el token
 * de portador que la app manda en `Authorization: Bearer`. Las reglas de Better Auth (límite de intentos, baneos, hooks de
 * sesión) corren igual: es la misma `auth`.
 */
export const POST = mobileRoute({
  auth: false,
  body: signInBodySchema,
  run: async ({ req, body }) => {
    try {
      const { headers, response } = await auth.api.signInEmail({ body, headers: req.headers, returnHeaders: true });
      const token = headers.get('set-auth-token');
      if (!token) return mobileError(500, 'INTERNAL_ERROR', 'No se pudo emitir el token.');
      const session = await prismaSystem.session.findFirst({ where: { token: response.token }, select: { expiresAt: true } });
      return mobileJson({
        token,
        expiresAt: session?.expiresAt.toISOString() ?? null,
        user: { id: response.user.id, name: response.user.name, email: response.user.email },
      });
    } catch (error) {
      if (error instanceof APIError) return mobileError(401, 'UNAUTHENTICATED', 'Credenciales inválidas.');
      throw error;
    }
  },
});

/** Cierra la sesión del token que se envía. */
export const DELETE = mobileRoute({
  auth: false,
  run: async ({ req }) => {
    await auth.api.signOut({ headers: req.headers });
    return mobileJson({ ok: true });
  },
});
