import { employeeListQuerySchema, employeeListResponseSchema } from '@/features/MobileApi/contracts/employees';
import { InvalidCursorError, listEmployees } from '@/features/MobileApi/employees/queries.server';
import { loadEmployeeAccess } from '@/features/MobileApi/employees/routes';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';

/**
 * Listado de empleados (solo lectura) con búsqueda por nombre, legajo, CUIL o DNI, filtros, orden y paginación por
 * cursor. Activos y bajas exigen el `view` de su subpestaña, igual que en la web.
 */
export const GET = mobileRoute({
  module: 'empleados',
  run: async ({ req, ctx }) => {
    const parsed = employeeListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    const access = await loadEmployeeAccess(ctx);
    const allowed = parsed.data.status === 'active' ? access.listActive : access.listInactive;
    if (!allowed) {
      return mobileError(
        403,
        'FORBIDDEN',
        parsed.data.status === 'active'
          ? 'No tenés permiso para ver los empleados activos.'
          : 'No tenés permiso para ver las bajas.'
      );
    }
    try {
      return mobileReadJson(req, employeeListResponseSchema, await listEmployees(ctx, parsed.data));
    } catch (error) {
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      throw error;
    }
  },
});
