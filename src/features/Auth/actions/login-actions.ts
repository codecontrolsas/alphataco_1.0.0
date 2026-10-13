'use server';

import { DEFAULT_AFTER_LOGIN_PATH, safeNextPath } from '@/features/Auth/lib/redirect';
import { auth } from '@/shared/lib/auth';
import { normalizeEmail } from '@/shared/lib/auth-credentials';
import { clearActiveCompanyCookie } from '@/shared/lib/tenant';
import { loginSchema, type LoginValues } from '@/shared/schemas/schemas';
import { APIError } from 'better-auth/api';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Login, logout y OAuth del dashboard, sobre Better Auth. Acá no hay acceso a datos.
 *
 * El claim de empresa de la sesión NO se escribe acá: lo estampa el hook
 * `session.create.before` de `shared/lib/auth.ts`, resolviéndolo contra la base. Este módulo
 * sólo entrega credenciales.
 *
 * La cookie de sesión la escribe el plugin `nextCookies()` cuando la llamada corre dentro de
 * una Server Action; por eso el login pasa por acá y no por el cliente.
 */

/** Motivo del rechazo, para que la pantalla decida cómo mostrarlo sin comparar textos. */
export type LoginErrorCode = 'invalid_credentials' | 'revoked' | 'rate_limited' | 'unknown';

export type LoginResult = { error: string; code: LoginErrorCode } | { success: true };

/** Traduce los errores de Better Auth a un mensaje y un código estable. */
function loginFailure(error: unknown): { error: string; code: LoginErrorCode } {
  if (error instanceof APIError) {
    const message = error.body?.message ?? '';
    // Los dos errores de política los lanzan los hooks de `shared/lib/auth.ts` con mensaje propio.
    if (error.status === 'FORBIDDEN' && message) return { error: message, code: 'revoked' };
    if (error.status === 'TOO_MANY_REQUESTS' && message) return { error: message, code: 'rate_limited' };
    if (error.body?.code === 'INVALID_EMAIL_OR_PASSWORD' || message.toLowerCase().includes('invalid')) {
      return { error: 'Correo o contraseña inválidos.', code: 'invalid_credentials' };
    }
    if (message) return { error: message, code: 'unknown' };
  }
  return { error: 'No se pudo iniciar sesión. Intentá de nuevo.', code: 'unknown' };
}

/** Ingreso con correo y contraseña. Valida en el servidor: el formulario del cliente es comodidad. */
export async function login(input: LoginValues): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Correo o contraseña inválidos.', code: 'invalid_credentials' };
  }

  try {
    await auth.api.signInEmail({
      body: { email: normalizeEmail(parsed.data.email), password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    return loginFailure(error);
  }

  return { success: true };
}

/**
 * Cierra la sesión y limpia la empresa activa. NO redirige: su único llamador es el menú de
 * usuario, un Client Component que navega solo. Un `redirect()` acá lanzaría `NEXT_REDIRECT`
 * dentro de un handler del cliente y quedaría como promesa rechazada sin atrapar en cada
 * logout.
 */
export async function logout(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión válida el cierre es un no-op: igual se limpia la empresa activa.
  }
  await clearActiveCompanyCookie();
  revalidatePath('/', 'layout');
}

/**
 * Arranca el OAuth de Google. Devuelve la URL del proveedor y redirige.
 *
 * `disableSignUp` está activo en el proveedor (ver `shared/lib/auth.ts`): Google no da de
 * alta, sólo deja entrar a un mail que ya tiene usuario creado por invitación.
 */
export async function googleLogin(callbackPath: string = DEFAULT_AFTER_LOGIN_PATH): Promise<{ error: string } | never> {
  let url: string | undefined;

  try {
    const result = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: safeNextPath(callbackPath), errorCallbackURL: '/login?error=oauth' },
      headers: await headers(),
    });
    url = result.url;
  } catch (error) {
    return { error: loginFailure(error).error };
  }

  if (!url) return { error: 'No se pudo iniciar sesión con Google' };
  redirect(url);
}
