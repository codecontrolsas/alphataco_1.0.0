'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { assertDiagramAccess } from '../lib/diagram-access';

const logger = new Logger('features/Employees/Diagrams/queries');

/** Tipos de novedad (`diagram_type`) de la empresa activa, ordenados por nombre. */
export async function fetchDiagramsTypes() {
  await assertDiagramAccess('new', 'massive_diagram', 'employees');
  const companyId = await getActiveCompanyId();

  try {
    return await prisma.diagram_type.findMany({
      where: withCompany({}, companyId),
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener los tipos de novedad', { data: { error } });
    return [];
  }
}
