'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { getDiagnosticRepairTypeId } from '../../utils/diagnostic-repair-type';
import { ConfigPermissionError, failureMessage, requireConfigPermission } from '../lib/access';
import {
  idDeltaSchema,
  maintenanceGroupInputSchema,
  uuidListSchema,
  uuidSchema,
  type IdDelta,
  type MaintenanceGroupInput,
} from '../schemas/repair-types';

const logger = new Logger('Mantenimiento/TiposReparaciones/grupos');

/** Mensaje para el cliente: solo se exponen los rechazos esperados, no el detalle interno. */
function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Los datos enviados son inválidos';
  const isPerimeter = error instanceof Error && error.message.includes('no pertenece');
  return failureMessage(error, isPerimeter ? (error as Error).message : 'Error inesperado');
}

/**
 * Tipos de reparación de la empresa activa que pueden entrar en un grupo.
 *
 * Perímetro: los ids llegan del formulario, así que se contrastan contra el catálogo de la
 * empresa antes de colgarlos — el grupo y sus tipos tienen que ser de la misma empresa.
 */
async function assertRepairTypesInActiveCompany(typeIds: string[], companyId: string): Promise<string[]> {
  if (typeIds.length === 0) return [];

  const types = await prisma.types_of_repairs.findMany({
    where: withCompany({ id: { in: typeIds } }, companyId),
    select: { id: true },
  });

  return types.map((type) => type.id);
}

/**
 * Perímetro del grupo: `maintenance_request_groups.company_id` es la fuente de verdad.
 *
 * Antes la tabla no tenía la columna y la pertenencia se deducía de las relaciones del
 * grupo, con un hueco: un grupo sin tipos todavía (camino normal, `typeIds` es opcional en
 * el formulario) no pertenecía a nadie, así que cualquier empresa podía renombrarlo,
 * colgarle sus propios tipos o desactivarlo.
 */
async function assertGroupInActiveCompany(groupId: string, companyId: string): Promise<void> {
  const group = await prisma.maintenance_request_groups.findFirst({
    where: { id: groupId, company_id: companyId },
    select: { id: true },
  });

  if (!group) throw new Error('El grupo de reparaciones no pertenece a la empresa activa');
}

