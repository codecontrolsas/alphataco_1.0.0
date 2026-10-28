'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { isPortalEnabled } from '@/features/Portal/lib/feature-gate';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import {
  createCredential,
  createPasswordSetupLink,
  normalizeEmail,
  withCredentialTransaction,
} from '@/shared/lib/auth-credentials';
import { findUserProfileByEmployee } from '@/shared/lib/employee-profile';
import { appUrl } from '@/shared/lib/mail/shell';
import { sendPortalAccessEnabledEmail, sendPortalInvitationEmail } from '@/shared/lib/mail/templates/auth';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { hashPassword } from 'better-auth/crypto';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { generateTemporaryPassword } from './lib/temporary-password';
import { enablePortalAccessSchema, type EnablePortalAccessInput } from './schemas/portal-access';

/**
 * Acceso al portal de empleados desde el legajo (RR.HH.). Reemplaza el registro libre por CUIL del portal viejo
 * (falla grave S3 del diagnóstico) y la "aprobación" sin permiso ni empresa (S4).
 *
 * Perímetro de cada action: permiso `empleados:portal_empleado:<acción>`, empresa activa de la sesión (nunca un
 * `companyId` del cliente), el legajo tiene que ser de esa empresa, y además la RLS (`tenant_isolation` +
 * `employee_self_*`) rechaza en la base cualquier escritura sin el permiso.
 *
 * Reglas de la cuenta:
 * - Si el legajo ya tiene un usuario REAL vinculado (dashboard, ropa, taller), se reusa: nunca se crea una segunda
 *   cuenta ni se le toca la contraseña (sería reescribir la de un miembro del dashboard).
 * - Reemitir invitación o contraseña temporal solo vale para la credencial que creó el portal (`created_credential`).
 * - Un correo que ya es de OTRO usuario se rechaza.
 */
const logger = new Logger('features/Employees/PortalAccess');

const PORTAL_TAB = { module: 'empleados', tab: 'portal_empleado' } as const;

export type PortalAccessActionResult =
  | {
      success: true;
      message: string;
      /** Solo con contraseña temporal: se muestra UNA vez a RR.HH. y no queda en ningún lado. */
      temporaryPassword?: string;
      /** Usuario con el que entra el empleado. */
      loginEmail?: string;
      /** Solo si la invitación no se pudo mandar por correo (sin SMTP): para entregarla a mano. */
      activationUrl?: string;
    }
  | { success: false; error: string };

/** Actor de la acción: `credential_id` (para `withActor`) y `profile.id` (columnas de auditoría). */
async function resolveActor(): Promise<{ credentialId: string; profileId: string } | null> {
  const credentialId = await getSessionUserId();
  if (!credentialId) return null;
  const profile = await prisma.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } });
  return profile ? { credentialId, profileId: profile.id } : null;
}

/** El legajo, solo si es de la empresa activa. */
async function findCompanyEmployee(employeeId: string, companyId: string) {
  return prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId },
    select: { id: true, firstname: true, lastname: true, email: true, is_active: true },
  });
}

/** Deja el acceso habilitado (alta o rehabilitación) y anota el evento. Corre dentro de la transacción de la action. */
async function upsertEnabledAccess(
  tx: Prisma.TransactionClient,
  input: {
    employeeId: string;
    credentialId: string;
    method: 'invitation' | 'temporary_password' | 'existing_account';
    createdCredential: boolean;
    actorProfileId: string;
    detail: string;
    extraEvent?: 'invitation_sent' | 'temporary_password_issued';
  }
): Promise<void> {
  const now = new Date();
  await tx.employee_portal_access.upsert({
    where: { employee_id: input.employeeId },
    create: {
      employee_id: input.employeeId,
      credential_id: input.credentialId,
      status: 'enabled',
      method: input.method,
      created_credential: input.createdCredential,
      granted_by: input.actorProfileId,
      granted_at: now,
    },
    update: {
      credential_id: input.credentialId,
      status: 'enabled',
      method: input.method,
      created_credential: input.createdCredential,
      granted_by: input.actorProfileId,
      granted_at: now,
      revoked_by: null,
      revoked_at: null,
      updated_at: now,
    },
  });
  await tx.employee_portal_access_events.createMany({
    data: [
      { employee_id: input.employeeId, action: 'enabled', performed_by: input.actorProfileId, detail: input.detail },
      ...(input.extraEvent
        ? [{ employee_id: input.employeeId, action: input.extraEvent, performed_by: input.actorProfileId }]
        : []),
    ],
  });
}

