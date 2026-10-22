'use server';

import type { Prisma } from '@/generated/prisma/client';
import { buildFullname, registerUserSchema, type RegisterUserInput } from '@/features/Auth/schemas/register-user';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { COMPANY_USERS_INVALIDATION } from '@/shared/constants/cache-invalidation-map';
import { withActor } from '@/shared/lib/actor';
import { createCredential, createPasswordSetupLink, normalizeEmail } from '@/shared/lib/auth-credentials';
import { sendInvitationEmail } from '@/shared/lib/mail/templates/auth';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';

/**
 * Alta de usuario de la empresa activa (tab Empresa → Usuarios).
 *
 * Dos caminos: si el email ya tiene `profile`, se lo agrega a la empresa activa; si no, se crea
 * la credencial, el perfil, la pertenencia y el rol.
 *
 * Perímetro sin RLS (esto es un endpoint público):
 * - La empresa sale SIEMPRE de `getActiveCompanyId()`; el caller no manda `companyId` ni se lee
 *   la cookie `actualComp` a mano.
 * - Exige `empresa.usuarios-empleados.create`, el mismo permiso que ya guardaba el botón en la UI.
 *
 * ── Qué cambió con P4 ──────────────────────────────────────────────────────────────────
 *
 * 1. **Se acabó la credencial huérfana.** Con Supabase Auth el usuario vivía en otro sistema:
 *    se creaba primero la credencial y después el perfil, y si lo segundo fallaba había que
 *    borrar lo primero. Cuando ese borrado también fallaba quedaba alguien que podía loguearse,
 *    con empresa asignada y sin perfil — se logueaba como CRÍTICO y nadie lo reconciliaba.
 *    Ahora la credencial vive en la misma base, así que el alta entera (usuario + cuenta de
 *    contraseña + token de invitación + perfil + pertenencia + rol) es UNA transacción.
 * 2. **Ya no se escribe ningún claim acá.** `ensureCompanyMetadata()` existía para dejar la
 *    empresa en el JWT del invitado antes de su primer login. Con Better Auth el claim se
 *    resuelve en el alta de sesión (`session.create.before` en `shared/lib/auth.ts`) contra la
 *    base, así que el invitado entra con su empresa sin que nadie se la escriba por anticipado
 *    — y sin la rama `force` que decidía cuándo pisarle la empresa a alguien que ya tenía otra.
 * 3. **La invitación se manda con el emisor SMTP de `shared/lib/mail`** (P5 generalizó esa costura),
 *    con un enlace que emite `createPasswordSetupLink()` dentro de la misma transacción.
 */
const logger = new Logger('features/Auth/register-user');

export type RegisterUserResult = { success: true; message: string } | { success: false; error: string };

/**
 * Otorga el rol elegido EN esta empresa.
 *
 * `skipDuplicates`: dos altas simultáneas del mismo usuario chocarían con la unique
 * (user_id, role_id, company_id) y abortarían la transacción entera.
 */
async function assignRoleInCompany(
  tx: Prisma.TransactionClient,
  credentialId: string,
  roleId: bigint,
  companyId: string,
  assignedBy: string
): Promise<void> {
  await tx.user_roles.createMany({
    data: [{ user_id: credentialId, role_id: roleId, company_id: companyId, assigned_by: assignedBy }],
    skipDuplicates: true,
  });
}

export async function registerUserWithRole(values: RegisterUserInput): Promise<RegisterUserResult> {
  const parsed = registerUserSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { password, role } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const fullname = buildFullname(parsed.data);

  try {
    const [companyId, actor] = await Promise.all([getActiveCompanyId(), getSessionUserId()]);
    if (!actor) return { success: false, error: 'Sesión requerida' };

    if (!(await checkPermissionServer('configuracion', 'usuarios-empleados', 'create'))) {
      return { success: false, error: 'No tenés permiso para crear usuarios en esta empresa' };
    }

    const roleRow = await prisma.roles.findFirst({
      where: { id: BigInt(role), is_active: true },
      select: { id: true, name: true },
    });
    if (!roleRow) return { success: false, error: 'El rol seleccionado no existe' };

    const profile = await prisma.profile.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, credential_id: true },
    });

    if (profile) {
      await addExistingProfileToCompany({ profile, companyId, roleId: roleRow.id, actor });
    } else {
      await createUserForCompany({ email, password, fullname, companyId, role: roleRow, actor });
    }

    await invalidateCacheTags(COMPANY_USERS_INVALIDATION);
    return { success: true, message: 'Usuario creado exitosamente' };
  } catch (error) {
    logger.error('Error en registerUserWithRole', { data: { error } });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al procesar la solicitud',
    };
  }
}

