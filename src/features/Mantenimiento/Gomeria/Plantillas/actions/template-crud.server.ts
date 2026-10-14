'use server';

import {
  requireAnyGomeriaPermission,
  requireGomeriaPermission,
} from '@/features/Mantenimiento/Gomeria/shared/access.server';
import {
  assertSubTypeInActiveCompany,
  assertTemplateInActiveCompany,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';

const logger = new Logger('features/Mantenimiento/Gomeria/Plantillas/crud');

// ============================================================================
// SCHEMAS
// ============================================================================

const axleSchema = z.object({
  axle_number: z.number().int().min(1).max(20),
  tires_per_side: z.number().int().min(1).max(4),
  tire_size: z.string().trim().max(40).nullable(),
  is_drive_axle: z.boolean(),
  is_spare: z.boolean(),
});

const templateSchema = z
  .object({
    name: z.string().trim().min(1, 'Indicá el nombre de la plantilla').max(100, 'El nombre es demasiado largo'),
    description: z.string().trim().max(500, 'La descripción es demasiado larga').optional(),
    axles: z.array(axleSchema).max(20, 'La plantilla tiene demasiados ejes'),
  })
  .refine((t) => new Set(t.axles.map((a) => a.axle_number)).size === t.axles.length, {
    message: 'Hay ejes con el mismo número',
    path: ['axles'],
  });

type TemplateInput = z.output<typeof templateSchema>;

function toAxleRows(templateId: string, axles: TemplateInput['axles']) {
  return axles.map((axle) => ({
    template_id: templateId,
    axle_number: axle.axle_number,
    tires_per_side: axle.tires_per_side,
    tire_size: axle.tire_size,
    is_drive_axle: axle.is_drive_axle,
    is_spare: axle.is_spare,
  }));
}

// ============================================================================
// READS
// ============================================================================

/** Plantilla por id (permiso `view`), acotada a la empresa activa. */
export async function getTemplateById(id: string) {
  logger.debug('Fetching template by id', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    const companyId = await requireGomeriaPermission('plantillas_cubiertas', 'view');
    const template = await prisma.tire_templates.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        name: true,
        description: true,
        company_id: true,
        is_active: true,
        created_at: true,
        axles: {
          select: {
            id: true,
            axle_number: true,
            tires_per_side: true,
            tire_size: true,
            is_drive_axle: true,
            is_spare: true,
          },
          orderBy: { axle_number: 'asc' },
        },
      },
    });
    return template;
  } catch (error) {
    logger.error('Error fetching template by id', { data: { error, id } });
    throw error;
  }
}

/** Subtipos de la empresa activa, para el diálogo de asignación de plantillas. */
export async function getSubTypesForTemplateAssign() {
  logger.debug('Fetching sub_types for template assignment');
  try {
    const companyId = await requireAnyGomeriaPermission([
      ['plantillas_cubiertas', 'view'],
      ['plantillas_cubiertas', 'create'],
    ]);
    const subTypes = await prisma.sub_type.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        name: true,
        tire_template_id: true,
        tire_template: { select: { id: true, name: true } },
        type_sub_type_typeTotype: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return subTypes;
  } catch (error) {
    logger.error('Error fetching sub_types for template assignment', { data: { error } });
    throw error;
  }
}

// ============================================================================
// WRITES
// ============================================================================

/** Alta de plantilla (permiso `create`): la empresa sale de la sesión, no del formulario. */
export async function createTemplate(input: z.input<typeof templateSchema>) {
  logger.debug('Creating tire template');
  try {
    const data = parseInput(templateSchema, input);
    const companyId = await requireGomeriaPermission('plantillas_cubiertas', 'create');

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.tire_templates.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          company_id: companyId,
        },
      });

      if (data.axles.length > 0) {
        await tx.tire_template_axles.createMany({ data: toAxleRows(created.id, data.axles) });
      }

      return created;
    });

    return template;
  } catch (error) {
    logger.error('Error creating tire template', { data: { error } });
    throw error;
  }
}