/** Pone una contraseña temporal (hash de Better Auth) y obliga a cambiarla; cierra las sesiones abiertas. */
async function setTemporaryPassword(tx: Prisma.TransactionClient, userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  const now = new Date();
  const existing = await tx.account.findFirst({ where: { userId, providerId: 'credential' }, select: { id: true } });
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
  await tx.user.update({ where: { id: userId }, data: { needsPasswordChange: true, updatedAt: now } });
  await tx.session.deleteMany({ where: { userId } });
}

/**
 * Habilita el portal a un legajo, o reemite la invitación / contraseña temporal si el portal ya le había creado la
 * cuenta. Ver las reglas de la cuenta arriba.
 */
export async function enableEmployeePortalAccess(values: EnablePortalAccessInput): Promise<PortalAccessActionResult> {
  const parsed = enablePortalAccessSchema.safeParse(values);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { employeeId, method } = parsed.data;

  try {
    if (!(await isPortalEnabled()))
      return { success: false, error: 'El portal de empleados está apagado en esta instancia.' };
    if (!(await checkPermissionServer(PORTAL_TAB.module, PORTAL_TAB.tab, 'portal_access'))) {
      return { success: false, error: 'No tenés permiso para habilitar el portal.' };
    }

    const [companyId, actor] = await Promise.all([getActiveCompanyId(), resolveActor()]);
    if (!actor) return { success: false, error: 'Sesión requerida' };

    const employee = await findCompanyEmployee(employeeId, companyId);
    if (!employee) return { success: false, error: 'El empleado no pertenece a la empresa activa.' };
    if (!employee.is_active)
      return { success: false, error: 'El legajo está dado de baja: reactivalo antes de habilitar el portal.' };

    const fullname = `${employee.firstname} ${employee.lastname}`.trim();
    const [company, currentAccess, linkedProfile] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true } }),
      prisma.employee_portal_access.findUnique({
        where: { employee_id: employeeId },
        select: { credential_id: true, created_credential: true },
      }),
      findUserProfileByEmployee(employeeId),
    ]);
    const companyName = company?.company_name ?? 'tu empresa';

    // ── El legajo ya tiene un usuario ──────────────────────────────────────────────────────
    if (linkedProfile?.credential_id) {
      const credentialId = linkedProfile.credential_id;
      const user = await prismaSystem.user.findUnique({
        where: { id: credentialId },
        select: { email: true, banned: true },
      });
      if (!user)
        return { success: false, error: 'El usuario vinculado al legajo no existe. Revisalo en Empresa → Usuarios.' };
      if (user.banned)
        return {
          success: false,
          error: 'El usuario vinculado al legajo está bloqueado. Revisalo en Empresa → Usuarios.',
        };

      const portalOwnsCredential =
        currentAccess?.created_credential === true && currentAccess.credential_id === credentialId;

      if (!portalOwnsCredential) {
        // Cuenta real (dashboard, ropa, taller): se reusa tal cual, sin tocar su contraseña.
        await withActor(actor.credentialId, (tx) =>
          upsertEnabledAccess(tx, {
            employeeId,
            credentialId,
            method: 'existing_account',
            createdCredential: false,
            actorProfileId: actor.profileId,
            detail: `Cuenta existente (${user.email})`,
          })
        );
        await sendPortalAccessEnabledEmail({
          to: user.email,
          name: fullname,
          companyName,
          url: `${appUrl()}/portal/login`,
        });
        revalidatePath('/dashboard/employee/action');
        return {
          success: true,
          loginEmail: user.email,
          message: 'Portal habilitado. El empleado entra con su usuario y contraseña de siempre.',
        };
      }

      // Cuenta que creó el portal: se puede reemitir invitación o contraseña temporal.
      return await issueCredentialAccess({
        companyId,
        credentialId,
        email: user.email,
        method,
        fullname,
        companyName,
        employeeId,
        actor,
      });
    }

    // ── Legajo sin usuario: se crea la cuenta del portal ──────────────────────────────────
    const rawEmail = parsed.data.email || employee.email || '';
    if (!rawEmail) {
      return { success: false, error: 'Cargá el correo del empleado: es el usuario con el que va a entrar al portal.' };
    }
    const email = normalizeEmail(rawEmail);

    const [userWithEmail, profileWithEmail] = await Promise.all([
      prismaSystem.user.findUnique({ where: { email }, select: { id: true } }),
      prismaSystem.profile.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);
    if (userWithEmail || profileWithEmail) {
      return {
        success: false,
        error:
          'Ese correo ya pertenece a otro usuario. Si es de este empleado, vinculale el legajo desde Empresa → Usuarios y volvé a habilitar el portal.',
      };
    }

    const temporaryPassword = method === 'temporary_password' ? generateTemporaryPassword() : undefined;
    const activationUrl = await withCredentialTransaction(companyId, actor.credentialId, async (tx) => {
      const credentialId = await createCredential(tx, {
        email,
        name: fullname,
        password: temporaryPassword,
        needsPasswordChange: method === 'temporary_password',
      });
      // `profile.id === credential_id`, como en el alta de usuarios (ver `shared/lib/actor.ts`). Sin pertenencia ni rol:
      // el empleado del portal no es usuario del dashboard.
      await tx.profile.create({
        data: { id: credentialId, credential_id: credentialId, email, fullname, employee_id: employeeId },
      });
      await upsertEnabledAccess(tx, {
        employeeId,
        credentialId,
        method,
        createdCredential: true,
        actorProfileId: actor.profileId,
        detail: method === 'invitation' ? `Invitación a ${email}` : `Contraseña temporal para ${email}`,
        extraEvent: method === 'invitation' ? 'invitation_sent' : 'temporary_password_issued',
      });
      return method === 'invitation' ? createPasswordSetupLink(tx, credentialId, '/portal/activate') : null;
    });

    revalidatePath('/dashboard/employee/action');
    if (activationUrl) {
      const sent = await sendPortalInvitationEmail({ to: email, name: fullname, companyName, url: activationUrl });
      return sent
        ? { success: true, loginEmail: email, message: `Portal habilitado. Le enviamos la invitación a ${email}.` }
        : {
            success: true,
            loginEmail: email,
            activationUrl,
            message: 'Portal habilitado, pero el correo no salió. Entregale el enlace de activación a mano.',
          };
    }
    return {
      success: true,
      loginEmail: email,
      temporaryPassword,
      message: 'Portal habilitado con contraseña temporal. Al entrar la va a tener que cambiar.',
    };
  } catch (error) {
    logger.error('Error al habilitar el portal', { data: { error, employeeId } });
    return { success: false, error: 'No se pudo habilitar el portal. Probá de nuevo.' };
  }
}