/**
 * Alta de la pertenencia (y del rol) de un perfil que ya existe en otra empresa.
 *
 * No toca la empresa activa del invitado: la sesión que ya tenga abierta sigue en la empresa
 * donde estaba, y la próxima vez que entre el hook de alta de sesión le resolverá la suya. Es
 * el comportamiento que antes se conseguía llamando a `ensureCompanyMetadata()` SIN `force`.
 */
async function addExistingProfileToCompany({
  profile,
  companyId,
  roleId,
  actor,
}: {
  profile: { id: string; credential_id: string | null };
  companyId: string;
  roleId: bigint;
  actor: string;
}): Promise<void> {
  const existingAccess = await prisma.share_company_users.findFirst({
    where: { profile_id: profile.id, company_id: companyId },
    select: { id: true },
  });
  if (existingAccess) throw new Error('El usuario ya tiene acceso a esta empresa');

  if (!profile.credential_id) throw new Error('El usuario no tiene credenciales de acceso vinculadas.');

  const credentialId = profile.credential_id;
  await withActor(actor, async (tx) => {
    await tx.share_company_users.create({ data: { company_id: companyId, profile_id: profile.id } });
    await assignRoleInCompany(tx, credentialId, roleId, companyId, actor);
  });

  logger.info('Usuario existente agregado a la empresa', { data: { profileId: profile.id, companyId } });
}

/**
 * Alta completa: credencial + perfil, pertenencia y rol, TODO en una transacción.
 *
 * Si algo falla no queda nada: ni el usuario de `auth_user`, ni su cuenta de contraseña, ni el
 * token de invitación, ni el perfil. Esa es la diferencia con el alta anterior, que tenía que
 * compensar a mano el alta en un sistema externo.
 *
 * El mail de invitación se manda DESPUÉS de commitear, y su fallo no revierte el alta: el
 * usuario ya existe y puede pedir el enlace desde "¿Olvidaste tu contraseña?".
 */
async function createUserForCompany({
  email,
  password,
  fullname,
  companyId,
  role,
  actor,
}: {
  email: string;
  password: string | undefined;
  fullname: string;
  companyId: string;
  role: { id: bigint; name: string };
  actor: string;
}): Promise<void> {
  const hasPassword = Boolean(password?.trim());

  const { credentialId, invitationUrl } = await withActor(actor, async (tx) => {
    const newCredentialId = await createCredential(tx, {
      email,
      name: fullname,
      password: hasPassword ? password : undefined,
      // Con contraseña puesta por el admin, el usuario tiene que cambiarla al entrar.
      needsPasswordChange: hasPassword,
    });

    await tx.profile.create({
      data: {
        // `profile.id === profile.credential_id`: las dos FKs de auditoría (a `profile.id` y a
        // `profile.credential_id`, ver `shared/lib/actor.ts`) apuntan al mismo uuid, que es el
        // que `withActor()` deja en `app.user_id`. P4 mantiene esa igualdad a propósito.
        id: newCredentialId,
        email,
        fullname,
        role: role.name, // columna legacy: FK a roles.name
        credential_id: newCredentialId,
      },
    });
    await tx.share_company_users.create({ data: { company_id: companyId, profile_id: newCredentialId } });
    await assignRoleInCompany(tx, newCredentialId, role.id, companyId, actor);

    // Sin contraseña = invitación: el enlace para que se la ponga él mismo.
    const url = hasPassword ? null : await createPasswordSetupLink(tx, newCredentialId);
    return { credentialId: newCredentialId, invitationUrl: url };
  });

  if (invitationUrl) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true } });
    const sent = await sendInvitationEmail({
      to: email,
      name: fullname,
      companyName: company?.company_name ?? 'tu empresa',
      url: invitationUrl,
    });
    if (!sent) {
      logger.warn('Usuario creado pero no se pudo enviar el mail de invitación', { data: { email } });
    }
  }

  logger.info('Usuario creado y agregado a la empresa', { data: { credentialId, companyId } });
}
