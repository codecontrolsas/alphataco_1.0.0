'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { ConfigPermissionError, failureMessage, requireConfigPermission } from '../lib/access';
import {
  idDeltaSchema,
  typeOfRepairInputSchema,
  typeOfRepairUpdateSchema,
  uuidSchema,
  type IdDelta,
  type TypeOfRepairInput,
} from '../schemas/repair-types';

const logger = new Logger('Mantenimiento/TiposReparaciones/actions');

/**
 * Tipos de reparación de la empresa activa.
 *
 * Perímetro: sin RLS, el listado se acota siempre por `company_id` (antes traía TODAS las
 * filas de la tabla: el filtro por empresa estaba comentado).
 */
export async function fetchAllTypesOfRepairs() {
  try {
    const companyId = await getActiveCompanyId();

    return await prisma.types_of_repairs.findMany({
      where: withCompany({}, companyId),
      orderBy: { created_at: 'desc' },
    });
  } catch (error) {
    logger.error('Error al obtener los tipos de reparación', { data: { error } });
    return [];
  }
}

/**
 * Tipos de reparación para la pantalla de configuración. Exige `view` y NO oculta el fallo:
 * devuelve `forbidden`/`error` para que la vista muestre "sin permiso" o "error" en lugar de una
 * lista vacía (que se leería como "no hay tipos cargados").
 *
 * `fetchAllTypesOfRepairs` queda como catálogo para otros flujos (asistente de órdenes), que no
 * dependen del permiso de configuración.
 */
export async function fetchRepairTypesForConfig() {
  try {
    await requireConfigPermission('type_of_repair', 'view');
    const companyId = await getActiveCompanyId();

    const types = await prisma.types_of_repairs.findMany({
      where: withCompany({}, companyId),
      orderBy: { created_at: 'desc' },
    });
    return { types, forbidden: false, error: null };
  } catch (error) {
    if (error instanceof ConfigPermissionError) {
      return { types: [], forbidden: true, error: error.message };
    }
    logger.error('Error al obtener los tipos de reparación para configuración', { data: { error } });
    return { types: [], forbidden: false, error: 'No se pudieron cargar los tipos de reparación' };
  }
}

export type TypesOfRepairsData = Awaited<ReturnType<typeof fetchAllTypesOfRepairs>>;
export type TypeOfRepairData = TypesOfRepairsData[number];

/**
 * Crea un tipo de reparación en la empresa activa.
 *
 * Guarda contra duplicados: sin esto, repetir el alta del mismo tipo (por doble click o
 * por volver a cargarlo más tarde) creaba una segunda fila idéntica sin ningún aviso
 * (ticket 616). La comparación ignora mayúsculas y espacios sobrantes, y es por empresa.
 */
export async function createTypeOfRepair(rawBody: TypeOfRepairInput) {
  try {
    await requireConfigPermission('type_of_repair', 'create');
    const parsed = typeOfRepairInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const body = parsed.data;
    const companyId = await getActiveCompanyId();
    const name = body.name;

    const existing = await prisma.types_of_repairs.findFirst({
      where: withCompany({ name: { equals: name, mode: Prisma.QueryMode.insensitive } }, companyId),
      select: { id: true, name: true },
    });

    if (existing) {
      return { ok: false as const, error: `Ya existe el tipo de reparación "${existing.name}".` };
    }

    const created = await prisma.types_of_repairs.create({
      data: {
        name,
        description: body.description,
        criticity: body.criticity ?? null,
        is_active: body.is_active ?? true,
        type_of_maintenance: body.type_of_maintenance ?? null,
        multi_equipment: body.multi_equipment ?? false,
        qr_close: body.qr_close ?? false,
        autorizable: body.autorizable ?? false,
        company_id: companyId,
      },
    });

    return { ok: true as const, data: [created] };
  } catch (error) {
    logger.error('Error al crear tipo de reparacion', { data: { error } });
    return {
      ok: false as const,
      error: failureMessage(error, 'No se pudo crear el tipo de reparación. Intente nuevamente.'),
    };
  }
}

/** Actualiza un tipo de reparación de la empresa activa. */
export async function updateTypeOfRepair(rawBody: Partial<TypeOfRepairInput>, id: string) {
  try {
    await requireConfigPermission('type_of_repair', 'update');
    uuidSchema.parse(id);
    const parsed = typeOfRepairUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' } as const;
    }
    const body = parsed.data;
    const companyId = await getActiveCompanyId();

    // Perímetro: el tipo tiene que ser de la empresa activa.
    const { count } = await prisma.types_of_repairs.updateMany({
      where: withCompany({ id }, companyId),
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.criticity !== undefined ? { criticity: body.criticity } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
        ...(body.type_of_maintenance !== undefined ? { type_of_maintenance: body.type_of_maintenance } : {}),
        ...(body.multi_equipment !== undefined ? { multi_equipment: body.multi_equipment } : {}),
        ...(body.qr_close !== undefined ? { qr_close: body.qr_close } : {}),
        ...(body.autorizable !== undefined ? { autorizable: body.autorizable } : {}),
      },
    });

    if (count === 0) {
      logger.warn('No se actualizó ningún tipo de reparación', { data: { id } });
    }

    return count > 0
      ? ({ ok: true } as const)
      : ({ ok: false, error: 'El tipo de reparación no existe o no pertenece a la empresa activa' } as const);
  } catch (error) {
    logger.error('Error al actualizar tipo de reparacion', { data: { error, id } });
    return { ok: false, error: failureMessage(error, 'No se pudo actualizar el tipo de reparación') } as const;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
}

