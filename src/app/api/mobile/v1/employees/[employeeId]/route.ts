import { employeeDetailResponseSchema } from '@/features/MobileApi/contracts/employees';
import { getEmployeeDetail } from '@/features/MobileApi/employees/queries.server';
import {
  employeeIdSchema,
  FORBIDDEN_RECORD,
  loadEmployeeAccess,
  NOT_FOUND_EMPLOYEE,
} from '@/features/MobileApi/employees/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';

/** Legajo del empleado con los bloques que el usuario puede ver (los demás no viajan). Otra empresa = 404. */
export const GET = mobileRoute<{ employeeId: string }>({
  module: 'empleados',
  run: async ({ req, ctx, params }) => {
    if (!employeeIdSchema.safeParse(params.employeeId).success)
      return mobileError(422, 'INVALID_INPUT', 'employeeId inválido.');
    const access = await loadEmployeeAccess(ctx);
    if (!access.record) return mobileError(403, 'FORBIDDEN', FORBIDDEN_RECORD);
    const detail = await getEmployeeDetail(ctx, params.employeeId, access);
    if (!detail) return mobileError(404, 'NOT_FOUND', NOT_FOUND_EMPLOYEE);
    return mobileReadJson(req, employeeDetailResponseSchema, detail);
  },
});
