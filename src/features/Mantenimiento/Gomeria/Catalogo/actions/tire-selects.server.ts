'use server';

import { requireAnyGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Catalogo/selects');

/** Quien puede ver el catálogo o cargar/editar cubiertas usa los desplegables de sus formularios. */
const CATALOG_SELECT_ACCESS = [
  ['catalogo_cubiertas', 'view'],
  ['catalogo_cubiertas', 'create'],
  ['catalogo_cubiertas', 'update'],
] as const;

/** Depósitos activos de la empresa, para el alta y para devolver cubiertas al stock. */
export async function getTireWarehousesForSelect() {
  const companyId = await requireAnyGomeriaPermission(CATALOG_SELECT_ACCESS);
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/** Marcas de la empresa activa, para los formularios del dashboard. */
export async function getTireBrandsForSelect() {
  logger.debug('Fetching tire brands for select');
  const companyId = await requireAnyGomeriaPermission([...CATALOG_SELECT_ACCESS, ['marcas_cubiertas', 'view']]);
  try {
    return await prisma.tire_brands.findMany({
      where: { company_id: companyId, is_active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  } catch (error) {
    logger.error('Error fetching tire brands for select', { data: { error } });
    throw error;
  }
}
