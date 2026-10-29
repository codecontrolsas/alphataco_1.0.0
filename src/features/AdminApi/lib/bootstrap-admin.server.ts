import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';

/**
 * Primer administrador de una instancia nueva, para el alta remota de TaskApp
 * (`POST /api/admin/v1/bootstrap-admin`). Mismo alta que `scripts/bootstrap-admin.ts` (usuario, perfil,
 * empresa del seed, rol `admin`, dueño de la empresa), pero con una **contraseña temporal** que TaskApp genera y
 * `needsPasswordChange = true`: el proxy obliga a cambiarla en el primer ingreso.
 *
 * Alcance acotado a propósito (el token es de máquina):
 * - `create` solo da de alta si la instancia **no tiene ningún usuario** (es el primero). Si el mail ya existe,
 *   responde `exists` sin tocar nada (reintento idempotente).
 * - `reset` solo reemplaza la contraseña temporal del **dueño de la empresa** mientras **no la haya cambiado**
 *   (`needsPasswordChange` sigue en true). Si ya eligió la suya, 409: nunca se le pisa.
 */
/** Lo que usan las transacciones de acá (tipado acotado: el cliente completo dispara TS2589). */
type AdminTx = Pick<
  Prisma.TransactionClient,
  'user' | 'account' | 'session' | 'profile' | 'share_company_users' | 'user_roles' | 'company'
>;

export type BootstrapAdminOutcome =
  | { status: 'created' | 'exists' | 'reset'; email: string; needsPasswordChange: boolean }
  | { status: 'already_bootstrapped' }
  | { status: 'password_already_changed' }
  | { status: 'not_found' }
  | { status: 'invalid'; message: string };

export interface BootstrapAdminInput {
  email: string;
  name: string;
  company: string | null;
  tempPassword: string;
  mode: 'create' | 'reset';
}

export async function bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminOutcome> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, needsPasswordChange: true },
  });

  if (input.mode === 'reset') {
    if (!existing) return { status: 'not_found' };
    if (!existing.needsPasswordChange) return { status: 'password_already_changed' };
    const owns = await prisma.company.count({ where: { owner_id: existing.id } });
    if (owns === 0) return { status: 'password_already_changed' };
    const hash = await hashPassword(input.tempPassword);
    const now = new Date();
    await prisma.$transaction(async (tx: AdminTx) => {
      const account = await tx.account.findFirst({
        where: { userId: existing.id, providerId: 'credential' },
        select: { id: true },
      });
      if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash, updatedAt: now } });
      else
        await tx.account.create({
          data: {
            id: randomUUID(),
            userId: existing.id,
            accountId: existing.id,
            providerId: 'credential',
            password: hash,
            createdAt: now,
            updatedAt: now,
          },
        });
      // Una contraseña temporal nueva cierra cualquier sesión abierta con la anterior.
      await tx.session.deleteMany({ where: { userId: existing.id } });
    });
    return { status: 'reset', email, needsPasswordChange: true };
  }

  if (existing) return { status: 'exists', email, needsPasswordChange: existing.needsPasswordChange };
  if ((await prisma.user.count()) > 0) return { status: 'already_bootstrapped' };

  const companyName = input.company?.trim() || process.env.SEED_COMPANY_NAME?.trim() || '';
  const companies = await prisma.company.findMany({
    where: { company_name: companyName },
    select: { id: true, owner_id: true },
  });
  if (companies.length !== 1) {
    return {
      status: 'invalid',
      message: `Se esperaba 1 empresa "${companyName}" (la del seed) y hay ${companies.length}`,
    };
  }
  const company = companies[0];
  const role = await prisma.roles.findFirst({
    where: { slug: 'admin', is_system: true },
    select: { id: true, name: true },
  });
  if (!role) return { status: 'invalid', message: 'No existe el rol de sistema "admin": falta correr el seed' };

  const userId = randomUUID();
  const hash = await hashPassword(input.tempPassword);
  const now = new Date();
  await prisma.$transaction(async (tx: AdminTx) => {
    await tx.user.create({
      data: {
        id: userId,
        name: input.name,
        email,
        emailVerified: true,
        needsPasswordChange: true,
        createdAt: now,
        updatedAt: now,
      },
    });
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
    // `profile.id === profile.credential_id` (ver `shared/lib/actor.ts`).
    await tx.profile.create({
      data: { id: userId, credential_id: userId, email, fullname: input.name, role: role.name },
    });
    await tx.share_company_users.create({ data: { company_id: company.id, profile_id: userId } });
    await tx.user_roles.create({
      data: { user_id: userId, role_id: role.id, company_id: company.id, assigned_by: userId },
    });
    if (!company.owner_id) await tx.company.update({ where: { id: company.id }, data: { owner_id: userId } });
  });
  return { status: 'created', email, needsPasswordChange: true };
}
