import { employeeDiagramResponseSchema } from '@/features/MobileApi/contracts/employees';
import { getEmployeeDiagram } from '@/features/MobileApi/employees/queries.server';
import { employeeSectionRoute } from '@/features/MobileApi/employees/routes';

/** Novedades del diagrama del empleado alrededor de hoy. */
export const GET = employeeSectionRoute({
  allowed: (access) => access.diagram,
  forbiddenMessage: 'No tenés permiso para ver los diagramas.',
  schema: employeeDiagramResponseSchema,
  load: (ctx, employeeId) => getEmployeeDiagram(ctx, employeeId),
});
