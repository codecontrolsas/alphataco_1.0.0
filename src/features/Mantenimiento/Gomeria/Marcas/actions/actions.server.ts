'use server';

import { requireGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { assertTireBrandInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { syncTireMaterials } from '@/features/Warehouses/lib/tire-materials';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';

const logger = new Logger('features/Mantenimiento/Gomeria/Marcas');

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Indicá el nombre de la marca').max(100, 'El nombre es demasiado largo'),
});

// ============================================================================
// CRUD ACTIONS
// ============================================================================

/** Alta de marca (permiso `create`): la empresa sale de la sesión, no del formulario. */
export async function createTireBrand(input: { name: string }) {
  logger.debug('Creating tire brand');
  try {
    const data = parseInput(brandSchema, input);
    const companyId = await requireGomeriaPermission('marcas_cubiertas', 'create');
    const existing = await prisma.tire_brands.findFirst({
      where: { name: data.name, company_id: companyId },
    });
    if (existing) {
      throw new Error(`Ya existe una marca con el nombre "${data.name}"`);
    }
    // Cada combinacion tipo + marca es un material de Almacenes (etapa 6): se crean juntos.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.create({ data: { name: data.name, company_id: companyId } });
      await syncTireMaterials(tx, companyId);
      return brand;
    });
  } catch (error) {
    logger.error('Error creating tire brand', { data: { error } });
    throw error;
  }
}

/** Edición de marca (permiso `update`). */
export async function updateTireBrand(id: string, input: { name: string }) {
  logger.debug('Updating tire brand', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    const data = parseInput(brandSchema, input);
    await requireGomeriaPermission('marcas_cubiertas', 'update');
    const companyId = await assertTireBrandInActiveCompany(id);

    const duplicated = await prisma.tire_brands.findFirst({
      where: { name: data.name, company_id: companyId, id: { not: id } },
      select: { id: true },
    });
    if (duplicated) throw new Error(`Ya existe una marca con el nombre "${data.name}"`);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.update({
        where: { id },
        data: { name: data.name },
      });
      await syncTireMaterials(tx, brand.company_id);
      return brand;
    });
  } catch (error) {
    logger.error('Error updating tire brand', { data: { error, id } });
    throw error;
  }
}

/** Activar/desactivar una marca (permiso `update`). */
export async function toggleTireBrandActive(id: string, isActive: boolean) {
  logger.debug('Toggling tire brand active', { data: { id, isActive } });
  try {
    parseInput(uuidSchema, id);
    const active = parseInput(z.boolean(), isActive);
    await requireGomeriaPermission('marcas_cubiertas', 'update');
    await assertTireBrandInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.update({
        where: { id },
        data: { is_active: active },
      });
      await syncTireMaterials(tx, brand.company_id);
      return brand;
    });
  } catch (error) {
    logger.error('Error toggling tire brand active', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type { TireBrandListItem } from './brand-list.server';