/** Reemite el acceso de una credencial creada por el portal: nueva invitación o nueva contraseña temporal. */
async function issueCredentialAccess(input: {
  companyId: string;
  credentialId: string;
  email: string;
  method: 'invitation' | 'temporary_password';
  fullname: string;
  companyName: string;
  employeeId: string;
  actor: { credentialId: string; profileId: string };
}): Promise<PortalAccessActionResult> {
  const temporaryPassword = input.method === 'temporary_password' ? generateTemporaryPassword() : undefined;

  const activationUrl = await withCredentialTransaction(input.companyId, input.actor.credentialId, async (tx) => {
    if (temporaryPassword) await setTemporaryPassword(tx, input.credentialId, temporaryPassword);
    await upsertEnabledAccess(tx, {
      employeeId: input.employeeId,
      credentialId: input.credentialId,
      method: input.method,
      createdCredential: true,
      actorProfileId: input.actor.profileId,
      detail:
        input.method === 'invitation'
          ? `Nueva invitación a ${input.email}`
          : `Nueva contraseña temporal para ${input.email}`,
      extraEvent: input.method === 'invitation' ? 'invitation_sent' : 'temporary_password_issued',
    });
    return input.method === 'invitation' ? createPasswordSetupLink(tx, input.credentialId, '/portal/activate') : null;
  });

  revalidatePath('/dashboard/employee/action');
  if (activationUrl) {
    const sent = await sendPortalInvitationEmail({
      to: input.email,
      name: input.fullname,
      companyName: input.companyName,
      url: activationUrl,
    });
    return sent
      ? { success: true, loginEmail: input.email, message: `Le reenviamos la invitación a ${input.email}.` }
      : {
          success: true,
          loginEmail: input.email,
          activationUrl,
          message: 'El correo no salió. Entregale el enlace de activación a mano.',
        };
  }
  return {
    success: true,
    loginEmail: input.email,
    temporaryPassword,
    message: 'Nueva contraseña temporal generada. Se cerraron las sesiones abiertas del empleado.',
  };
}

