'use server';

import { documentTypeCompanyScope } from '@/features/Documentacion/TiposDocumentos/lib/document-type-scope';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { employeeLabel } from '@/shared/lib/resource-labels';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { assertDocumentUploadAccess, canSeePrivateDocumentTypes } from '../lib/document-permissions';

/**
 * Datos que necesita el modal de subida (`SimpleDocument`): tipos de documento del recurso y
 * recursos activos de la empresa. Antes el componente los leía por PostgREST desde el cliente.
 */
const logger = new Logger('Documentacion/document-resources');

export type DocumentResource = 'empleado' | 'equipo';

/** Tipos de documento activos (globales + de la empresa activa) que aplican a personas o equipos. */
export async function getActiveDocumentTypesByResource(resource: DocumentResource) {
  const kind = resource === 'empleado' ? 'employee' : 'vehicle';
  await assertDocumentUploadAccess(kind);
  const companyId = await getActiveCompanyId();
  // Los tipos privados sólo se ofrecen a quien tiene `view_private`/`upload_private` del recurso.
  const canSeePrivate = await canSeePrivateDocumentTypes(kind);
  try {
    return await prisma.document_types.findMany({
      where: {
        applies: resource === 'empleado' ? 'Persona' : 'Equipos',
        is_active: true,
        AND: [documentTypeCompanyScope(companyId)],
        ...(canSeePrivate ? {} : { OR: [{ private: null }, { private: false }] }),
      },
      select: {
        id: true,
        name: true,
        applies: true,
        mandatory: true,
        multiresource: true,
        explired: true,
        is_it_montlhy: true,
        has_policy_number: true,
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de documento por recurso', { data: { error, resource } });
    throw error;
  }
}

/**
 * Recursos ACTIVOS de la empresa activa para vincular documentos: `{ id, name, document }`.
 * Empleados: `[legajo] Apellido Nombre` + DNI (búsqueda por número). Equipos: dominio o serie.
 * Los dados de baja no figuran: no se les crean documentos nuevos.
 */
export async function getActiveResourcesForDocuments(resource: DocumentResource) {
  await assertDocumentUploadAccess(resource === 'empleado' ? 'employee' : 'vehicle');
  const companyId = await getActiveCompanyId();
  try {
    if (resource === 'empleado') {
      const rows = await prisma.employees.findMany({
        where: withCompany({ is_active: true }, companyId),
        select: { id: true, firstname: true, lastname: true, file: true, document_number: true },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      });
      return rows.map((e) => ({ id: e.id, name: employeeLabel(e), document: e.document_number }));
    }
    const rows = await prisma.vehicles.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, domain: true, serie: true },
      orderBy: { domain: 'asc' },
    });
    return rows.map((v) => ({ id: v.id, name: v.domain || v.serie || '', document: v.serie || v.domain || '' }));
  } catch (error) {
    logger.error('Error al obtener recursos para documentos', { data: { error, resource } });
    throw error;
  }
}

export type DocumentResourceOption = Awaited<ReturnType<typeof getActiveResourcesForDocuments>>[number];