/** Crea un grupo de reparaciones y sus relaciones con los tipos elegidos. */
export const createMaintenanceGroupAction = async (rawGroupData: MaintenanceGroupInput, rawTypeIds: string[]) => {
  try {
    await requireConfigPermission('maintenance_groups', 'create');
    const groupData = maintenanceGroupInputSchema.parse(rawGroupData);
    const typeIds = uuidListSchema.parse(rawTypeIds);
    const companyId = await getActiveCompanyId();
    const validTypeIds = await assertRepairTypesInActiveCompany(typeIds, companyId);

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.maintenance_request_groups.create({
        data: {
          name: groupData.name,
          description: groupData.description ?? null,
          is_active: groupData.is_active ?? true,
          company_id: companyId,
        },
      });

      if (validTypeIds.length > 0) {
        await tx.maintenance_group_type_of_repairs.createMany({
          data: validTypeIds.map((type_id) => ({ group_id: created.id, type_id })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return { group, error: null };
  } catch (error) {
    logger.error('Error al crear el grupo de reparaciones', { data: { error } });
    return { group: null, error: errorMessage(error) };
  }
};

/**
 * Actualiza un grupo y sus relaciones.
 *
 * Los tipos viajan como ALTAS y BAJAS explícitas respecto de lo que el formulario cargó al
 * abrir el grupo: el DELETE se acota a `grupo = X AND tipo IN (remove)` y el INSERT solo a
 * `add`. Un tipo que no figura en ninguna lista no se toca. Devuelve `{ added, removed }`.
 */
export const updateMaintenanceGroupAction = async (
  groupId: string,
  rawGroupData: MaintenanceGroupInput,
  rawDelta: IdDelta
) => {
  try {
    await requireConfigPermission('maintenance_groups', 'update');
    uuidSchema.parse(groupId);
    const groupData = maintenanceGroupInputSchema.parse(rawGroupData);
    const delta = idDeltaSchema.parse(rawDelta);
    const companyId = await getActiveCompanyId();
    await assertGroupInActiveCompany(groupId, companyId);
    const toAdd = await assertRepairTypesInActiveCompany(delta.add, companyId);
    const toRemove = delta.remove.filter((id) => !toAdd.includes(id));

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.maintenance_request_groups.update({
        where: { id: groupId, company_id: companyId },
        data: {
          name: groupData.name,
          description: groupData.description ?? null,
          is_active: groupData.is_active ?? true,
        },
      });

      let added = 0;
      if (toAdd.length > 0) {
        const res = await tx.maintenance_group_type_of_repairs.createMany({
          data: toAdd.map((type_id) => ({ group_id: groupId, type_id })),
          skipDuplicates: true,
        });
        added = res.count;
      }

      let removed = 0;
      if (toRemove.length > 0) {
        const res = await tx.maintenance_group_type_of_repairs.deleteMany({
          where: { group_id: groupId, type_id: { in: toRemove } },
        });
        removed = res.count;
      }

      return { updated, added, removed };
    });

    return { updatedGroup: result.updated, added: result.added, removed: result.removed, error: null };
  } catch (error) {
    logger.error('Error al actualizar el grupo de reparaciones', { data: { error, groupId } });
    return { updatedGroup: null, added: 0, removed: 0, error: errorMessage(error) };
  }
};
/**
 * Grupos de la empresa activa, con los ids de sus tipos de reparación. Exige `view`.
 *
 * Por defecto lista TODOS (activos e inactivos): la pantalla de configuración tiene que poder
 * reactivar un grupo inactivo. `onlyActive` deja solo los activos para quien los use de catálogo.
 * `forbidden` distingue "sin permiso" de un error: la vista no debe mostrar una lista vacía.
 */
export const fetchMaintenanceGroupsAction = async ({ onlyActive = false }: { onlyActive?: boolean } = {}) => {
  try {
    await requireConfigPermission('maintenance_groups', 'view');
    const companyId = await getActiveCompanyId();

    const data = await prisma.maintenance_request_groups.findMany({
      where: { ...(onlyActive ? { is_active: true } : {}), company_id: companyId },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        maintenance_group_type_of_repairs: { select: { type_id: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return { groups: data, error: null, forbidden: false };
  } catch (error) {
    logger.error('Error al obtener los grupos de reparaciones', { data: { error } });
    return { groups: [], error: errorMessage(error), forbidden: error instanceof ConfigPermissionError };
  }
};
export type fetchMaintenanceGroupsActionType = Awaited<ReturnType<typeof fetchMaintenanceGroupsAction>>;

/** Tipos de reparación de la empresa activa, para armar los grupos. */
export const fetchTypesOfRepairAction = async () => {
  try {
    await requireConfigPermission('maintenance_groups', 'view');
    const companyId = await getActiveCompanyId();

    const data = await prisma.types_of_repairs.findMany({
      where: withCompany({ id: { not: getDiagnosticRepairTypeId(companyId) } }, companyId),
      select: { id: true, name: true },
      orderBy: { created_at: 'desc' },
    });

    return { types: data, error: null, forbidden: false };
  } catch (error) {
    logger.error('Error al obtener los tipos de reparación', { data: { error } });
    return { types: [], error: errorMessage(error), forbidden: error instanceof ConfigPermissionError };
  }
};
export type fetchTypesOfRepairActionType = Awaited<ReturnType<typeof fetchTypesOfRepairAction>>;

/** Grupo puntual de la empresa activa, con los ids de sus tipos de reparación. */
export const fetchMaintenanceGroupByIdAction = async (groupId: string) => {
  try {
    await requireConfigPermission('maintenance_groups', 'view');
    uuidSchema.parse(groupId);
    const companyId = await getActiveCompanyId();
    await assertGroupInActiveCompany(groupId, companyId);

    const group = await prisma.maintenance_request_groups.findUnique({
      where: { id: groupId, company_id: companyId },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        maintenance_group_type_of_repairs: { select: { type_id: true } },
      },
    });

    return { group, error: null, forbidden: false };
  } catch (error) {
    logger.error('Error al obtener el grupo de reparaciones', { data: { error, groupId } });
    return { group: null, error: errorMessage(error), forbidden: error instanceof ConfigPermissionError };
  }
};