/**
 * Deshabilita el portal del legajo. Corta la entrada en el próximo request (el perímetro mira el estado siempre).
 * Si la credencial la creó el portal, además cierra sus sesiones y anula las invitaciones pendientes; si es una cuenta
 * reutilizada (dashboard, ropa, taller), sus sesiones siguen: perdería esos accesos por una decisión sobre el portal.
 */
export async function disableEmployeePortalAccess(employeeId: string): Promise<PortalAccessActionResult> {
  try {
    if (!(await checkPermissionServer(PORTAL_TAB.module, PORTAL_TAB.tab, 'portal_access'))) {
      return { success: false, error: 'No tenés permiso para deshabilitar el portal.' };
    }
    const [companyId, actor] = await Promise.all([getActiveCompanyId(), resolveActor()]);
    if (!actor) return { success: false, error: 'Sesión requerida' };

    const employee = await findCompanyEmployee(employeeId, companyId);
    if (!employee) return { success: false, error: 'El empleado no pertenece a la empresa activa.' };

    const access = await prisma.employee_portal_access.findUnique({
      where: { employee_id: employeeId },
      select: { status: true, credential_id: true, created_credential: true },
    });
    if (!access || access.status !== 'enabled') return { success: false, error: 'El portal ya está deshabilitado.' };

    const now = new Date();
    await withActor(actor.credentialId, async (tx) => {
      await tx.employee_portal_access.update({
        where: { employee_id: employeeId },
        data: { status: 'disabled', revoked_by: actor.profileId, revoked_at: now, updated_at: now },
      });
      await tx.employee_portal_access_events.create({
        data: { employee_id: employeeId, action: 'disabled', performed_by: actor.profileId },
      });
    });

    // Solo la credencial que creó el portal es "del portal": a esa se le cierran las sesiones y se anulan las
    // invitaciones pendientes. Una cuenta reutilizada (dashboard, ropa, taller) conserva sus sesiones: el perímetro del
    // portal mira el estado en cada request, así que igual deja de entrar al portal.
    const portalOnly = access.created_credential;
    if (portalOnly) {
      await prismaSystem.session.deleteMany({ where: { userId: access.credential_id } });
      await prismaSystem.verification.deleteMany({
        where: { value: access.credential_id, identifier: { startsWith: 'reset-password:' } },
      });
    }

    revalidatePath('/dashboard/employee/action');
    return {
      success: true,
      message: portalOnly
        ? 'Portal deshabilitado. Se cerraron las sesiones del empleado.'
        : 'Portal deshabilitado. El empleado conserva su usuario para el resto del sistema.',
    };
  } catch (error) {
    logger.error('Error al deshabilitar el portal', { data: { error, employeeId } });
    return { success: false, error: 'No se pudo deshabilitar el portal. Probá de nuevo.' };
  }
}
