import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId, isSessionAnonymous } from '@/shared/lib/session';
import { cache } from 'react';

/**
 * Perímetro de Ropa de trabajo.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público. La feature tiene dos
 * entradas con perímetros distintos:
 *
 * - El panel `/clothing` (ruta propia del operario): la empresa sale del **empleado
 *   vinculado a la sesión**, nunca de la cookie ni de un `companyId` del cliente. Todas
 *   las actions del asistente de entrega pasan por `requireClothingOperator()`.
 * - Las tabs del dashboard (marcas, talles, artículos, entregas): empresa activa de la
 *   sesión (`getActiveCompanyId()`), como el resto del sistema.
 *
 * Los ids de recursos que manda el cliente (`itemId`, `brandId`, `sizeId`, `employeeId`,
 * `deliveryId`) sólo se aceptan si pertenecen a esa empresa: las guardas de abajo son las
 * que faltaban, porque las queries escribían y leían por id tal cual venía.
 *
 * Módulo server-only (NO son Server Actions).
 */

export interface ClothingOperator {
  /** `profile.credential_id` del usuario de sesión. */
  userId: string;
  /** `profile.id`: actor de los movimientos de stock de las entregas (Almacenes etapa 5). */
  profileId: string;
  employeeId: string;
  employeeName: string;
  employeeFile: string | null;
  companyId: string;
}

/**
 * Operario de ropa de la sesión, o `null` si la sesión no llega a serlo (sin usuario, sin
 * profile, sin empleado vinculado o sin empresa).
 *
 * Memoizado por request con React `cache()`.
 */
export const getClothingOperator = cache(async (): Promise<ClothingOperator | null> => {
  const credentialId = await getSessionUserId();
  if (!credentialId) return null;

  // La sesión ANÓNIMA del QR de mantenimiento también tiene un profile con `employee_id`
  // (ver `completeMaintenanceEmployeeAnonymousSession`), pero no es un usuario: a este panel
  // se entra con email y contraseña. Sin este corte, escanear un QR y tipear un CUIL abriría
  // el panel de otra persona.
  if (await isSessionAnonymous()) return null;


  const profile = await prisma.profile.findUnique({
    where: { credential_id: credentialId },
    select: { id: true, employee_id: true },
  });
  if (!profile?.employee_id) return null;

  const employee = await prisma.employees.findUnique({
    where: { id: profile.employee_id },
    select: { id: true, firstname: true, lastname: true, file: true, company_id: true },
  });
  if (!employee?.company_id) return null;

  return {
    userId: credentialId,
    profileId: profile.id,
    employeeId: employee.id,
    employeeName: `${employee.lastname} ${employee.firstname}`.trim(),
    employeeFile: employee.file,
    companyId: employee.company_id,
  };
});

/** Ídem, pero lanza: lo usan las actions del panel, que siempre requieren un operario. */
export async function requireClothingOperator(): Promise<ClothingOperator> {
  const operator = await getClothingOperator();
  if (!operator) throw new Error('No hay una sesión de ropa de trabajo con un empleado vinculado');
  return operator;
}

/** Empresa del operario de ropa (atajo para las actions que sólo necesitan el id). */
export async function getClothingOperatorCompanyId(): Promise<string> {
  const operator = await requireClothingOperator();
  return operator.companyId;
}

/** `employeeId` del cliente: sólo se acepta si es un empleado activo de la empresa dada. */
export async function assertEmployeeInCompany(employeeId: string, companyId: string): Promise<void> {
  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId, is_active: true },
    select: { id: true },
  });
  if (!employee) throw new Error('El empleado no pertenece a la empresa activa');
}

/** `itemId` del cliente: sólo se acepta si el artículo es de la empresa dada. */
export async function assertClothingItemInCompany(itemId: string, companyId: string): Promise<void> {
  const item = await prisma.clothing_items.findFirst({
    where: { id: itemId, company_id: companyId },
    select: { id: true },
  });
  if (!item) throw new Error('El artículo de ropa no pertenece a la empresa activa');
}

/** `brandId` del cliente: sólo se acepta si la marca es de la empresa dada. */
export async function assertClothingBrandInCompany(brandId: string, companyId: string): Promise<void> {
  const brand = await prisma.clothing_brands.findFirst({
    where: { id: brandId, company_id: companyId },
    select: { id: true },
  });
  if (!brand) throw new Error('La marca de ropa no pertenece a la empresa activa');
}

/** `sizeId` del cliente: sólo se acepta si el talle es de la empresa dada. */
export async function assertClothingSizeInCompany(sizeId: string, companyId: string): Promise<void> {
  const size = await prisma.clothing_sizes.findFirst({
    where: { id: sizeId, company_id: companyId },
    select: { id: true },
  });
  if (!size) throw new Error('El talle de ropa no pertenece a la empresa activa');
}

/**
 * Exige que TODOS los pares marca/talle sean de la empresa dada.
 *
 * Lo pide `setItemBrandSizes`, que recibe el set completo desde el formulario: sin esta
 * guarda se podían colgar de un artículo marcas o talles de otra empresa (la FK sola no
 * distingue de quién es cada uno).
 *
 * Lanza en vez de descartar los pares ajenos: el formulario sólo ofrece opciones propias,
 * así que un par de otra empresa es manipulación, no un error de carga — y guardar el
 * resto en silencio dejaría al usuario creyendo que se grabó lo que mandó.
 */
export async function assertBrandSizePairsInCompany(
  pairs: readonly { brandId: string; sizeId: string }[],
  companyId: string
): Promise<void> {
  if (pairs.length === 0) return;

  const brandIds = [...new Set(pairs.map((pair) => pair.brandId))];
  const sizeIds = [...new Set(pairs.map((pair) => pair.sizeId))];

  const [brands, sizes] = await Promise.all([
    prisma.clothing_brands.findMany({ where: { id: { in: brandIds }, company_id: companyId }, select: { id: true } }),
    prisma.clothing_sizes.findMany({ where: { id: { in: sizeIds }, company_id: companyId }, select: { id: true } }),
  ]);

  if (brands.length !== brandIds.length) throw new Error('Alguna marca de ropa no pertenece a la empresa activa');
  if (sizes.length !== sizeIds.length) throw new Error('Algún talle de ropa no pertenece a la empresa activa');
}

/**
 * `warehouseId` del cliente (deposito del que sale una entrega, Almacenes etapa 5): solo se
 * acepta si es un deposito ACTIVO de la empresa dada.
 */
export async function assertWarehouseInCompany(warehouseId: string, companyId: string): Promise<void> {
  const warehouse = await prisma.warehouses.findFirst({
    where: { id: warehouseId, company_id: companyId, is_active: true },
    select: { id: true },
  });
  if (!warehouse) throw new Error('El depósito no existe, está inactivo o no es de la empresa');
}
