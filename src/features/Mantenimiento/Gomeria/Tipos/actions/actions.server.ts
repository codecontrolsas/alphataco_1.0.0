'use server';

import {
  requireAnyGomeriaPermission,
  requireGomeriaPermission,
} from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { assertTireTypeInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { TireTreadType } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { syncTireMaterials } from '@/features/Warehouses/lib/tire-materials';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';

const logger = new Logger('features/Mantenimiento/Gomeria/Tipos');

const tireTypeSchema = z.object({
  name: z.string().trim().min(1, 'Indicá el nombre del tipo').max(100, 'El nombre es demasiado largo'),
  size: z.string().trim().min(1, 'Indicá la medida').max(40, 'La medida es demasiado larga'),
  tread_type: z.nativeEnum(TireTreadType),
});

const updateTireTypeSchema = tireTypeSchema.partial();

// ============================================================================
// CRUD ACTIONS
// ============================================================================

/** Alta de tipo de cubierta (permiso `create`): la empresa sale de la sesión, no del formulario. */
export async function createTireType(input: { name: string; size: string; tread_type: TireTreadType }) {
  logger.debug('Creating tire type');
  try {
    const data = parseInput(tireTypeSchema, input);
    const companyId = await requireGomeriaPermission('tipos_cubiertas', 'create');
    const existing = await prisma.tire_types.findFirst({
      where: {
        size: data.size,
        tread_type: data.tread_type,
        company_id: companyId,
      },
    });
    if (existing) {
      throw new Error(`Ya existe un tipo de cubierta con medida "${data.size}" y tipo de banda "${data.tread_type}"`);
    }
    // Cada combinacion tipo + marca es un material de Almacenes (etapa 6): se crean juntos.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.create({
        data: { name: data.name, size: data.size, tread_type: data.tread_type, company_id: companyId },
      });
      await syncTireMaterials(tx, companyId);
      return tireType;
    });
  } catch (error) {
    logger.error('Error creating tire type', { data: { error } });
    throw error;
  }
}

/** Edición de tipo de cubierta (permiso `update`). */
export async function updateTireType(id: string, input: { name?: string; size?: string; tread_type?: TireTreadType }) {
  logger.debug('Updating tire type', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    const data = parseInput(updateTireTypeSchema, input);
    await requireGomeriaPermission('tipos_cubiertas', 'update');
    await assertTireTypeInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.update({
        where: { id },
        data: {
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.size != null ? { size: data.size } : {}),
          ...(data.tread_type != null ? { tread_type: data.tread_type } : {}),
        },
      });
      await syncTireMaterials(tx, tireType.company_id);
      return tireType;
    });
  } catch (error) {
    logger.error('Error updating tire type', { data: { error, id } });
    throw error;
  }
}

/** Activar/desactivar un tipo (permiso `update`). */
export async function toggleTireTypeActive(id: string, isActive: boolean) {
  logger.debug('Toggling tire type active', { data: { id, isActive } });
  try {
    parseInput(uuidSchema, id);
    const active = parseInput(z.boolean(), isActive);
    await requireGomeriaPermission('tipos_cubiertas', 'update');
    await assertTireTypeInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.update({
        where: { id },
        data: { is_active: active },
      });
      await syncTireMaterials(tx, tireType.company_id);
      return tireType;
    });
  } catch (error) {
    logger.error('Error toggling tire type active', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// SELECT QUERY (for dropdowns in other forms)
// ============================================================================

/** Tipos de la empresa activa, para los formularios del dashboard (catálogo de cubiertas incluido). */
export async function getTireTypesForSelect() {
  logger.debug('Fetching tire types for select');
  try {
    const companyId = await requireAnyGomeriaPermission([
      ['tipos_cubiertas', 'view'],
      ['catalogo_cubiertas', 'view'],
      ['catalogo_cubiertas', 'create'],
      ['catalogo_cubiertas', 'update'],
    ]);
    const data = await prisma.tire_types.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        name: true,
        size: true,
        tread_type: true,
      },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error fetching tire types for select', { data: { error } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type { TireTypeListItem } from './type-list.server';
