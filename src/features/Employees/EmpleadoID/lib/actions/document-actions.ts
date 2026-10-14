'use server';

import { refreshResourceStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { COMPANY_USERS_INVALIDATION } from '@/shared/constants/cache-invalidation-map';
import { withActor } from '@/shared/lib/actor';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { findUserProfileByEmployee } from '@/shared/lib/employee-profile';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import moment from 'moment';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { toTerminationReason } from '../termination-reason';

const logger = new Logger('features/Employees/EmpleadoID/document-actions');

const diagramStatusResultSchema = z.object({ success: z.boolean(), affected_rows: z.coerce.number().optional() });

/** Motivo con el que se banea la credencial al dar de baja el legajo (para distinguirlo de otros bans). */
const TERMINATION_BAN_REASON = 'Baja del legajo vinculado';

export interface ToggleEmployeeStatusResult {
  /** `true` si la credencial del usuario vinculado se bloqueó (baja) o se habilitó (reintegro). */
  accessUpdated: boolean;
  /** Aviso para mostrarle al usuario cuando el legajo cambió pero el acceso no pudo actualizarse. */
  warning?: string;
}

/** Día calendario `YYYY-MM-DD` de la baja: el cliente manda el string; un `Date` se lee en hora argentina. */
function toTerminationDay(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const day = typeof value === 'string' ? value : argentinaDate(value);
  if (!moment.utc(day, 'YYYY-MM-DD', true).isValid()) throw new Error('Fecha de baja inválida');
  // `@db.Date`: medianoche UTC del día elegido, sin depender de la zona del servidor.
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * ¿El usuario conserva acceso a OTRA empresa? (membresía activa o dueño de otra). Si es así, la baja
 * del legajo en ésta no debe bloquear su credencial: la credencial es global, no de la empresa.
 */
async function hasAccessToOtherCompany(profileId: string, companyId: string): Promise<boolean> {
  const [memberships, ownedCompanies] = await Promise.all([
    prisma.share_company_users.count({
      where: { profile_id: profileId, is_active: true, company_id: { not: companyId } },
    }),
    prisma.company.count({ where: { owner_id: profileId, id: { not: companyId } } }),
  ]);
  return memberships + ownedCompanies > 0;
}

/**
 * Da de baja o reactiva a un empleado de la empresa activa: actualiza el legajo, replica el
 * estado a sus diagramas (`update_employee_diagram_status`) y banea/desbanea al usuario vinculado.
 * `reasonForTermination` llega como etiqueta de la UI ("Despido sin causa"); `terminationDate`,
 * como `YYYY-MM-DD`. Requiere `empleados:employees:update` (la baja no tiene permiso propio).
 *
 * Si el legajo se actualiza pero el acceso del usuario no, NO lanza (el legajo ya cambió y la
 * transacción no se puede deshacer): devuelve `warning` para que la UI lo muestre.
 */
export async function toggleEmployeeStatus(
  employeeId: string,
  activate: boolean,
  reasonForTermination?: string,
  terminationDate?: string | Date
): Promise<ToggleEmployeeStatusResult> {
  if (!(await checkPermissionServer('empleados', 'employees', 'update'))) {
    throw new Error('No tenés permiso para dar de baja o reactivar empleados');
  }

  const [companyId, actor] = await Promise.all([getActiveCompanyId(), getSessionUserId()]);
  if (!actor) throw new Error('Sesión requerida');

  const terminationDay = activate ? null : toTerminationDay(terminationDate);

  await withActor(actor, async (tx) => {
    const updated = await tx.employees.updateMany({
      where: { id: employeeId, company_id: companyId },
      data: {
        is_active: activate,
        reason_for_termination: activate ? null : toTerminationReason(reasonForTermination),
        termination_date: terminationDay,
      },
    });
    if (updated.count === 0) throw new Error('Empleado no encontrado en la empresa activa');
    // Baja/reintegro: `is_active` cambia qué documentos se exigen (los de baja). Refresca el cache de status.
    await refreshResourceStatus(tx, 'Persona', companyId, employeeId);

    const diagramResult = await callScalar(
      'update_employee_diagram_status',
      [{ uuid: employeeId }, activate],
      diagramStatusResultSchema,
      tx
    );
    if (!diagramResult.success) {
      logger.warn('No se pudo actualizar el estado de los diagramas del empleado', {
        data: { employeeId, activate, diagramResult },
      });
    }
  });

  // Ban/unban del usuario vinculado al empleado + sync share_company_users.is_active
  let accessUpdated = false;
  let warning: string | undefined;
  try {
    // El profile del USUARIO vinculado, no el de una sesión anónima del QR (que también lleva
    // `employee_id` y se crea uno por login): banear esa credencial no haría nada útil y
    // dejaría al usuario real entrando.
    const profile = await findUserProfileByEmployee(employeeId);

    if (profile?.credential_id) {
      const credentialId = profile.credential_id;
      // La credencial (`auth_user`) es global: si el usuario sigue activo en otra empresa, la baja de
      // ESTE legajo sólo le quita la pertenencia a ésta; banearlo lo dejaría afuera de las demás.
      const banCredential = !activate && !(await hasAccessToOtherCompany(profile.id, companyId));

      // El ban de la credencial y la pertenencia viven en la misma base: van juntos. Al banear
      // se borran además las sesiones abiertas, para que la baja tenga efecto inmediato.
      await prisma.$transaction(async (tx) => {
        if (activate || banCredential) {
          await tx.user.update({
            where: { id: credentialId },
            data: {
              banned: !activate,
              banReason: activate ? null : TERMINATION_BAN_REASON,
              updatedAt: new Date(),
            },
          });
        }
        if (banCredential) {
          await tx.session.deleteMany({ where: { userId: credentialId } });
        }
        // Acotado a la empresa activa: el `updateMany` filtraba sólo por `profile_id`, así que
        // dar de baja un legajo en la empresa A le desactivaba la pertenencia en la B. El
        // camino hermano (`applyUserStatusPlan`) siempre estuvo acotado; esto lo empareja.
        await tx.share_company_users.updateMany({
          where: { profile_id: profile.id, company_id: companyId },
          data: { is_active: activate },
        });
      });

      await invalidateCacheTags(COMPANY_USERS_INVALIDATION);
      accessUpdated = activate || banCredential;
      logger.info(`Usuario ${activate ? 'desbaneado' : banCredential ? 'baneado' : 'sin bloqueo global'}`, {
        data: { employeeId, credentialId, keptOtherCompanies: !activate && !banCredential },
      });
    }
  } catch (banErr) {
    logger.error('Error en proceso de ban/unban', { data: { error: banErr, employeeId } });
    warning = activate
      ? 'El legajo se reactivó, pero no se pudo restablecer el acceso del usuario vinculado. Revisalo en Empresa > Usuarios.'
      : 'El legajo se dio de baja, pero no se pudo revocar el acceso del usuario vinculado. Revisalo en Empresa > Usuarios.';
  }

  revalidatePath('/dashboard/employee/action');
  revalidatePath('/dashboard/employee');
  return { accessUpdated, warning };
}
