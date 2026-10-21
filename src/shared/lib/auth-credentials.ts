import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { auth } from '@/shared/lib/auth';
import { prismaBase as prisma } from '@/shared/lib/prisma';
import { hashPassword } from 'better-auth/crypto';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Escritura de credenciales de Better Auth DENTRO de una transacción de Prisma.
 *
 * Existe por una razón concreta: con Supabase Auth el usuario vivía en otro sistema, así que el
 * alta era "crear la credencial → crear el perfil", y si lo segundo fallaba había que borrar lo
 * primero a mano. Cuando ese borrado también fallaba quedaba una CREDENCIAL HUÉRFANA: alguien
 * que podía loguearse, con empresa asignada y sin perfil. Se logueaba como CRÍTICO y no había
 * reconciliación.
 *
 * Con Better Auth el usuario vive en la MISMA base que el perfil, así que el alta entera entra
 * en una transacción y el problema desaparece por construcción: o quedan las dos cosas o no
 * queda ninguna. Para eso hay que poder escribir `auth_user` + `auth_account` con el `tx` de
 * Prisma, cosa que `auth.api.signUpEmail()` no permite (usa su propio cliente).
 *
 * El hash es el MISMO que usa la librería (`hashPassword` de `better-auth/crypto`, scrypt): no
 * se reimplementa nada de criptografía. Que ese acoplamiento siga siendo cierto lo verifica
 * `auth-credentials.integration.test.ts`, que crea un usuario por acá y después lo loguea con
 * `auth.api.signInEmail()` contra el Postgres del compose.
 */

/** Cliente mínimo que necesitan estos helpers: sirve tanto `prisma` como un `tx`. */
export type CredentialTx = Pick<Prisma.TransactionClient, 'user' | 'account'>;

/** Better Auth normaliza el mail a minúsculas al buscar al usuario: acá se guarda igual. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateCredentialInput {
  email: string;
  name: string;
  /** Sin contraseña = invitación: el usuario la define con el enlace del mail. */
  password?: string | undefined;
  needsPasswordChange?: boolean;
}

/**
 * Crea el usuario de Better Auth (y su cuenta de contraseña, si la hay) dentro de `tx`.
 * Devuelve el id, que es el `credential_id` del perfil.
 */
export async function createCredential(tx: CredentialTx, input: CreateCredentialInput): Promise<string> {
  const userId = randomUUID();
  const now = new Date();

  await tx.user.create({
    data: {
      id: userId,
      name: input.name,
      email: normalizeEmail(input.email),
      // El alta es por invitación de un admin de la empresa: el mail ya está validado por quien
      // invita, y exigir verificación dejaría al invitado sin poder entrar.
      emailVerified: true,
      needsPasswordChange: input.needsPasswordChange ?? false,
      createdAt: now,
      updatedAt: now,
    },
  });

  if (input.password?.trim()) {
    await tx.account.create({
      data: {
        id: randomUUID(),
        userId,
        // Para el proveedor `credential` Better Auth guarda el propio id de usuario como
        // `accountId` (ver sign-up.mjs).
        accountId: userId,
        providerId: 'credential',
        password: await hashPassword(input.password),
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return userId;
}

/**
 * Cambia la contraseña del usuario `userId` y baja la marca de "contraseña temporal".
 *
 * Lo usa el cartel de cambio obligatorio (`changePassword`), que corre sobre la sesión del
 * propio usuario: el perímetro es la sesión, acá no se vuelve a chequear nada. La
 * recuperación por mail NO pasa por acá, va por `auth.api.resetPassword()` con su token.
 *
 * Invalida las demás sesiones del usuario: cambiar la contraseña tiene que cerrar las sesiones
 * abiertas en otros dispositivos.
 */
export async function setCredentialPassword(userId: string, password: string, keepSessionToken?: string): Promise<void> {
  const hash = await hashPassword(password);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({
      where: { userId, providerId: 'credential' },
      select: { id: true },
    });

    if (existing) {
      await tx.account.update({ where: { id: existing.id }, data: { password: hash, updatedAt: now } });
    } else {
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId,
          accountId: userId,
          providerId: 'credential',
          password: hash,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await tx.user.update({ where: { id: userId }, data: { needsPasswordChange: false, updatedAt: now } });
    await tx.session.deleteMany({
      where: { userId, ...(keepSessionToken ? { NOT: { token: keepSessionToken } } : {}) },
    });
  });
}

/** Vigencia del enlace de invitación: la misma que `resetPasswordTokenExpiresIn`. */
const INVITATION_TOKEN_TTL_SECONDS = 60 * 60 * 24;

/**
 * Enlace para que un usuario recién invitado defina su primera contraseña.
 *
 * Emite el MISMO tipo de token que `requestPasswordReset` (una fila de `auth_verification` con
 * `identifier = 'reset-password:<token>'` y el id del usuario como valor) y devuelve la misma
 * URL de canje, así que lo consume el endpoint nativo `resetPassword` sin nada especial. Se
 * emite a mano en vez de llamar a `requestPasswordReset` por una sola razón: ese endpoint
 * dispara el mail de RECUPERACIÓN, y a un invitado hay que mandarle el de INVITACIÓN.
 *
 * Va dentro de la transacción del alta: si el alta se revierte, el token no queda emitido.
 */
export async function createPasswordSetupLink(
  tx: Pick<Prisma.TransactionClient, 'verification'>,
  userId: string,
  callbackPath = '/reset_password/update-user'
): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const now = new Date();

  await tx.verification.create({
    data: {
      id: randomUUID(),
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(now.getTime() + INVITATION_TOKEN_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    },
  });

  const baseURL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${baseURL}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callbackPath)}`;
}

/**
 * Deshace un login que autenticó pero no habilitó nada.
 *
 * Los logins de panel (indumentaria, taller) validan la contraseña primero y recién después
 * chequean que el usuario sea operario; cuando no lo es, la sesión recién abierta tiene que
 * desaparecer. Hacen falta las dos mitades:
 *
 * - `auth.api.signOut()` borra la COOKIE de la respuesta. Corre con los headers del REQUEST,
 *   que todavía no traen la cookie recién creada, así que no encuentra la sesión en la base.
 * - Por eso además se borra la FILA por su token, que es el que devolvió el login. Sin esto
 *   quedaba una sesión viva en `auth_session` hasta su vencimiento, sin dueño.
 */
export async function rejectLogin(token: string, requestHeaders: Headers): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
  await auth.api.signOut({ headers: requestHeaders }).catch(() => undefined);
}
