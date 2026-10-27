import 'server-only';

import type { TenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';
import { mobileRoute } from '../lib/handler';
import { mobileError, mobileReadJson } from '../lib/http';
import { loadMobilePermissions } from '../lib/user-permissions';
import { resolveEmployeeAccess, type EmployeeAccess } from './access';
import { employeeExists } from './queries.server';

/** Permisos de Empleados del usuario de la petición (una consulta). */
export async function loadEmployeeAccess(ctx: TenantContext): Promise<EmployeeAccess> {
  return resolveEmployeeAccess(await loadMobilePermissions(ctx));
}

export const FORBIDDEN_RECORD = 'No tenés permiso para ver los legajos.';
export const NOT_FOUND_EMPLOYEE = 'El empleado no existe o no pertenece a la empresa activa.';

export const employeeIdSchema = z.string().uuid();

/**
 * Ruta de una sección del legajo que se pide aparte (documentación, diagrama, indumentaria): mismo orden de chequeos
 * en todas — id válido, permiso de la sección (403), empleado de la empresa (404), datos validados con su schema.
 */
export function employeeSectionRoute<T>(config: {
  allowed: (access: EmployeeAccess) => boolean;
  forbiddenMessage: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  load: (ctx: TenantContext, employeeId: string, access: EmployeeAccess) => Promise<T>;
}) {
  return mobileRoute<{ employeeId: string }>({
    run: async ({ req, ctx, params }) => {
      if (!employeeIdSchema.safeParse(params.employeeId).success) {
        return mobileError(422, 'INVALID_INPUT', 'employeeId inválido.');
      }
      const access = await loadEmployeeAccess(ctx);
      if (!access.record || !config.allowed(access)) return mobileError(403, 'FORBIDDEN', config.forbiddenMessage);
      if (!(await employeeExists(ctx, params.employeeId))) return mobileError(404, 'NOT_FOUND', NOT_FOUND_EMPLOYEE);
      return mobileReadJson(req, config.schema, await config.load(ctx, params.employeeId, access));
    },
  });
}
