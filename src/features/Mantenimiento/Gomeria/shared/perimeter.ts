import 'server-only';

import { getResourceCompanyId, type PrismaLike } from '@/features/Mantenimiento/shared/resource-company';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Perímetro de Gomería.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público, así que la empresa la
 * resuelve el servidor y nunca llega como parámetro del cliente. Gomería tiene DOS
 * perímetros distintos y hay que elegir el que corresponde a cada action:
 *
 * 1. **Perímetro de sesión** (`...InActiveCompany`): pantallas del dashboard, donde el
 *    usuario tiene empresa activa. Se usa en los listados y en el ABM del catálogo.
 *
 * 2. **Perímetro por recurso** (`...InCompany`, `getServiceOrderCompanyId`): la operación
 *    de gomería también corre desde el QR anónimo (`/maintenance/equipment/[id]/...`),
 *    donde el operario tiene sesión pero NO es miembro de la empresa. Ahí la empresa sale
 *    del vehículo o de la orden y las validaciones son "todo lo que toca la orden es de la
 *    misma empresa que la orden". Usar el perímetro de sesión en estas actions rompe el QR.
 *
 * Módulo server-only (NO es una Server Action).
 */

// ============================================================================
// PERÍMETRO POR RECURSO (QR + dashboard)
// ============================================================================

/** Empresa dueña de la orden de gomería. Lanza si la orden no existe. */
export async function getServiceOrderCompanyId(client: PrismaLike, orderId: string): Promise<string> {
  const order = await client.tire_service_orders.findUnique({
    where: { id: orderId },
    select: { company_id: true },
  });
  if (!order) throw new Error('No se encontró la orden de gomería');
  return order.company_id;
}

/** Empresa dueña del vehículo. Lanza si el vehículo no existe o no tiene empresa. */
export async function getVehicleCompanyId(client: PrismaLike, vehicleId: string): Promise<string> {
  return getResourceCompanyId(client, 'vehicle', vehicleId);
}

/** Lanza si el vehículo no pertenece a `companyId`. */
export async function assertVehicleInCompany(client: PrismaLike, vehicleId: string, companyId: string): Promise<void> {
  const vehicle = await client.vehicles.findFirst({
    where: { id: vehicleId, company_id: companyId },
    select: { id: true },
  });
  if (!vehicle) throw new Error('El equipo no pertenece a la empresa de la orden');
}

/** Lanza si la cubierta no pertenece a `companyId`. */
export async function assertTireInCompany(client: PrismaLike, tireId: string, companyId: string): Promise<void> {
  const tire = await client.tires.findFirst({
    where: { id: tireId, company_id: companyId },
    select: { id: true },
  });
  if (!tire) throw new Error('La cubierta no pertenece a la empresa de la orden');
}

/**
 * Lanza si la marca o el tipo de cubierta no son de `companyId`.
 *
 * Los dos ids llegan del formulario: sin este chequeo se podía dar de alta una cubierta
 * colgada de la marca o del tipo de otra empresa (la FK sola no distingue de quién es cada
 * catálogo).
 */
export async function assertTireCatalogRefsInCompany(
  client: PrismaLike,
  refs: { brandId: string; tireTypeId: string },
  companyId: string
): Promise<void> {
  const [brand, tireType] = await Promise.all([
    client.tire_brands.findFirst({ where: { id: refs.brandId, company_id: companyId }, select: { id: true } }),
    client.tire_types.findFirst({ where: { id: refs.tireTypeId, company_id: companyId }, select: { id: true } }),
  ]);
  if (!brand) throw new Error('La marca de cubierta no pertenece a la empresa');
  if (!tireType) throw new Error('El tipo de cubierta no pertenece a la empresa');
}

/** Lanza si el depósito no pertenece a `companyId` (el id llega del formulario). */
export async function assertWarehouseInCompany(
  client: PrismaLike,
  warehouseId: string,
  companyId: string
): Promise<void> {
  const warehouse = await client.warehouses.findFirst({
    where: { id: warehouseId, company_id: companyId },
    select: { id: true },
  });
  if (!warehouse) throw new Error('El depósito no pertenece a la empresa');
}

// ============================================================================
// PERÍMETRO DE SESIÓN (dashboard)
// ============================================================================

/** La orden tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertServiceOrderInActiveCompany(orderId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const order = await prisma.tire_service_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: { id: true },
  });
  if (!order) throw new Error('La orden de gomería no pertenece a la empresa activa');
  return companyId;
}

/** El vehículo tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertVehicleInActiveCompany(vehicleId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  await assertVehicleInCompany(prisma, vehicleId, companyId);
  return companyId;
}

/** La cubierta tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertTireInActiveCompany(tireId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const tire = await prisma.tires.findFirst({
    where: { id: tireId, company_id: companyId },
    select: { id: true },
  });
  if (!tire) throw new Error('La cubierta no pertenece a la empresa activa');
  return companyId;
}

/** La marca tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertTireBrandInActiveCompany(brandId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const brand = await prisma.tire_brands.findFirst({
    where: { id: brandId, company_id: companyId },
    select: { id: true },
  });
  if (!brand) throw new Error('La marca de cubierta no pertenece a la empresa activa');
  return companyId;
}

/** El tipo de cubierta tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertTireTypeInActiveCompany(tireTypeId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const tireType = await prisma.tire_types.findFirst({
    where: { id: tireTypeId, company_id: companyId },
    select: { id: true },
  });
  if (!tireType) throw new Error('El tipo de cubierta no pertenece a la empresa activa');
  return companyId;
}

/** La plantilla tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertTemplateInActiveCompany(templateId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const template = await prisma.tire_templates.findFirst({
    where: { id: templateId, company_id: companyId },
    select: { id: true },
  });
  if (!template) throw new Error('La plantilla de cubiertas no pertenece a la empresa activa');
  return companyId;
}

/** El subtipo tiene que ser de la empresa activa. Devuelve la empresa. */
export async function assertSubTypeInActiveCompany(subTypeId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const subType = await prisma.sub_type.findFirst({
    where: { id: subTypeId, company_id: companyId },
    select: { id: true },
  });
  if (!subType) throw new Error('El subtipo no pertenece a la empresa activa');
  return companyId;
}
