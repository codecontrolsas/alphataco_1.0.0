'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { syncClothingMaterials } from '@/features/Warehouses/lib/clothing-materials';
import {
  assertBrandSizePairsInCompany,
  assertClothingBrandInCompany,
  assertClothingItemInCompany,
  assertClothingSizeInCompany,
} from './perimeter';

const logger = new Logger('features/Clothing/catalog');

// ============================================================================
// BRANDS
// ============================================================================

/** Crea una marca de ropa en la empresa activa. */
export async function createClothingBrand(name: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Creating clothing brand', { data: { name, companyId } });

  try {
    return await prisma.clothing_brands.create({ data: { name, company_id: companyId } });
  } catch (error) {
    logger.error('Error creating clothing brand', { data: { error, name } });
    throw error;
  }
}

/**
 * Renombra una marca de ropa.
 * Perímetro: la marca tiene que ser de la empresa activa; antes se escribía por id suelto.
 */
export async function updateClothingBrand(id: string, name: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Updating clothing brand', { data: { id, name } });

  try {
    await assertClothingBrandInCompany(id, companyId);
    // El nombre del material de cada combinacion lleva la marca (Almacenes etapa 5).
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.clothing_brands.update({ where: { id }, data: { name, updated_at: new Date() } });
      await syncClothingMaterials(tx, companyId, { brandId: id });
      return brand;
    });
  } catch (error) {
    logger.error('Error updating clothing brand', { data: { error, id, name } });
    throw error;
  }
}

/** Activa/desactiva una marca de ropa de la empresa activa. */
export async function toggleClothingBrandActive(id: string, isActive: boolean) {
  const companyId = await getActiveCompanyId();
  logger.debug('Toggling clothing brand active status', { data: { id, isActive } });

  try {
    await assertClothingBrandInCompany(id, companyId);
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.clothing_brands.update({ where: { id }, data: { is_active: isActive, updated_at: new Date() } });
      await syncClothingMaterials(tx, companyId, { brandId: id });
      return brand;
    });
  } catch (error) {
    logger.error('Error toggling clothing brand active status', { data: { error, id, isActive } });
    throw error;
  }
}

// ============================================================================
// SIZES
// ============================================================================

/** Crea un talle de ropa en la empresa activa. */
export async function createClothingSize(name: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Creating clothing size', { data: { name, companyId } });

  try {
    return await prisma.clothing_sizes.create({ data: { name, company_id: companyId } });
  } catch (error) {
    logger.error('Error creating clothing size', { data: { error, name } });
    throw error;
  }
}

/** Renombra un talle de ropa de la empresa activa. */
export async function updateClothingSize(id: string, name: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Updating clothing size', { data: { id, name } });

  try {
    await assertClothingSizeInCompany(id, companyId);
    return await prisma.$transaction(async (tx) => {
      const size = await tx.clothing_sizes.update({ where: { id }, data: { name, updated_at: new Date() } });
      await syncClothingMaterials(tx, companyId, { sizeId: id });
      return size;
    });
  } catch (error) {
    logger.error('Error updating clothing size', { data: { error, id, name } });
    throw error;
  }
}

/** Activa/desactiva un talle de ropa de la empresa activa. */
export async function toggleClothingSizeActive(id: string, isActive: boolean) {
  const companyId = await getActiveCompanyId();
  logger.debug('Toggling clothing size active status', { data: { id, isActive } });

  try {
    await assertClothingSizeInCompany(id, companyId);
    return await prisma.$transaction(async (tx) => {
      const size = await tx.clothing_sizes.update({ where: { id }, data: { is_active: isActive, updated_at: new Date() } });
      await syncClothingMaterials(tx, companyId, { sizeId: id });
      return size;
    });
  } catch (error) {
    logger.error('Error toggling clothing size active status', { data: { error, id, isActive } });
    throw error;
  }
}

// ============================================================================
// ITEMS
// ============================================================================

/** Crea un artículo de ropa en la empresa activa. */
export async function createClothingItem(data: { name: string; code?: string; description?: string }) {
  const companyId = await getActiveCompanyId();
  logger.debug('Creating clothing item', { data: { name: data.name, companyId } });

  try {
    return await prisma.clothing_items.create({
      data: {
        name: data.name,
        code: data.code ?? null,
        description: data.description ?? null,
        company_id: companyId,
      },
    });
  } catch (error) {
    logger.error('Error creating clothing item', { data: { error, itemData: data } });
    throw error;
  }
}

/** Edita un artículo de ropa de la empresa activa. */
export async function updateClothingItem(id: string, data: { name: string; code?: string; description?: string }) {
  const companyId = await getActiveCompanyId();
  logger.debug('Updating clothing item', { data: { id, name: data.name } });

  try {
    await assertClothingItemInCompany(id, companyId);
    // El codigo del material no cambia (es estable); el nombre si (Almacenes etapa 5).
    return await prisma.$transaction(async (tx) => {
      const item = await tx.clothing_items.update({
        where: { id },
        data: {
          name: data.name,
          code: data.code ?? null,
          description: data.description ?? null,
          updated_at: new Date(),
        },
      });
      await syncClothingMaterials(tx, companyId, { itemId: id });
      return item;
    });
  } catch (error) {
    logger.error('Error updating clothing item', { data: { error, id, itemData: data } });
    throw error;
  }
}

