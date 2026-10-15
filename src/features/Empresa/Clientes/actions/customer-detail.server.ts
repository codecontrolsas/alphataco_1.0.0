'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { areaInclude, serializeArea } from '../lib/area-row';
import { hasAnyComercialPermission } from '../lib/require-permission.server';
import { SECTOR_SELECT, serializeSector } from '../lib/sector-row';
import { serializeCustomer } from '../lib/serializers';

const logger = new Logger('features/Empresa/Clientes/customer-detail');

/**
 * Datos de la ficha de UN cliente. Cada pestaña de la ficha pide los suyos al abrirse (React Query):
 * antes la pantalla cargaba de entrada todas las áreas, sectores y contratos de la empresa.
 */

/** Pestañas que dan acceso a ver el encabezado de la ficha (nombre y resumen del cliente). */
const HEADER_TABS = ['customers', 'detalle-cliente'] as const;

/** Un cliente de la empresa activa para la ficha, o `null` si no existe o no pertenece. */
export async function getCustomerDetail(customerId: string) {
  if (!(await hasAnyComercialPermission(HEADER_TABS, 'view'))) {
    throw new Error('No tenés permiso para ver este cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    const row = await prisma.customers.findFirst({ where: { id: customerId, company_id: companyId } });
    return row ? serializeCustomer(row) : null;
  } catch (error) {
    logger.error('Error al obtener el cliente', { data: { error, customerId } });
    throw new Error('No se pudo cargar el cliente');
  }
}

/**
 * Tarjetas del encabezado de la ficha. Son solo conteos, en paralelo: ninguna trae filas.
 *
 * "Certificaciones sin facturar" son las confirmadas (las únicas facturables); las facturadas y las
 * anuladas no cuentan.
 */
export async function getCustomerSummary(customerId: string) {
  if (!(await hasAnyComercialPermission(HEADER_TABS, 'view'))) {
    throw new Error('No tenés permiso para ver este cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    const owned = { customers: { company_id: companyId } };
    const [employees, equipment, activeContracts, unbilledCertifications] = await Promise.all([
      prisma.contractor_employee.count({ where: { contractor_id: customerId, ...owned } }),
      prisma.contractor_equipment.count({ where: { contractor_id: customerId, ...owned } }),
      prisma.customer_services.count({ where: { customer_id: customerId, is_active: true, ...owned } }),
      prisma.certifications.count({ where: { customer_id: customerId, company_id: companyId, status: 'confirmada' } }),
    ]);
    return { employees, equipment, activeContracts, unbilledCertifications };
  } catch (error) {
    logger.error('Error al obtener el resumen del cliente', { data: { error, customerId } });
    throw new Error('No se pudo cargar el resumen del cliente');
  }
}

// Mismo include que `getCustomerServices` (la tabla de contratos espera esa forma).
const contractInclude = {
  customers: { select: { id: true, name: true } },
  service_areas: {
    select: {
      area_id: true,
      areas_cliente: { select: { id: true, nombre: true, descripcion_corta: true } },
    },
  },
  service_sectors: {
    select: { sector_id: true, sectors: { select: { id: true, name: true } } },
  },
} as const;

/**
 * Pestaña "Contratos": los contratos del cliente más las áreas, sectores y unidades de medida que
 * necesitan sus formularios (solo los de este cliente).
 */
export async function getCustomerContractsData(customerId: string) {
  if (!(await checkPermissionServer('comercial', 'service', 'view'))) {
    throw new Error('No tenés permiso para ver los contratos');
  }
  const companyId = await getActiveCompanyId();
  try {
    const owned = { customers: { company_id: companyId } };
    const [services, areas, sectors, measureUnits] = await Promise.all([
      prisma.customer_services.findMany({
        where: { customer_id: customerId, ...owned },
        include: contractInclude,
        orderBy: { service_name: 'asc' },
      }),
      prisma.areas_cliente.findMany({
        where: { customer_id: customerId, ...owned },
        include: areaInclude,
        orderBy: { nombre: 'asc' },
      }),
      prisma.sectors.findMany({
        where: { customer_id: customerId, ...owned },
        select: SECTOR_SELECT,
        orderBy: { name: 'asc' },
      }),
      prisma.measure_units.findMany({ orderBy: { unit: 'asc' } }),
    ]);

    return {
      services,
      areas: areas.map(serializeArea),
      sectors: sectors.map(serializeSector),
      measureUnits,
    };
  } catch (error) {
    logger.error('Error al obtener los contratos del cliente', { data: { error, customerId } });
    throw new Error('No se pudieron cargar los contratos del cliente');
  }
}
