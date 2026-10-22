import { ensureCity, ensureDefaultRole } from '@/test/db-fixtures';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * FLUJO 2 — invitación de usuario a una empresa, de punta a punta contra el Postgres del
 * compose. Corre sólo con DATABASE_URL:
 *
 *   DATABASE_URL=postgresql://alphataco:devpass@127.0.0.1:55432/alphataco \
 *   npx vitest run src/features/Auth/actions/register-user.invitation.integration.test.ts
 *
 * Se ejecuta la action REAL (`registerUserWithRole`) con todo su camino de datos: la
 * transacción que crea credencial + perfil + pertenencia + rol + token de invitación, y el
 * canje de ese token por el endpoint nativo de Better Auth. Lo único mockeado es lo que
 * depende del contexto de request de Next (sesión, permiso, invalidación de caché) y el mail.
 *
 * Es el reemplazo de la parte del flujo que el spec de Cypress no cubre: recorrerlo por la UI
 * (dashboard → Empresa → Usuarios → diálogo → tabs → select de rol) sería lento y frágil, y no
 * agregaría nada sobre lo que se afirma acá.
 */
const RUN = Boolean(process.env.DATABASE_URL);

const ACTOR = randomUUID();
const COMPANY = randomUUID();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/shared/lib/session', () => ({ getSessionUserId: vi.fn(async () => ACTOR) }));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: vi.fn(async () => COMPANY) }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: vi.fn(async () => true),
}));
vi.mock('@/shared/utils/cache-invalidation', () => ({ invalidateCacheTags: vi.fn() }));

/** El mail no se envía: lo que importa es el enlace que lleva, así que se captura. */
const sentInvitations: Array<{ to: string; url: string }> = [];
vi.mock('@/shared/lib/mail/templates/auth', () => ({
  sendInvitationEmail: vi.fn(async (params: { to: string; url: string }) => {
    sentInvitations.push({ to: params.to, url: params.url });
    return true;
  }),
  sendPasswordResetEmail: vi.fn(async () => true),
}));

