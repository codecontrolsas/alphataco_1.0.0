'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Equipos/EquipoID/customer-catalog-actions');

/**
 * Catálogos de clientes/contratos que consumen la ficha de vehículos, equipamientos y el
 * preparte. Todos acotados a la empresa activa (`withCompany`): antes PostgREST devolvía los
 * de todas las empresas y confiaba en RLS.
 */

/** Contratos (servicios) activos de un cliente de la empresa activa. */
export async function fetchContractsByClientId(clientId: string) {
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.customer_services.findMany({
      where: withCompany({ customer_id: clientId, is_active: true }, companyId),
      select: { id: true, service_name: true },
      orderBy: { service_name: 'asc' },
    });
  } catch (error) {
    logger.error('Error fetching contracts', { data: { error, clientId } });
    throw error;
  }
}

/** Todos los contratos (servicios) activos de la empresa activa. */
export async function fetchAllContracts() {
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.customer_services.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, service_name: true },
      orderBy: { service_name: 'asc' },
    });
  } catch (error) {
    logger.error('Error fetching contracts', { data: { error } });
    throw error;
  }
}

/** Clientes activos de la empresa activa para el MultiSelect "Afectado a". */
export async function fetchAllContractorForVehicles() {
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.customers.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error fetching contractor companies for vehicles', { data: { error } });
    throw error;
  }
}
