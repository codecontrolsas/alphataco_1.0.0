import { employeeFiltersResponseSchema } from '@/features/MobileApi/contracts/employees';
import { getEmployeeFilterOptions } from '@/features/MobileApi/employees/queries.server';
import { loadEmployeeAccess } from '@/features/MobileApi/employees/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';

/** Opciones de los filtros del listado: estados que el usuario puede ver, sectores, puestos, clientes y estado documental. */
export const GET = mobileRoute({
  module: 'empleados',
  run: async ({ req, ctx }) => {
    const access = await loadEmployeeAccess(ctx);
    if (!access.listActive && !access.listInactive)
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los empleados.');
    return mobileReadJson(req, employeeFiltersResponseSchema, await getEmployeeFilterOptions(ctx, access));
  },
});
