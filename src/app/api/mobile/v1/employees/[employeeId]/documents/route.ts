import { employeeDocumentsResponseSchema } from '@/features/MobileApi/contracts/employees';
import { getEmployeeDocuments } from '@/features/MobileApi/employees/queries.server';
import { employeeSectionRoute } from '@/features/MobileApi/employees/routes';

/** Documentación del legajo (permanentes y mensuales) con estado y vencimiento, como la ficha web. */
export const GET = employeeSectionRoute({
  allowed: (access) => access.documents.visible,
  forbiddenMessage: 'No tenés permiso para ver la documentación de empleados.',
  schema: employeeDocumentsResponseSchema,
  load: getEmployeeDocuments,
});
