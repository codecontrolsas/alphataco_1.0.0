import 'server-only';

import { prismaSystem } from '@/shared/lib/prisma-system';

/**
 * Correo de contacto de los empleados para los avisos de HSE. Corre con `prismaSystem` y la empresa SIEMPRE explícita:
 * los jobs y los avisos que se mandan en segundo plano no tienen el legajo ni los permisos de quien los lee.
 *
 * - `requirePortalAccess: true` (avisos que mandan al portal, como «te asignaron un documento»): solo empleados con el
 *   acceso HABILITADO por RR.HH.; es la preferencia que cuenta (sin acceso no hay a dónde ir) y el correo es el de su
 *   acceso, con el del legajo como respaldo.
 * - `false` (vencimientos): también se avisa al que tiene correo en el legajo.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmployeeContact = { email: string | null; name: string };

export async function getEmployeeContacts(
  companyId: string,
  employeeIds: string[],
  options: { requirePortalAccess?: boolean } = {}
): Promise<Map<string, EmployeeContact>> {
  if (employeeIds.length === 0) return new Map();
  const [employees, access] = await Promise.all([
    prismaSystem.employees.findMany({
      where: { company_id: companyId, id: { in: employeeIds } },
      select: { id: true, email: true, firstname: true },
    }),
    prismaSystem.employee_portal_access.findMany({
      where: { company_id: companyId, employee_id: { in: employeeIds }, status: 'enabled' },
      select: { employee_id: true, credential_id: true },
    }),
  ]);
  const users = access.length
    ? await prismaSystem.user.findMany({
        where: { id: { in: access.map((a) => a.credential_id) } },
        select: { id: true, email: true },
      })
    : [];
  const userEmail = new Map(users.map((u) => [u.id, u.email]));
  const accessEmail = new Map(access.map((a) => [a.employee_id, userEmail.get(a.credential_id) ?? null]));
  const hasAccess = new Set(access.map((a) => a.employee_id));
  return new Map(
    employees.map((e) => {
      const email =
        options.requirePortalAccess && !hasAccess.has(e.id)
          ? null
          : [accessEmail.get(e.id), e.email].find((v): v is string => !!v && EMAIL_RE.test(v.trim())) ?? null;
      return [e.id, { email: email?.trim() ?? null, name: e.firstname }];
    })
  );
}
