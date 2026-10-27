import { employeeClothingResponseSchema } from '@/features/MobileApi/contracts/employees';
import { getEmployeeClothing } from '@/features/MobileApi/employees/queries.server';
import { employeeSectionRoute } from '@/features/MobileApi/employees/routes';

/** Últimas entregas de indumentaria y EPP del empleado. */
export const GET = employeeSectionRoute({
  allowed: (access) => access.clothing,
  forbiddenMessage: 'No tenés permiso para ver la indumentaria.',
  schema: employeeClothingResponseSchema,
  load: (ctx, employeeId) => getEmployeeClothing(ctx, employeeId),
});
