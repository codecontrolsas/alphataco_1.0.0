'use server';

import { getResourceCompanyId } from '@/features/Mantenimiento/shared/resource-company';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Mantenimiento/equipment-basic');

/**
 * Datos basicos de los equipos de la empresa, para los selectores de mantenimiento.
 *
 * Migrada de Supabase a Prisma (ticket 592) para poder resolver `type` y `sub_type`:
 * en Supabase esos joins son ambiguos porque la columna y la tabla se llaman igual.
 * El shape de salida se mantiene identico al anterior — solo se AGREGAN
 * `type_name` y `sub_type_name` — para no tocar a ninguno de sus consumidores.
 */
/**
 * Listado por empresa. NO es una Server Action: es una función privada del módulo, para que
 * `companyId` no pueda llegar nunca desde el cliente (sin RLS, un `companyId` de parámetro
 * en un `'use server'` exportado es un endpoint que lista cualquier empresa).
 */
async function listEquipmentBasicDataForCompany(companyId: string) {
  const equipments = await prisma.vehicles.findMany({
    where: withCompany({}, companyId),
    select: {
      id: true,
      condition: true,
      picture: true,
      year: true,
      company_id: true,
      domain: true,
      serie: true,
      intern_number: true,
      kilometer: true,
      engine_hours: true,
      types_of_vehicles: { select: { name: true } },
      type_vehicles_typeTotype: { select: { name: true } },
      sub_type: { select: { name: true } },
    },
  });

  // Aplanamos los nombres de relacion generados por Prisma a claves legibles.
  //
  // `condition` se mantiene como string (y no como el enum de Prisma) a proposito:
  // con Supabase llegaba asi, y varios consumidores lo comparan contra literales
  // que no coinciden con el enum ('no operativo' en vez de 'no_operativo').
  // Tiparlo estricto rompe esos archivos y arreglar esas comparaciones cambiaria
  // el comportamiento de pantallas fuera del alcance de este ticket.
  return equipments.map(({ type_vehicles_typeTotype, sub_type, condition, ...rest }) => ({
    ...rest,
    condition: condition as string | null,
    type_name: type_vehicles_typeTotype?.name ?? null,
    sub_type_name: sub_type?.name ?? null,
  }));
}

export const fetchAllEquipmentBasicData = async () => {
  try {
    return await listEquipmentBasicDataForCompany(await getActiveCompanyId());
  } catch (error) {
    logger.error('Error fetching equipment', { data: { error } });
    return [];
  }
};

/**
 * Misma lista, pero con la empresa derivada DEL EQUIPO de la ruta.
 *
 * Es la variante del flujo QR anónimo (`/maintenance/equipment/[id]/request`): ahí no hay
 * empresa activa, así que `fetchAllEquipmentBasicData()` devolvía vacío o, peor, la empresa
 * de una cookie ajena al equipo escaneado. La empresa sale de la fila del vehículo, nunca
 * del cliente — misma regla que `shared/resource-company.ts::getResourceCompanyId`.
 */
export const fetchEquipmentBasicDataForEquipment = async (equipmentId: string) => {
  try {
    const companyId = await getResourceCompanyId(prisma, 'vehicle', equipmentId);
    return await listEquipmentBasicDataForCompany(companyId);
  } catch (error) {
    logger.error('Error fetching equipment for equipment', { data: { error, equipmentId } });
    return [];
  }
};

/**
 * Datos basicos de los EQUIPAMIENTOS (other_equipment) de la empresa, para el
 * selector de mantenimiento (ticket 596).
 *
 * Espeja a `fetchAllEquipmentBasicData` pero con las claves propias de esta
 * entidad: un equipamiento no tiene dominio ni kilometraje — se identifica por
 * numero de serie y mide uso con horometro.
 */
export const fetchAllOtherEquipmentBasicData = async () => {
  const companyId = await getActiveCompanyId();

  try {
    const equipments = await prisma.other_equipment.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: {
        id: true,
        condition: true,
        year: true,
        company_id: true,
        serial_number: true,
        intern_number: true,
        horometer: true,
        type: { select: { name: true } },
        sub_type: { select: { name: true } },
      },
      orderBy: [{ serial_number: 'asc' }, { intern_number: 'asc' }],
    });

    return equipments.map(({ type, sub_type, condition, horometer, ...rest }) => ({
      ...rest,
      condition: condition as string | null,
      // El horometro es Decimal en la BD; el form trabaja con strings, igual que
      // el engine_hours de los vehiculos.
      engine_hours: horometer != null ? String(horometer) : null,
      type_name: type?.name ?? null,
      sub_type_name: sub_type?.name ?? null,
    }));
  } catch (error) {
    logger.error('Error fetching other equipment', { data: { error } });
    // Se relanza a propósito (ticket 651): devolver [] hacía que un fallo de la
    // query llegara al selector como "No se encontró el equipamiento", en vez de
    // activar la rama de error que ofrece reintentar.
    throw error;
  }
};
