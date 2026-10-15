'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { requireGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import {
  assertTireBrandInActiveCompany,
  assertTireCatalogRefsInCompany,
  assertTireInActiveCompany,
  assertTireTypeInActiveCompany,
  assertWarehouseInCompany,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { applyTireStatusChange, createTiresWithStock, type NewTireRow } from '@/features/Warehouses/lib/tire-stock';
import { DECIMAL_RE, normalizeDecimal } from '@/features/Warehouses/schemas/stock-movement';
import type { TireRetreadLevel, TireStatus } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const logger = new Logger('features/Mantenimiento/Gomeria/Catalogo/mutations');

// ============================================================================
// SCHEMAS (validación en el servidor: el formulario del cliente no alcanza)
// ============================================================================

const RETREAD_LEVELS = ['FIRST', 'SECOND', 'THIRD'] as const satisfies readonly TireRetreadLevel[];

const serialSchema = z
  .string()
  .trim()
  .min(1, 'Indicá el número de serie')
  .max(60, 'El número de serie es demasiado largo');
const treadDepthSchema = z.number().finite().nonnegative().max(1000).nullish();
const retreadLevelSchema = z.enum(RETREAD_LEVELS).nullish();

const stockDataSchema = z.object({
  warehouseId: uuidSchema,
  unitCost: z.string().trim().min(1, 'Indicá el costo unitario (hasta 4 decimales)'),
});

const newTireSchema = z
  .object({
    serial_number: serialSchema,
    brand_id: uuidSchema,
    tire_type_id: uuidSchema,
    is_new: z.boolean(),
    retread_level: retreadLevelSchema,
    tread_depth: treadDepthSchema,
  })
  .merge(stockDataSchema);

const bulkTiresSchema = z
  .object({
    prefix: z.string().trim().max(40, 'El prefijo es demasiado largo'),
    rangeFrom: z.number().int().min(0).max(100_000_000),
    rangeTo: z.number().int().min(0).max(100_000_000),
    brand_id: uuidSchema,
    tire_type_id: uuidSchema,
    is_new: z.boolean(),
    retread_level: retreadLevelSchema,
    tread_depth: treadDepthSchema,
  })
  .merge(stockDataSchema);

const updateTireSchema = z.object({
  serial_number: serialSchema.optional(),
  brand_id: uuidSchema.optional(),
  tire_type_id: uuidSchema.optional(),
  is_new: z.boolean().optional(),
  retread_level: retreadLevelSchema,
  tread_depth: treadDepthSchema,
});

const tireStatusSchema = z.enum(['AVAILABLE', 'INSTALLED', 'IN_REPAIR', 'DISCARDED', 'MISSING']);

type NewTireData = z.infer<typeof newTireSchema>;

/** Costo unitario validado y normalizado (hasta 4 decimales, punto o coma). */
function parseUnitCost(value: string): string | null {
  const trimmed = value.trim();
  return DECIMAL_RE.test(trimmed) ? normalizeDecimal(trimmed) : null;
}

function toTireRow(
  data: Pick<NewTireData, 'serial_number' | 'brand_id' | 'tire_type_id' | 'is_new' | 'retread_level' | 'tread_depth'>
): NewTireRow {
  return {
    serial_number: data.serial_number,
    brand_id: data.brand_id,
    tire_type_id: data.tire_type_id,
    is_new: data.is_new,
    retread_level: data.retread_level ?? null,
    tread_depth: data.tread_depth ?? null,
  };
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================

/**
 * Alta de cubierta desde el catálogo del dashboard (permiso `create`): la empresa sale de la
 * sesión. Entra al depósito elegido (de esa empresa), al costo indicado.
 */
export async function createTire(input: z.input<typeof newTireSchema>): Promise<ActionResult<{ id: string }>> {
  logger.debug('Creating tire');
  try {
    const parsed = newTireSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
    const data = parsed.data;
    const unitCost = parseUnitCost(data.unitCost);
    if (!unitCost) return fail('Indicá el costo unitario (hasta 4 decimales)');

    const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'create');
    const profile = await requireServerAuthProfile();
    await assertTireCatalogRefsInCompany(prisma, { brandId: data.brand_id, tireTypeId: data.tire_type_id }, companyId);
    await assertWarehouseInCompany(prisma, data.warehouseId, companyId);
    await withActor(profile.credentialId, (tx) =>
      createTiresWithStock(tx, companyId, profile.id, {
        tires: [toTireRow(data)],
        warehouseId: data.warehouseId,
        unitCost,
      })
    );
    const tire = await prisma.tires.findFirstOrThrow({
      where: { company_id: companyId, serial_number: data.serial_number },
      select: { id: true },
    });
    return ok({ id: tire.id });
  } catch (error) {
    return toGomeriaActionError(error, logger, 'dar de alta la cubierta');
  }
}