/** Activa/desactiva un artículo de ropa de la empresa activa. */
export async function toggleClothingItemActive(id: string, isActive: boolean) {
  const companyId = await getActiveCompanyId();
  logger.debug('Toggling clothing item active status', { data: { id, isActive } });

  try {
    await assertClothingItemInCompany(id, companyId);
    return await prisma.$transaction(async (tx) => {
      const item = await tx.clothing_items.update({ where: { id }, data: { is_active: isActive, updated_at: new Date() } });
      await syncClothingMaterials(tx, companyId, { itemId: id });
      return item;
    });
  } catch (error) {
    logger.error('Error toggling clothing item active status', { data: { error, id, isActive } });
    throw error;
  }
}

// ============================================================================
// ITEM BRAND SIZES (pivot)
// ============================================================================

/**
 * Combinaciones marca/talle de un artículo, con los nombres para mostrar.
 * Perímetro: el artículo tiene que ser de la empresa activa.
 */
export async function getItemBrandSizes(itemId: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Getting item brand sizes', { data: { itemId } });

  try {
    await assertClothingItemInCompany(itemId, companyId);

    const [entries, materials] = await Promise.all([
      prisma.clothing_item_brand_sizes.findMany({
        where: { clothing_item_id: itemId },
        include: {
          clothing_brands: { select: { id: true, name: true } },
          clothing_sizes: { select: { id: true, name: true } },
        },
        orderBy: [{ clothing_brands: { name: 'asc' } }, { clothing_sizes: { name: 'asc' } }],
      }),
      // Material de stock de cada combinacion y su stock total (Almacenes etapa 5). Solo
      // cantidades: los costos no salen de esta pantalla.
      prisma.clothing_item_materials.findMany({
        where: { company_id: companyId, clothing_item_id: itemId },
        select: {
          clothing_brand_id: true,
          clothing_size_id: true,
          material: { select: { code: true, stock_balances: { select: { quantity: true } } } },
        },
      }),
    ]);
    const byCombination = new Map(
      materials.map((m) => [
        `${m.clothing_brand_id}|${m.clothing_size_id}`,
        {
          code: m.material.code,
          stock: String(m.material.stock_balances.reduce((acc, b) => acc + Number(b.quantity), 0)),
        },
      ])
    );
    return entries.map((entry) => ({
      ...entry,
      material: byCombination.get(`${entry.clothing_brand_id}|${entry.clothing_size_id}`) ?? null,
    }));
  } catch (error) {
    logger.error('Error getting item brand sizes', { data: { error, itemId } });
    throw error;
  }
}

type BrandSizePair = { brandId: string; sizeId: string };

/**
 * Altas y bajas EXPLÍCITAS de combinaciones marca/talle de un artículo (regla del repo para M:M:
 * la ausencia de un par nunca implica borrarlo). El formulario calcula la diferencia contra la
 * matriz que leyó del servidor al abrirse.
 *
 * Cada combinación tiene su material de stock (Almacenes etapa 5): quitarla lo desactiva, nunca lo
 * borra, y volver a habilitarla recupera el mismo material.
 *
 * Perímetro: el artículo y TODOS los pares tienen que ser de la empresa activa. Si alguno no lo
 * es, falla entera: el formulario sólo ofrece opciones propias, así que un par ajeno es
 * manipulación, y un guardado parcial dejaría al usuario creyendo que se grabó lo que mandó.
 */
export async function setItemBrandSizes(itemId: string, changes: { add: BrandSizePair[]; remove: BrandSizePair[] }) {
  const companyId = await getActiveCompanyId();
  logger.debug('Updating item brand sizes', { data: { itemId, add: changes.add.length, remove: changes.remove.length } });

  try {
    await assertClothingItemInCompany(itemId, companyId);
    await assertBrandSizePairsInCompany([...changes.add, ...changes.remove], companyId);

    await prisma.$transaction(async (tx) => {
      if (changes.remove.length > 0) {
        await tx.clothing_item_brand_sizes.deleteMany({
          where: {
            clothing_item_id: itemId,
            OR: changes.remove.map((p) => ({ clothing_brand_id: p.brandId, clothing_size_id: p.sizeId })),
          },
        });
      }
      if (changes.add.length > 0) {
        await tx.clothing_item_brand_sizes.createMany({
          data: changes.add.map((p) => ({ clothing_item_id: itemId, clothing_brand_id: p.brandId, clothing_size_id: p.sizeId })),
          skipDuplicates: true,
        });
      }
      await syncClothingMaterials(tx, companyId, { itemId });
    });
  } catch (error) {
    logger.error('Error setting item brand sizes', { data: { error, itemId } });
    throw error;
  }
}

// ============================================================================
// LISTS FOR COMBOBOXES
// ============================================================================

/** Marcas activas de la empresa activa, para los selectores. */
export async function getActiveClothingBrands() {
  const companyId = await getActiveCompanyId();
  logger.debug('Getting active clothing brands', { data: { companyId } });

  try {
    return await prisma.clothing_brands.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error getting active clothing brands', { data: { error } });
    throw error;
  }
}

/** Talles activos de la empresa activa, para los selectores. */
export async function getActiveClothingSizes() {
  const companyId = await getActiveCompanyId();
  logger.debug('Getting active clothing sizes', { data: { companyId } });

  try {
    return await prisma.clothing_sizes.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error getting active clothing sizes', { data: { error } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ClothingBrand = Awaited<ReturnType<typeof createClothingBrand>>;
export type ClothingSize = Awaited<ReturnType<typeof createClothingSize>>;
export type ClothingItem = Awaited<ReturnType<typeof createClothingItem>>;

export type ItemBrandSizeEntry = Awaited<ReturnType<typeof getItemBrandSizes>>[number];

export type ActiveClothingBrand = Awaited<ReturnType<typeof getActiveClothingBrands>>[number];
export type ActiveClothingSize = Awaited<ReturnType<typeof getActiveClothingSizes>>[number];