/** Edición de plantilla (permiso `update`). */
export async function updateTemplate(id: string, input: z.input<typeof templateSchema>) {
  logger.debug('Updating tire template', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    const data = parseInput(templateSchema, input);
    await requireGomeriaPermission('plantillas_cubiertas', 'update');
    const companyId = await assertTemplateInActiveCompany(id);

    const template = await prisma.$transaction(async (tx) => {
      const { count } = await tx.tire_templates.updateMany({
        where: { id, company_id: companyId, is_active: true },
        data: {
          name: data.name,
          description: data.description ?? null,
        },
      });
      if (count === 0) throw new Error('La plantilla no existe o fue eliminada');

      // Delete all existing axles and recreate
      await tx.tire_template_axles.deleteMany({ where: { template_id: id } });

      if (data.axles.length > 0) {
        await tx.tire_template_axles.createMany({ data: toAxleRows(id, data.axles) });
      }

      return { id, name: data.name, description: data.description ?? null };
    });

    return template;
  } catch (error) {
    logger.error('Error updating tire template', { data: { error, id } });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new Error('La plantilla ya tiene posiciones generadas en equipos: no se pueden reconfigurar sus ejes');
    }
    throw error;
  }
}

/** Baja lógica de plantilla (permiso `delete`). */
export async function deleteTemplate(id: string) {
  logger.debug('Soft-deleting tire template', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    await requireGomeriaPermission('plantillas_cubiertas', 'delete');
    const companyId = await assertTemplateInActiveCompany(id);

    // Check if any active sub_type uses this template
    const subTypesWithTemplate = await prisma.sub_type.findMany({
      where: { tire_template_id: id, is_active: true },
      select: { id: true, name: true },
    });

    if (subTypesWithTemplate.length > 0) {
      const names = subTypesWithTemplate.map((s) => s.name).join(', ');
      throw new Error(`No se puede eliminar la plantilla porque está asignada a los siguientes subtipos: ${names}`);
    }

    // Check if any active vehicle uses this template as override
    const vehiclesWithTemplate = await prisma.vehicles.findMany({
      where: { tire_template_id: id, is_active: true },
      select: { id: true, domain: true },
    });

    if (vehiclesWithTemplate.length > 0) {
      const domains = vehiclesWithTemplate.map((v) => v.domain ?? 'Sin dominio').join(', ');
      throw new Error(
        `No se puede eliminar la plantilla porque está asignada como personalizada a los siguientes equipos: ${domains}`
      );
    }

    const { count } = await prisma.tire_templates.updateMany({
      where: { id, company_id: companyId, is_active: true },
      data: { is_active: false },
    });
    if (count === 0) throw new Error('La plantilla no existe o ya fue eliminada');
    return { id };
  } catch (error) {
    logger.error('Error deleting tire template', { data: { error, id } });
    throw error;
  }
}

/**
 * Asigna una plantilla a un subtipo. La pantalla lo habilita con `create` de la pestaña
 * (botón "Asignar a subtipo"): el servidor exige la misma acción.
 */
export async function assignTemplateToSubType(subTypeId: string, templateId: string) {
  logger.debug('Assigning template to sub_type', { data: { subTypeId, templateId } });
  try {
    parseInput(uuidSchema, subTypeId);
    parseInput(uuidSchema, templateId);
    await requireGomeriaPermission('plantillas_cubiertas', 'create');
    // El subtipo y la plantilla llegan del cliente: los dos tienen que ser de la empresa activa.
    await assertSubTypeInActiveCompany(subTypeId);
    await assertTemplateInActiveCompany(templateId);

    // Simply update the sub_type's tire_template_id.
    // Vehicle positions are generated lazily (on-demand) when a service order is created.
    await prisma.sub_type.update({
      where: { id: subTypeId },
      data: { tire_template_id: templateId },
    });
  } catch (error) {
    logger.error('Error assigning template to sub_type', { data: { error, subTypeId, templateId } });
    throw error;
  }
}

/** Quita la plantilla de un subtipo (mismo permiso que la asignación). */
export async function unassignTemplateFromSubType(subTypeId: string) {
  logger.debug('Unassigning template from sub_type', { data: { subTypeId } });
  try {
    parseInput(uuidSchema, subTypeId);
    await requireGomeriaPermission('plantillas_cubiertas', 'create');
    await assertSubTypeInActiveCompany(subTypeId);

    await prisma.sub_type.update({
      where: { id: subTypeId },
      data: { tire_template_id: null },
    });
  } catch (error) {
    logger.error('Error unassigning template from sub_type', { data: { error, subTypeId } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type TemplateDetail = Awaited<ReturnType<typeof getTemplateById>>;
export type SubTypeForAssign = Awaited<ReturnType<typeof getSubTypesForTemplateAssign>>[number];