/**
 * Alta masiva desde el catálogo del dashboard (permiso `create`): la empresa sale de la
 * sesión y la marca, el tipo y el depósito tienen que ser de esa empresa. Una sola entrada al
 * depósito con todas las series.
 */
export async function createTiresBulk(
  input: z.input<typeof bulkTiresSchema>
): Promise<ActionResult<{ count: number }>> {
  logger.debug('Creating tires bulk');

  try {
    const parsed = bulkTiresSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
    const data = parsed.data;

    const count = data.rangeTo - data.rangeFrom + 1;
    if (data.rangeFrom > data.rangeTo) return fail('El número inicial no puede ser mayor al número final.');
    if (count > 500) return fail(`El rango supera el máximo permitido (500). Se intentaron crear ${count} cubiertas.`);
    const unitCost = parseUnitCost(data.unitCost);
    if (!unitCost) return fail('Indicá el costo unitario (hasta 4 decimales)');

    const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'create');
    const profile = await requireServerAuthProfile();
    await assertTireCatalogRefsInCompany(prisma, { brandId: data.brand_id, tireTypeId: data.tire_type_id }, companyId);
    await assertWarehouseInCompany(prisma, data.warehouseId, companyId);

    const serials = Array.from({ length: count }, (_, i) => `${data.prefix}${data.rangeFrom + i}`);
    const existing = await prisma.tires.findMany({
      where: { serial_number: { in: serials }, company_id: companyId },
      select: { serial_number: true },
    });
    if (existing.length > 0) {
      return fail(`Los siguientes números de serie ya existen: ${existing.map((t) => t.serial_number).join(', ')}`);
    }

    await withActor(
      profile.credentialId,
      (tx) =>
        createTiresWithStock(tx, companyId, profile.id, {
          tires: serials.map((serial_number) => toTireRow({ ...data, serial_number })),
          warehouseId: data.warehouseId,
          unitCost,
        }),
      prisma,
      { timeout: 30_000 }
    );
    return ok({ count });
  } catch (error) {
    return toGomeriaActionError(error, logger, 'dar de alta las cubiertas');
  }
}

/** Edición de una cubierta del catálogo (permiso `update`). Sólo los campos listados se escriben. */
export async function updateTire(id: string, input: z.input<typeof updateTireSchema>): Promise<ActionResult> {
  logger.debug('Updating tire', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    const data = parseInput(updateTireSchema, input);
    await requireGomeriaPermission('catalogo_cubiertas', 'update');
    await assertTireInActiveCompany(id);
    if (data.brand_id != null) await assertTireBrandInActiveCompany(data.brand_id);
    if (data.tire_type_id != null) await assertTireTypeInActiveCompany(data.tire_type_id);

    // Con stock, la serie, la marca y el tipo definen su material y su unidad: no se cambian.
    const current = await prisma.tires.findUniqueOrThrow({
      where: { id },
      select: { serial_number: true, brand_id: true, tire_type_id: true, material_unit_id: true },
    });
    const changesIdentity =
      (data.serial_number != null && data.serial_number !== current.serial_number) ||
      (data.brand_id != null && data.brand_id !== current.brand_id) ||
      (data.tire_type_id != null && data.tire_type_id !== current.tire_type_id);
    if (current.material_unit_id && changesIdentity) {
      return fail('La cubierta tiene stock: no se cambian la serie, la marca ni el tipo');
    }

    await prisma.tires.update({
      where: { id },
      data: {
        ...(data.serial_number != null ? { serial_number: data.serial_number } : {}),
        ...(data.brand_id != null ? { brand_id: data.brand_id } : {}),
        ...(data.tire_type_id != null ? { tire_type_id: data.tire_type_id } : {}),
        ...(data.is_new != null ? { is_new: data.is_new } : {}),
        tread_depth: data.tread_depth ?? null,
        retread_level: data.retread_level ?? null,
      },
    });
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'actualizar la cubierta');
  }
}

