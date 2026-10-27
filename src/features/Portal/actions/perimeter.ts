import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { getSessionNeedsPasswordChange, getSessionUserId, isSessionAnonymous } from '@/shared/lib/session';
import { getTenantContextOrNull } from '@/shared/lib/tenant-db';
import { cache } from 'react';

/**
 * Perímetro del portal de empleados.
 *
 * Un empleado entra al portal si, y solo si, su legajo tiene el acceso HABILITADO por RR.HH. para ESTA credencial y el
 * legajo está activo. Todo sale de la sesión y de la base: nunca de un id que mande el cliente. Se revisa en cada
 * request, así que deshabilitar el acceso o dar de baja el legajo corta la entrada aunque la sesión siga abierta.
 *
 * Las lecturas van por el `prisma` contextual: el legajo de la sesión viaja como `app.employee_id` (lo resuelve
 * `getTenantContext()`), y la RLS por empleado (`employee_self_*`) deja ver solo la fila propia de
 * `employee_portal_access`. Si algo de eso faltara, la consulta devuelve cero filas y el portal niega el acceso.
 *
 * Módulo server-only (NO son Server Actions).
 */

export type PortalDenyReason = 'no-session' | 'anonymous' | 'no-employee' | 'no-access' | 'inactive';

export interface PortalEmployee {
  /** `profile.credential_id` de la sesión. */
  userId: string;
  companyId: string;
  companyName: string;
  employeeId: string;
  /** Número de legajo (`employees.file`). */
  file: string | null;
  firstname: string;
  lastname: string;
  position: string | null;
  sector: string | null;
  /** Foto del legajo: se guarda como data URL de imagen; cualquier otro valor se descarta. */
  picture: string | null;
  email: string | null;
  admissionDate: Date | null;
  access: { method: 'invitation' | 'temporary_password' | 'existing_account'; grantedAt: Date };
  /** Entró con una contraseña temporal: hasta cambiarla no ve nada más. */
  needsPasswordChange: boolean;
}

export type PortalSessionResult = { ok: true; employee: PortalEmployee } | { ok: false; reason: PortalDenyReason };

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,/;

/** Memoizado por request con React `cache()`: el layout y cada página lo piden sin repetir consultas. */
export const getPortalSession = cache(async (): Promise<PortalSessionResult> => {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, reason: 'no-session' };
  // La sesión anónima del QR tiene un profile con legajo, pero no es la persona: al portal se entra con contraseña.
  if (await isSessionAnonymous()) return { ok: false, reason: 'anonymous' };

  const context = await getTenantContextOrNull();
  const employeeId = context?.employeeId;
  if (!context || !employeeId) return { ok: false, reason: 'no-employee' };

  // Una sola transacción con el contexto del request (una conexión y un `set_config`) en vez de tres lotes en paralelo.
  const [{ employee, access, company }, needsPasswordChange] = await Promise.all([
    prisma.$transaction(async (tx) => {
      const employeeRow = await tx.employees.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          file: true,
          firstname: true,
          lastname: true,
          picture: true,
          email: true,
          is_active: true,
          date_of_admission: true,
          company_positions: { select: { name: true } },
          hierarchy: { select: { name: true } },
        },
      });
      const accessRow = await tx.employee_portal_access.findUnique({
        where: { employee_id: employeeId },
        select: { credential_id: true, status: true, method: true, granted_at: true },
      });
      const companyRow = await tx.company.findUnique({
        where: { id: context.companyId },
        select: { company_name: true },
      });
      return { employee: employeeRow, access: accessRow, company: companyRow };
    }),
    getSessionNeedsPasswordChange(),
  ]);

  if (!employee) return { ok: false, reason: 'no-employee' };
  if (!access || access.status !== 'enabled' || access.credential_id !== userId)
    return { ok: false, reason: 'no-access' };
  if (!employee.is_active) return { ok: false, reason: 'inactive' };

  return {
    ok: true,
    employee: {
      userId,
      companyId: context.companyId,
      companyName: company?.company_name ?? 'Tu empresa',
      employeeId: employee.id,
      file: employee.file,
      firstname: employee.firstname,
      lastname: employee.lastname,
      position: employee.company_positions?.name ?? null,
      sector: employee.hierarchy?.name ?? null,
      picture: employee.picture && IMAGE_DATA_URL_RE.test(employee.picture) ? employee.picture : null,
      email: employee.email,
      admissionDate: employee.date_of_admission,
      access: { method: access.method, grantedAt: access.granted_at },
      needsPasswordChange,
    },
  };
});

/**
 * Empleado del portal, o error. Lo usan las Server Actions del portal (fase 2 en adelante): cada una lo llama primero.
 * Con la contraseña temporal sin cambiar no deja hacer nada (salvo cambiarla, que va por `changePassword`).
 */
export async function requirePortalEmployee(): Promise<PortalEmployee> {
  const session = await getPortalSession();
  if (!session.ok) throw new Error('No hay una sesión del portal habilitada');
  if (session.employee.needsPasswordChange) throw new Error('Tenés que cambiar la contraseña temporal antes de seguir');
  return session.employee;
}
