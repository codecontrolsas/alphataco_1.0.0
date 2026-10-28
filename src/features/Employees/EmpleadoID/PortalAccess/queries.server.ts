import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { isPortalEnabled } from '@/features/Portal/lib/feature-gate';
import { findUserProfileByEmployee } from '@/shared/lib/employee-profile';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Estado del portal de un legajo para la sección "Portal" del legajo (RR.HH.). Exige `empleados:portal_empleado:view`
 * y que el legajo sea de la empresa activa; la RLS por empleado además solo deja ver estas filas con ese permiso.
 * Devuelve `null` sin permiso o con un legajo ajeno.
 *
 * Módulo server-only: lo llama el Server Component de la sección, no el cliente.
 */
export async function getEmployeePortalAccessOverview(employeeId: string) {
  if (!(await checkPermissionServer('empleados', 'portal_empleado', 'view'))) return null;

  const companyId = await getActiveCompanyId();
  const [employee, access, events, linkedProfile, canManage] = await Promise.all([
    prisma.employees.findFirst({
      where: { id: employeeId, company_id: companyId },
      select: { email: true, is_active: true },
    }),
    prisma.employee_portal_access.findUnique({
      where: { employee_id: employeeId },
      select: { status: true, method: true, created_credential: true, granted_at: true, revoked_at: true },
    }),
    prisma.employee_portal_access_events.findMany({
      where: { employee_id: employeeId },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: { id: true, action: true, detail: true, performed_by: true, created_at: true },
    }),
    findUserProfileByEmployee(employeeId),
    checkPermissionServer('empleados', 'portal_empleado', 'portal_access'),
  ]);
  if (!employee) return null;

  const [account, actors] = await Promise.all([
    linkedProfile?.credential_id
      ? prismaSystem.user.findUnique({
          where: { id: linkedProfile.credential_id },
          select: { email: true, banned: true },
        })
      : Promise.resolve(null),
    events.length
      ? prisma.profile.findMany({
          where: { id: { in: [...new Set(events.map((event) => event.performed_by))] } },
          select: { id: true, fullname: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const actorName = new Map(actors.map((actor) => [actor.id, actor.fullname || actor.email || 'Usuario']));

  return {
    portalEnabled: await isPortalEnabled(),
    canManage,
    employeeEmail: employee.email,
    employeeActive: employee.is_active,
    access: access
      ? {
          status: access.status,
          method: access.method,
          createdCredential: access.created_credential,
          grantedAt: access.granted_at.toISOString(),
          revokedAt: access.revoked_at?.toISOString() ?? null,
        }
      : null,
    /** Usuario REAL ya vinculado al legajo (no las sesiones del QR). */
    account: account ? { email: account.email, banned: account.banned === true } : null,
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      detail: event.detail,
      performedBy: actorName.get(event.performed_by) ?? 'Usuario',
      createdAt: event.created_at.toISOString(),
    })),
  };
}

export type EmployeePortalAccessOverview = NonNullable<Awaited<ReturnType<typeof getEmployeePortalAccessOverview>>>;