/**
 * Cambio de estado desde el catálogo ("Marcar como reparada / encontrada", permiso `update`).
 * Si la cubierta tiene stock y vuelve a disponible, se devuelve al depósito elegido (de la
 * empresa) o al único activo.
 */
export async function updateTireStatus(
  id: string,
  status: TireStatus,
  warehouseId: string | null = null
): Promise<ActionResult> {
  logger.debug('Updating tire status', { data: { id, status } });
  try {
    parseInput(uuidSchema, id);
    const targetStatus = parseInput(tireStatusSchema, status);
    const targetWarehouseId = parseInput(uuidSchema.nullable(), warehouseId);
    const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'update');
    const profile = await requireServerAuthProfile();
    await assertTireInActiveCompany(id);
    if (targetWarehouseId) await assertWarehouseInCompany(prisma, targetWarehouseId, companyId);

    await withActor(
      profile.credentialId,
      async (tx) => {
        const current = await tx.tires.findUniqueOrThrow({ where: { id }, select: { status: true } });
        // Desde el catalogo solo se vuelve a disponible (reparada o encontrada) o se descarta: los
        // montajes y desmontajes van por la orden de gomeria, que es la que mueve el stock.
        const allowed: Partial<Record<TireStatus, TireStatus[]>> = {
          AVAILABLE: ['IN_REPAIR', 'MISSING'],
          DISCARDED: ['AVAILABLE', 'IN_REPAIR', 'MISSING'],
        };
        if (!allowed[targetStatus]?.includes(current.status)) {
          throw new StockError('INVALID_STATE', 'Ese cambio de estado se hace desde una orden de gomería');
        }
        await applyTireStatusChange(tx, companyId, profile.id, {
          tireId: id,
          from: current.status,
          to: targetStatus,
          warehouseId: targetWarehouseId,
          notes: null,
        });
        // La transición se acota al estado de origen: si cambió en el medio, no se pisa.
        const { count } = await tx.tires.updateMany({
          where: { id, status: current.status },
          data: { status: targetStatus },
        });
        if (count === 0) throw new StockError('INVALID_STATE', 'La cubierta cambió de estado. Actualizá la pantalla.');
      },
      prisma,
      GOMERIA_TX_OPTIONS
    );
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'cambiar el estado de la cubierta');
  }
}

/** Baja lógica de una cubierta sin stock (permiso `delete`). */
export async function deleteTire(id: string): Promise<ActionResult> {
  logger.debug('Soft-deleting tire', { data: { id } });
  try {
    parseInput(uuidSchema, id);
    await requireGomeriaPermission('catalogo_cubiertas', 'delete');
    await assertTireInActiveCompany(id);

    const tire = await prisma.tires.findUniqueOrThrow({
      where: { id },
      select: { material_unit: { select: { status: true } } },
    });
    if (tire.material_unit && tire.material_unit.status !== 'DISCARDED') {
      return fail('Dala de baja con un descarte; tiene stock');
    }

    await prisma.tires.update({ where: { id }, data: { is_active: false } });
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'eliminar la cubierta');
  }
}