describe.skipIf(!RUN)('registerUserWithRole: invitación a una empresa (integración)', () => {
  let prisma: typeof import('@/shared/lib/prisma').prisma;
  let auth: typeof import('@/shared/lib/auth').auth;
  let registerUserWithRole: typeof import('./register-user').registerUserWithRole;

  const invitedEmail = `invitado-${randomUUID()}@test.local`;
  let roleId: bigint;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import('@/shared/lib/prisma'));
    await ensureDefaultRole(prisma);
    ({ auth } = await import('@/shared/lib/auth'));
    ({ registerUserWithRole } = await import('./register-user'));

    const city = await ensureCity(prisma);
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: `Invitacion ${COMPANY.slice(0, 8)}`,
        description: 'integración de la invitación',
        contact_email: 'inv@test.local',
        contact_phone: '+542991234567',
        address: 'Calle 1',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: `30${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`,
      },
    });

    // El actor (quien invita) tiene que existir: es el `assigned_by` del rol y el `app.user_id`
    // de la transacción.
    await prisma.user.create({
      data: {
        id: ACTOR,
        name: 'Quien invita',
        email: `actor-${ACTOR}@test.local`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await prisma.profile.create({
      data: { id: ACTOR, credential_id: ACTOR, email: `actor-${ACTOR}@test.local`, fullname: 'Quien invita' },
    });

    const role = await prisma.roles.create({
      data: { name: `Rol invitacion ${COMPANY.slice(0, 8)}`, is_system: false, is_active: true },
    });
    roleId = role.id;
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await prisma.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.profile.delete({ where: { id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.company.delete({ where: { id: COMPANY } }).catch(() => undefined);
    await prisma.roles.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.profile.delete({ where: { id: ACTOR } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: ACTOR } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('invita: crea credencial, perfil, pertenencia y rol, y manda el enlace', async () => {
    const result = await registerUserWithRole({
      email: invitedEmail,
      firstname: 'Ana',
      lastname: 'Invitada',
      role: String(roleId),
    } as never);

    expect(result).toMatchObject({ success: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: invitedEmail } });
    createdUserIds.push(user.id);

    // Sin contraseña: la invitación NO deja cuenta de credencial hasta que el usuario la define.
    expect(await prisma.account.findFirst({ where: { userId: user.id } })).toBeNull();
    // Y por lo tanto todavía no puede entrar.
    await expect(
      auth.api.signInEmail({ body: { email: invitedEmail, password: 'Loquesea-123' }, headers: new Headers() })
    ).rejects.toThrow();

    // Perfil con la igualdad que exigen las dos FKs de auditoría (profile.id = credential_id).
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
    expect(profile.credential_id).toBe(user.id);
    expect(profile.email).toBe(invitedEmail.toLowerCase());

    expect(
      await prisma.share_company_users.findFirst({ where: { profile_id: user.id, company_id: COMPANY } })
    ).not.toBeNull();
    expect(
      await prisma.user_roles.findFirst({ where: { user_id: user.id, company_id: COMPANY, role_id: roleId } })
    ).not.toBeNull();

    expect(sentInvitations.map((m) => m.to)).toContain(invitedEmail.toLowerCase());
  });

  it('el enlace de la invitación deja entrar, y el claim de empresa sale de la base', async () => {
    const invitation = sentInvitations.find((m) => m.to === invitedEmail.toLowerCase());
    expect(invitation).toBeDefined();

    const token = new URL(invitation!.url).pathname.split('/').pop()!;
    await auth.api.resetPassword({ body: { newPassword: 'Mi-primera-clave-1', token }, headers: new Headers() });

    const signIn = await auth.api.signInEmail({
      body: { email: invitedEmail, password: 'Mi-primera-clave-1' },
      headers: new Headers(),
    });
    expect(signIn.user.email).toBe(invitedEmail.toLowerCase());

    // El claim NO se escribió en el alta: lo resolvió el hook al abrir la sesión, contra la
    // pertenencia que la invitación creó.
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: signIn.user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(session.company).toBe(COMPANY);
  });

  it('el alta con contraseña marca el cambio obligatorio y deja entrar de una', async () => {
    const email = `contemp-${randomUUID()}@test.local`;

    const result = await registerUserWithRole({
      email,
      firstname: 'Bruno',
      lastname: 'Temporal',
      password: 'Temporal-inicial-1',
      confirmPassword: 'Temporal-inicial-1',
      role: String(roleId),
    } as never);
    expect(result).toMatchObject({ success: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    expect(user.needsPasswordChange).toBe(true);

    const signIn = await auth.api.signInEmail({
      body: { email, password: 'Temporal-inicial-1' },
      headers: new Headers(),
    });
    expect(signIn.user.id).toBe(user.id);
  });

  it('un mail que ya es usuario de la empresa se rechaza sin tocar nada', async () => {
    const result = await registerUserWithRole({
      email: invitedEmail,
      firstname: 'Ana',
      lastname: 'Invitada',
      role: String(roleId),
    } as never);

    expect(result).toMatchObject({ success: false });
    // Acotado a ESTE mail a propósito: un `count()` global de `auth_user` se vuelve flaky
    // apenas otra suite de integración corre en paralelo contra la misma base.
    expect(await prisma.user.count({ where: { email: invitedEmail.toLowerCase() } })).toBe(1);
    expect(await prisma.share_company_users.count({ where: { company_id: COMPANY } })).toBe(2);
  });

  it('un rol inexistente se rechaza antes de escribir nada', async () => {
    const email = `sinrol-${randomUUID()}@test.local`;

    const result = await registerUserWithRole({
      email,
      firstname: 'Carla',
      lastname: 'Fallida',
      role: '999999999',
    } as never);

    expect(result).toMatchObject({ success: false });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  /**
   * EL punto del alta transaccional: si la base falla A MITAD del alta, no queda una credencial
   * huérfana — el usuario que podía loguearse, con empresa asignada y sin perfil, que el alta
   * anterior compensaba a mano y a veces no podía.
   *
   * El escenario se fuerza con una credencial que YA existe con ese mail pero sin `profile`:
   * la action no encuentra perfil, entra por el alta completa, y el `auth_user.email` unique
   * revienta DENTRO de la transacción. Lo que se afirma es que no quedó nada a medias.
   */
  it('si la transacción falla a mitad no queda nada a medias', async () => {
    const email = `huerfano-${randomUUID()}@test.local`;

    // Una credencial suelta, sin perfil: el estado exacto que antes podía quedar.
    const previo = await prisma.user.create({
      data: { id: randomUUID(), name: 'Preexistente', email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    });
    createdUserIds.push(previo.id);

    const result = await registerUserWithRole({
      email,
      firstname: 'Carla',
      lastname: 'Fallida',
      role: String(roleId),
    } as never);

    expect(result).toMatchObject({ success: false });
    // Ni perfil, ni pertenencia, ni rol, ni token de invitación emitido.
    expect(await prisma.profile.findFirst({ where: { email } })).toBeNull();
    expect(await prisma.share_company_users.findFirst({ where: { profile_id: previo.id } })).toBeNull();
    expect(await prisma.user_roles.findFirst({ where: { user_id: previo.id } })).toBeNull();
    // Y la credencial que ya estaba sigue siendo la única con ese mail.
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});
