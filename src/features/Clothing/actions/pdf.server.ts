'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Clothing/pdf');

/** Datos de la constancia de entrega. Compartido por la descarga simple y la masiva. */
const DELIVERY_PDF_SELECT = {
  id: true,
  delivery_type: true,
  delivered_at: true,
  signature_url: true,
  notes: true,
  // Almacenes etapa 5: una entrega anulada se imprime marcada.
  cancelled_at: true,
  cancel_reason: true,
  clothing_delivery_items: {
    select: {
      quantity: true,
      has_certificate: true,
      clothing_items: { select: { name: true, code: true, description: true } },
      clothing_brands: { select: { name: true } },
      clothing_sizes: { select: { name: true } },
    },
  },
  employees_clothing_deliveries_employee_idToemployees: {
    select: {
      firstname: true,
      lastname: true,
      document_number: true,
      file: true,
      cuil: true,
      postal_code: true,
      company_positions: { select: { name: true } },
    },
  },
  employees_clothing_deliveries_delivered_by_idToemployees: {
    select: { firstname: true, lastname: true, file: true },
  },
  company: {
    select: {
      company_name: true,
      company_cuit: true,
      address: true,
      company_logo: true,
      cities: { select: { name: true } },
      provinces: { select: { name: true } },
    },
  },
} as const;

/**
 * Datos de una constancia de entrega para el PDF.
 *
 * Perímetro: la entrega tiene que ser de la empresa activa. Antes se leía por id suelto, y
 * la constancia lleva CUIL, DNI y legajo del empleado además de los datos de la empresa:
 * con el id de una entrega ajena salía el PDF entero.
 */
export async function getDeliveryForPdf(deliveryId: string) {
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching delivery for PDF', { data: { deliveryId } });

  try {
    const delivery = await prisma.clothing_deliveries.findFirst({
      where: { id: deliveryId, company_id: companyId },
      select: DELIVERY_PDF_SELECT,
    });

    if (!delivery) throw new Error('La entrega no pertenece a la empresa activa');

    return delivery;
  } catch (error) {
    logger.error('Error fetching delivery for PDF', { data: { error, deliveryId } });
    throw error;
  }
}

/**
 * Datos de varias constancias en una sola query (descarga masiva en ZIP).
 * Ordena por fecha de entrega ascendente para que el ZIP salga en orden.
 *
 * Perímetro: filtra por la empresa activa, así que los ids ajenos simplemente no vuelven.
 */
export async function getDeliveriesForPdfBulk(deliveryIds: string[]) {
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching deliveries for bulk PDF', { data: { count: deliveryIds.length } });

  if (deliveryIds.length === 0) return [];

  try {
    return await prisma.clothing_deliveries.findMany({
      where: { id: { in: deliveryIds }, company_id: companyId },
      orderBy: { delivered_at: 'asc' },
      select: DELIVERY_PDF_SELECT,
    });
  } catch (error) {
    logger.error('Error fetching deliveries for bulk PDF', { data: { error, count: deliveryIds.length } });
    throw error;
  }
}

export type DeliveryPdfData = Awaited<ReturnType<typeof getDeliveryForPdf>>;
export type DeliveryBulkPdfData = Awaited<ReturnType<typeof getDeliveriesForPdfBulk>>[number];
