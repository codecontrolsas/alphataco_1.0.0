/**
 * Usuarios demo con distintos roles, para mostrar como cambia lo que ve cada perfil.
 *
 * Las tablas de usuarios y roles NO las borra el reset: aca se upsertean (misma credencial todos
 * los dias) y se vuelven a armar los permisos de los roles custom de la demo. Todos usan la
 * contraseña del admin demo, que cumple la politica del login (mayuscula, minuscula, numero y
 * caracter especial).
 */
import { hashPassword } from 'better-auth/crypto';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import type { DemoEmployee } from './employees.ts';

export const DEMO_PASSWORD = 'AlphaDemo2026!';

/** Roles custom de la demo: modulos que ven (con las acciones que tiene el rol admin en ellos). */
const CUSTOM_ROLES = [
  { name: 'RRHH (demo)', color: '#0ea5e9', modules: ['dashboard', 'empleados', 'seleccion', 'documentacion'] },
  { name: 'Taller (demo)', color: '#f97316', modules: ['dashboard', 'mantenimiento', 'equipos', 'formularios', 'almacenes'] },
  { name: 'Operaciones (demo)', color: '#16a34a', modules: ['dashboard', 'operaciones', 'comercial', 'equipos', 'empleados'] },
];

const USERS = [
  { email: 'administrador@patagonia-demo.com.ar', name: 'Laura Pérez', role: 'Administrador', employee: null },
  { email: 'rrhh@patagonia-demo.com.ar', name: 'Sofía Morales', role: 'RRHH (demo)', employee: 'analista_rrhh' },
  { email: 'taller@patagonia-demo.com.ar', name: 'Jefe de Taller', role: 'Taller (demo)', employee: 'jefe_taller' },
  { email: 'operaciones@patagonia-demo.com.ar', name: 'Supervisor de Operaciones', role: 'Operaciones (demo)', employee: 'supervisor' },
] as const;

export async function seedUsers(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, company, actorId } = ctx;

  for (const role of CUSTOM_ROLES) {
    const saved = await tx.roles.upsert({
      where: { name: role.name },
      update: { color: role.color, is_active: true },
      create: { name: role.name, color: role.color, description: 'Rol de la demo', is_system: false },
    });
    await tx.role_permissions.deleteMany({ where: { role_id: saved.id } });
    await tx.$executeRaw`
      INSERT INTO role_permissions (role_id, tab_id, action_id)
      SELECT ${saved.id}, rp.tab_id, rp.action_id
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id AND r.slug = 'admin'
      JOIN tabs t ON t.id = rp.tab_id
      JOIN modules m ON m.id = t.module_id
      WHERE m.slug = ANY(${role.modules}::text[])
      ON CONFLICT DO NOTHING`;
  }

  const password = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  for (const u of USERS) {
    const existing = await tx.user.findUnique({ where: { email: u.email }, select: { id: true } });
    const id = existing?.id ?? demoId('user', u.email);
    const employee = u.employee ? employees.find((e) => e.position === u.employee && e.active) : undefined;
    if (!existing) {
      await tx.user.create({ data: { id, name: u.name, email: u.email, emailVerified: true, createdAt: now, updatedAt: now } });
      await tx.account.create({
        data: { id: demoId('account', u.email), userId: id, accountId: id, providerId: 'credential', password, createdAt: now, updatedAt: now },
      });
    } else {
      await tx.account.updateMany({ where: { userId: id, providerId: 'credential' }, data: { password, updatedAt: now } });
      await tx.user.update({ where: { id }, data: { banned: false, name: u.name } });
    }
    await tx.profile.upsert({
      where: { id },
      update: { fullname: u.name, email: u.email, credential_id: id, employee_id: employee?.id ?? null },
      create: { id, credential_id: id, email: u.email, fullname: u.name, role: 'User', employee_id: employee?.id ?? null },
    });
    const role = await tx.roles.findUniqueOrThrow({ where: { name: u.role }, select: { id: true } });
    await tx.user_roles.deleteMany({ where: { user_id: id, company_id: company.id } });
    await tx.user_roles.create({ data: { user_id: id, role_id: role.id, company_id: company.id, assigned_by: actorId } });
    const member = await tx.share_company_users.findFirst({ where: { profile_id: id, company_id: company.id } });
    if (!member) await tx.share_company_users.create({ data: { profile_id: id, company_id: company.id } });
  }
  ctx.log(`${USERS.length} usuarios demo (contraseña ${DEMO_PASSWORD})`);
}
