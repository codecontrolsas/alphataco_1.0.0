'use server';

import {
  assertClothingBrandInCompany,
  assertClothingItemInCompany,
  assertWarehouseInCompany,
  getClothingOperatorCompanyId,
} from '@/features/Clothing/actions/perimeter';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';

const logger = new Logger('features/Clothing/Delivery/queries');

const EMPLOYEE_FOR_DELIVERY_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  file: true,
  cuil: true,
  date_of_admission: true,
  company_positions: { select: { name: true } },
  covenant: { select: { name: true } },
} as const;

/**
 * Empleados activos para el combobox de entrega (hasta 50 resultados).
 *
 * Perímetro: la empresa sale del empleado vinculado a la sesión del operario, no de un
 * `companyId` del cliente — antes el parámetro venía del navegador y cualquier uuid de
 * empresa devolvía su padrón completo con CUIL y legajo.
 */
export async function getEmployeesForDelivery(search?: string) {
  const companyId = await getClothingOperatorCompanyId();
  logger.debug('Getting employees for delivery', { data: { search } });

  try {
    return await prisma.employees.findMany({
      where: withCompany(
        {
          is_active: true,
          ...(search && search.trim().length > 0
            ? {
                OR: [
                  { firstname: { contains: search, mode: 'insensitive' as const } },
                  { lastname: { contains: search, mode: 'insensitive' as const } },
                  { file: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        companyId
      ),
      select: EMPLOYEE_FOR_DELIVERY_SELECT,
      orderBy: { lastname: 'asc' },
      take: 50,
    });
  } catch (error) {
    logger.error('Error getting employees for delivery', { data: { error } });
    throw error;
  }
}

export type EmployeeForDelivery = Awaited<ReturnType<typeof getEmployeesForDelivery>>[number];

/**
 * Un empleado por id para precargar el asistente (deep link `?employee_id=`).
 * Devuelve `null` si no existe, está de baja o no es de la empresa del operario.
 */
export async function getEmployeeForDeliveryById(employeeId: string): Promise<EmployeeForDelivery | null> {
  const companyId = await getClothingOperatorCompanyId();
  logger.debug('Getting employee by ID for delivery pre-load', { data: { employeeId } });

  try {
    return await prisma.employees.findFirst({
      where: { id: employeeId, company_id: companyId, is_active: true },
      select: EMPLOYEE_FOR_DELIVERY_SELECT,
    });
  } catch (error) {
    logger.error('Error getting employee by ID for delivery', { data: { error, employeeId } });
    return null;
  }
}

/** Artículos de ropa activos de la empresa del operario. */
export async function getItemsForDelivery() {
  const companyId = await getClothingOperatorCompanyId();
  logger.debug('Getting items for delivery');

  try {
    return await prisma.clothing_items.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error getting items for delivery', { data: { error } });
    throw error;
  }
}

export type ItemForDelivery = Awaited<ReturnType<typeof getItemsForDelivery>>[number];

/**
 * Marcas con al menos un talle configurado para el artículo dado.
 * Perímetro: el artículo tiene que ser de la empresa del operario.
 */
export async function getBrandsForItem(itemId: string) {
  const companyId = await getClothingOperatorCompanyId();
  logger.debug('Getting brands for item', { data: { itemId } });

  try {
    await assertClothingItemInCompany(itemId, companyId);

    const entries = await prisma.clothing_item_brand_sizes.findMany({
      where: { clothing_item_id: itemId },
      select: { clothing_brands: { select: { id: true, name: true } } },
      distinct: ['clothing_brand_id'],
      orderBy: { clothing_brands: { name: 'asc' } },
    });

    return entries.map((entry) => entry.clothing_brands);
  } catch (error) {
    logger.error('Error getting brands for item', { data: { error, itemId } });
    throw error;
  }
}

export type BrandForItem = Awaited<ReturnType<typeof getBrandsForItem>>[number];

/**
 * Talles disponibles para la combinación artículo + marca, con el stock del depósito elegido
 * (Almacenes etapa 5). Sin depósito, `available` es null. Solo cantidades: sin costos.
 * Perímetro: artículo, marca y depósito tienen que ser de la empresa del operario.
 */
export async function getSizesForItemBrand(itemId: string, brandId: string, warehouseId?: string | null) {
  const companyId = await getClothingOperatorCompanyId();
  logger.debug('Getting sizes for item+brand', { data: { itemId, brandId, warehouseId } });

  try {
    await assertClothingItemInCompany(itemId, companyId);
    await assertClothingBrandInCompany(brandId, companyId);
    if (warehouseId) await assertWarehouseInCompany(warehouseId, companyId);

    const entries = await prisma.clothing_item_brand_sizes.findMany({
      where: { clothing_item_id: itemId, clothing_brand_id: brandId },
      select: { clothing_sizes: { select: { id: true, name: true } } },
      orderBy: { clothing_sizes: { name: 'asc' } },
    });

    // Stock por talle: una consulta para todos los talles de la combinacion.
    const stock = new Map<string, string>();
    if (warehouseId && entries.length > 0) {
      const links = await prisma.clothing_item_materials.findMany({
        where: { company_id: companyId, clothing_item_id: itemId, clothing_brand_id: brandId },
        select: {
          clothing_size_id: true,
          material: {
            select: { stock_balances: { where: { warehouse_id: warehouseId }, select: { quantity: true } } },
          },
        },
      });
      for (const link of links) {
        const total = link.material.stock_balances.reduce((acc, b) => acc + Number(b.quantity), 0);
        stock.set(link.clothing_size_id, String(total));
      }
    }

    return entries.map((entry) => ({
      ...entry.clothing_sizes,
      available: warehouseId ? (stock.get(entry.clothing_sizes.id) ?? '0') : null,
    }));
  } catch (error) {
    logger.error('Error getting sizes for item+brand', { data: { error, itemId, brandId } });
    throw error;
  }
}

/** Depósitos activos de la empresa del operario, para elegir de dónde sale la entrega. */
export async function getDeliveryWarehouses() {
  const companyId = await getClothingOperatorCompanyId();
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export type DeliveryWarehouse = Awaited<ReturnType<typeof getDeliveryWarehouses>>[number];

export type SizeForItemBrand = Awaited<ReturnType<typeof getSizesForItemBrand>>[number];
