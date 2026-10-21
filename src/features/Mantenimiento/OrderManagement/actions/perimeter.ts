import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Perímetro de las mutaciones de gestión de taller.
 *
 * Sin RLS, cada `'use server'` exportado es un endpoint público: antes de escribir hay que
 * verificar que el pedido (o el ítem) pertenezca a la empresa activa. Devuelve la empresa
 * para que quien llama la reuse en los registros derivados.
 *
 * Módulo server-only (NO es una Server Action).
 */
export async function assertOrderInActiveCompany(orderId: string): Promise<string> {
  const companyId = await getActiveCompanyId();

  const order = await prisma.maintenance_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: { id: true },
  });

  if (!order) throw new Error('El pedido de mantenimiento no pertenece a la empresa activa');

  return companyId;
}

/**
 * Filtra ids de tipos de reparación dejando sólo los de la empresa dada.
 *
 * Los ids llegan del cliente: sin este filtro se podían colgar del pedido tipos de otra
 * empresa (la FK sola no distingue de quién es cada tipo).
 */
export async function filterRepairTypeIdsForCompany(
  repairTypeIds: readonly string[],
  companyId: string
): Promise<string[]> {
  if (repairTypeIds.length === 0) return [];

  const types = await prisma.types_of_repairs.findMany({
    where: { id: { in: [...repairTypeIds] }, company_id: companyId },
    select: { id: true },
  });

  const valid = new Set(types.map((type) => type.id));
  // Se preserva el orden de entrada: el primero es el que va al campo legacy `repair_type_id`.
  return repairTypeIds.filter((id) => valid.has(id));
}

/** `sectorId` sólo si el sector es de la empresa dada; si no, lanza. */
export async function assertSectorInCompany(sectorId: string, companyId: string): Promise<void> {
  const sector = await prisma.workshop_sectors.findFirst({
    where: { id: sectorId, company_id: companyId },
    select: { id: true },
  });
  if (!sector) throw new Error('El sector de taller no pertenece a la empresa del pedido');
}

/** `workshopId` sólo si el taller es de la empresa dada; si no, lanza. */
export async function assertWorkshopInCompany(workshopId: string, companyId: string): Promise<void> {
  const workshop = await prisma.workshops.findFirst({
    where: { id: workshopId, company_id: companyId },
    select: { id: true },
  });
  if (!workshop) throw new Error('El taller no pertenece a la empresa del pedido');
}