/** Cantidad de ítems de solicitudes, órdenes y reparaciones que referencian el tipo. */
async function countRepairTypeUsage(repairTypeId: string): Promise<number> {
  const [requestItems, orderItems, repairs] = await Promise.all([
    prisma.maintenance_request_items.count({ where: { repair_type_id: repairTypeId } }),
    prisma.maintenance_order_items.count({ where: { repair_type_id: repairTypeId } }),
    prisma.work_order_item_repairs.count({ where: { repair_type_id: repairTypeId } }),
  ]);
  return requestItems + orderItems + repairs;
}

/** Elimina un tipo de reparación de la empresa activa. Si está en uso, la FK lo impide y se informa cuántos lo usan. */
export async function deleteTypeOfRepair(id: string) {
  try {
    await requireConfigPermission('type_of_repair', 'delete');
    uuidSchema.parse(id);
    const companyId = await getActiveCompanyId();

    let count: number;
    try {
      ({ count } = await prisma.types_of_repairs.deleteMany({
        where: withCompany({ id }, companyId),
      }));
    } catch (deleteError) {
      // P2003: el tipo lo referencian solicitudes, órdenes o reparaciones (la FK impide borrarlo).
      if (isForeignKeyViolation(deleteError)) {
        const inUse = await countRepairTypeUsage(id);
        return {
          ok: false,
          error: `El tipo está en uso por ${inUse} ${inUse === 1 ? 'solicitud u orden' : 'solicitudes u órdenes'}; desactivalo en su lugar.`,
        } as const;
      }
      throw deleteError;
    }

    return count > 0
      ? ({ ok: true } as const)
      : ({ ok: false, error: 'El tipo de reparación no existe o no pertenece a la empresa activa' } as const);
  } catch (error) {
    logger.error('Error al eliminar tipo de reparacion', { data: { error, id } });
    return { ok: false, error: failureMessage(error, 'No se pudo eliminar el tipo de reparación') } as const;
  }
}

/** Sectores activos de los talleres de la empresa activa, para la config del tipo. */
export async function fetchAllWorkshopSectorsForConfig() {
  try {
    await requireConfigPermission('type_of_repair', 'view');
    const companyId = await getActiveCompanyId();

    return await prisma.workshop_sectors.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: {
        id: true,
        name: true,
        workshop_id: true,
        workshops: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener los sectores de taller', { data: { error } });
    return [];
  }
}

/** Ids de los sectores asociados a un tipo de reparación de la empresa activa. */
export async function fetchSectorsForRepairType(repairTypeId: string) {
  // Sin try/catch que devuelva []: este listado es el BASELINE del formulario, y un fallo
  // silencioso se leería como "el tipo no tiene sectores". Que falle y el cliente lo muestre.
  await requireConfigPermission('type_of_repair', 'view');
  uuidSchema.parse(repairTypeId);
  const companyId = await getActiveCompanyId();

  const rows = await prisma.sector_repair_types.findMany({
    where: {
      repair_type_id: repairTypeId,
      types_of_repairs: { company_id: companyId },
    },
    select: { workshop_sector_id: true },
  });

  return rows.map((row) => row.workshop_sector_id);
}

/**
 * Aplica ALTAS y BAJAS de sectores a un tipo de reparación (no el conjunto final).
 *
 * El cliente manda lo que agregó y lo que quitó respecto de los sectores que cargó al abrir el
 * tipo: el DELETE se acota a `tipo = X AND sector IN (remove)` y el INSERT solo a `add`. Un
 * sector que no aparece en ninguna de las dos listas no se toca. Los sectores a agregar tienen
 * que ser de la empresa activa.
 */
export async function updateRepairTypeSectors(repairTypeId: string, delta: IdDelta) {
  try {
    await requireConfigPermission('type_of_repair', 'update');
    uuidSchema.parse(repairTypeId);
    const { add, remove } = idDeltaSchema.parse(delta);
    const companyId = await getActiveCompanyId();

    const repairType = await prisma.types_of_repairs.findFirst({
      where: withCompany({ id: repairTypeId }, companyId),
      select: { id: true },
    });
    if (!repairType) return { ok: false, error: 'El tipo de reparación no pertenece a la empresa activa' } as const;

    const validAdd =
      add.length > 0
        ? (
            await prisma.workshop_sectors.findMany({
              where: withCompany({ id: { in: add } }, companyId),
              select: { id: true },
            })
          ).map((sector) => sector.id)
        : [];
    const toRemove = remove.filter((id) => !validAdd.includes(id));

    const result = await prisma.$transaction(async (tx) => {
      let removed = 0;
      if (toRemove.length > 0) {
        const res = await tx.sector_repair_types.deleteMany({
          where: { repair_type_id: repairTypeId, workshop_sector_id: { in: toRemove } },
        });
        removed = res.count;
      }

      let added = 0;
      if (validAdd.length > 0) {
        const res = await tx.sector_repair_types.createMany({
          data: validAdd.map((sectorId) => ({ workshop_sector_id: sectorId, repair_type_id: repairTypeId })),
          skipDuplicates: true,
        });
        added = res.count;
      }
      return { added, removed };
    });

    return { ok: true, ...result } as const;
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'Los datos enviados son inválidos' } as const;
    logger.error('Error al actualizar los sectores del tipo de reparación', { data: { error, repairTypeId } });
    return { ok: false, error: failureMessage(error, 'No se pudieron actualizar los sectores') } as const;
  }
}
