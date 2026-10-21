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
 * Encuentra el equipo enganchado relacionado a partir de un checklist_answer_id del UT
 * Busca otro checklist_answer con el mismo template_id, fecha, hora y chofer pero diferente equipment_id
 */
export const findRelatedHitchEquipmentId = async (
  utChecklistAnswerId: string
): Promise<{ hitchEquipmentId: string; hitchChecklistAnswerId: string } | null> => {
  try {
    // El checklist del UT define la empresa: este flujo también corre desde el QR anónimo.
    const utAnswer = await prisma.checklist_answers.findUnique({
      where: { id: utChecklistAnswerId },
      select: { id: true, template_id: true, equipment_id: true, answer_data: true, company_id: true },
    });

    if (!utAnswer) {
      logger.error('[HITCH] No se encontró el checklist de la unidad tractora', { data: { utChecklistAnswerId } });
      return null;
    }

    const answerData = utAnswer.answer_data as { fecha?: string; hora?: string; chofer?: string } | null;
    const fecha = answerData?.fecha;
    const hora = answerData?.hora;
    const chofer = answerData?.chofer;

    if (!fecha || !hora || !chofer) {
      logger.info('[HITCH] UT checklist answer missing fecha/hora/chofer, cannot find related hitch equipment');
      return null;
    }

    // Buscar checklists con el mismo template, fecha, hora y chofer pero diferente equipment_id
    // Limitamos a los últimos 10 para mejorar rendimiento (checklists recientes)
    const relatedAnswers = await prisma.checklist_answers.findMany({
      where: withCompany(
        {
          template_id: utAnswer.template_id,
          ...(utAnswer.equipment_id ? { equipment_id: { not: utAnswer.equipment_id } } : {}),
        },
        utAnswer.company_id
      ),
      select: { id: true, equipment_id: true, answer_data: true },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    if (relatedAnswers.length === 0) {
      logger.info('[HITCH] No related checklist answers found');
      return null;
    }

    // Buscar el que coincida en fecha, hora y chofer
    const matchingAnswer = relatedAnswers.find((answer) => {
      const hitchAnswerData = answer.answer_data as { fecha?: string; hora?: string; chofer?: string } | null;
      const hitchFecha = hitchAnswerData?.fecha;
      const hitchHora = hitchAnswerData?.hora;
      const hitchChofer = hitchAnswerData?.chofer;

      const fechaMatch = hitchFecha === fecha;
      const choferMatch = hitchChofer?.toUpperCase() === chofer?.toUpperCase();

      // Comparar hora permitiendo diferencia de hasta 5 minutos
      let horaMatch = false;
      if (hitchHora && hora) {
        try {
          const utTimeParts = hora.split(':');
          const hitchTimeParts = hitchHora.split(':');
          const utMinutes = parseInt(utTimeParts[0]) * 60 + parseInt(utTimeParts[1] || '0');
          const hitchMinutes = parseInt(hitchTimeParts[0]) * 60 + parseInt(hitchTimeParts[1] || '0');
          const diffMinutes = Math.abs(utMinutes - hitchMinutes);
          horaMatch = diffMinutes <= 5; // Permitir hasta 5 minutos de diferencia
        } catch {
          horaMatch = hora === hitchHora; // Fallback a comparación exacta
        }
      }

      return fechaMatch && horaMatch && choferMatch;
    });

    if (matchingAnswer?.equipment_id) {
      logger.info('[HITCH] Found related hitch equipment', { data: { equipmentId: matchingAnswer.equipment_id } });
      return {
        hitchEquipmentId: matchingAnswer.equipment_id,
        hitchChecklistAnswerId: matchingAnswer.id,
      };
    }

    return null;
  } catch (error) {
    logger.error('Error in findRelatedHitchEquipmentId', { data: { error } });
    return null;
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

export type OtherEquipmentBasicData = Awaited<ReturnType<typeof fetchAllOtherEquipmentBasicData>>;
