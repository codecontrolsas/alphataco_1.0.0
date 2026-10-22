'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  WAREHOUSE_PATH,
  firstIssue,
  isForeignKeyError,
  nullable,
  toActionError,
} from '../lib/action-errors';
import { materialRemovalMode, trackingTypeChangeError, unitChangeError, type RemovalMode } from '../lib/catalog-rules';
import { materialFormSchema, type MaterialFormValues } from '../schemas/catalog';

const logger = new Logger('features/Warehouses/catalog');

async function assertMaterialRefs(companyId: string, values: MaterialFormValues): Promise<string | null> {
  const categoryId = nullable(values.categoryId);
  const [unit, category] = await Promise.all([
    prisma.measurement_units.findFirst({ where: { id: values.unitId, company_id: companyId }, select: { id: true } }),
    categoryId
      ? prisma.material_categories.findFirst({ where: { id: categoryId, company_id: companyId }, select: { id: true } })
      : Promise.resolve({ id: null }),
  ]);
  if (!unit) return 'La unidad de medida no existe';
  if (!category) return 'La categoría no existe';
  return null;
}

function materialData(values: MaterialFormValues) {
  return {
    code: values.code,
    name: values.name,
    description: nullable(values.description),
    category_id: nullable(values.categoryId),
    unit_id: values.unitId,
    tracking_type: values.trackingType,
    requires_approval: values.requiresApproval,
    min_stock: values.minStock ? values.minStock.replace(',', '.') : null,
  };
}

export async function createMaterial(values: MaterialFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'create'))) return fail(NO_PERMISSION);
  const parsed = materialFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  try {
    const refError = await assertMaterialRefs(companyId, parsed.data);
    if (refError) return fail(refError);
    const created = await prisma.materials.create({
      data: { ...materialData(parsed.data) },
      select: { id: true },
    });
    revalidatePath(WAREHOUSE_PATH);
    return ok(created);
  } catch (error) {
    return toActionError(error, logger, 'crear el material', 'Ya existe un material con ese código');
  }
}

/**
 * Materiales que administra otro modulo: su codigo, nombre, unidad, control y estado los maneja
 * Ropa (etapa 5, articulo + marca + talle) o Gomeria (etapa 6, tipo + marca de cubierta).
 */
const MANAGED_MESSAGES = {
  clothing: 'Este material se administra desde el catálogo de Ropa (artículo, marca y talle)',
  tires: 'Este material se administra desde el catálogo de Gomería (tipo y marca de cubierta)',
} as const;
type ManagedBy = keyof typeof MANAGED_MESSAGES;

function managedBy(material: { clothing_combination: unknown; tire_combination: unknown }): ManagedBy | null {
  if (material.clothing_combination) return 'clothing';
  if (material.tire_combination) return 'tires';
  return null;
}

export async function updateMaterial(id: string, values: MaterialFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'update'))) return fail(NO_PERMISSION);
  const parsed = materialFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  try {
    const current = await prisma.materials.findFirst({
      where: { id, company_id: companyId },
      select: {
        code: true,
        name: true,
        tracking_type: true,
        unit_id: true,
        clothing_combination: { select: { id: true } },
        tire_combination: { select: { id: true } },
        _count: { select: { movement_lines: true } },
      },
    });
    if (!current) return fail('El material no existe');
    const managed = managedBy(current);
    if (
      managed &&
      (parsed.data.code.trim() !== current.code ||
        parsed.data.name.trim() !== current.name ||
        parsed.data.unitId !== current.unit_id ||
        parsed.data.trackingType !== current.tracking_type)
    ) {
      return fail(`${MANAGED_MESSAGES[managed]}: no se cambian su código, nombre, unidad ni tipo de control`);
    }

    const trackingError = trackingTypeChangeError(
      current._count.movement_lines,
      current.tracking_type !== parsed.data.trackingType
    );
    if (trackingError) return fail(trackingError);
    const unitError = unitChangeError(current._count.movement_lines, current.unit_id !== parsed.data.unitId);
    if (unitError) return fail(unitError);

    const refError = await assertMaterialRefs(companyId, parsed.data);
    if (refError) return fail(refError);

    await prisma.materials.update({ where: { id }, data: materialData(parsed.data) });
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'actualizar el material', 'Ya existe un material con ese código');
  }
}

/** Borra un material sin movimientos o lo desactiva. */
export async function removeMaterial(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'delete'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    // Mismo patron que `removeWarehouse`: primero el lock del material (FOR UPDATE, el que toma
    // el motor en su paso 4), despues contar movimientos y borrar o desactivar. Este camino no
    // lockea depositos ni nada antes del material.
    const result = await prisma.$transaction(async (tx): Promise<ActionResult<{ mode: RemovalMode }>> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM materials
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return fail('El material no existe');

      const material = await tx.materials.findUniqueOrThrow({
        where: { id },
        select: {
          clothing_combination: { select: { id: true } },
          tire_combination: { select: { id: true } },
          _count: { select: { movement_lines: true } },
        },
      });
      const managed = managedBy(material);
      if (managed === 'clothing') return fail(`${MANAGED_MESSAGES.clothing}: se da de baja quitando la combinación`);
      if (managed === 'tires') return fail(`${MANAGED_MESSAGES.tires}: se da de baja desactivando el tipo o la marca`);

      const mode = materialRemovalMode(material._count.movement_lines);
      if (mode === 'delete') {
        await tx.stock_balances.deleteMany({ where: { material_id: id } });
        await tx.materials.delete({ where: { id } });
      } else {
        await tx.materials.update({ where: { id }, data: { is_active: false } });
      }
      return ok({ mode });
    });
    if (result.ok) revalidatePath(WAREHOUSE_PATH);
    return result;
  } catch (error) {
    if (isForeignKeyError(error)) {
      return fail(
        'El material está referenciado por otros registros (pedidos, compras u otro módulo): no se puede borrar. Desactivalo.'
      );
    }
    return toActionError(error, logger, 'dar de baja el material');
  }
}

export async function reactivateMaterial(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'update'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const [clothing, tire] = await Promise.all([
      prisma.clothing_item_materials.findFirst({ where: { material_id: id }, select: { id: true } }),
      prisma.tire_materials.findFirst({ where: { material_id: id }, select: { id: true } }),
    ]);
    if (clothing) return fail(`${MANAGED_MESSAGES.clothing}: se reactiva habilitando la combinación`);
    if (tire) return fail(`${MANAGED_MESSAGES.tires}: se reactiva activando el tipo y la marca`);
    const { count } = await prisma.materials.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: true },
    });
    if (count === 0) return fail('El material no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'reactivar el material');
  }
}

/** Datos de un material para el formulario de edicion. */
export async function getMaterialForEdit(id: string) {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const material = await prisma.materials.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category_id: true,
      unit_id: true,
      tracking_type: true,
      requires_approval: true,
      min_stock: true,
      clothing_combination: { select: { id: true } },
      tire_combination: { select: { id: true } },
      _count: { select: { movement_lines: true } },
    },
  });
  if (!material) return null;
  const { _count, min_stock, clothing_combination, tire_combination, ...rest } = material;
  const managed = managedBy({ clothing_combination, tire_combination });
  return {
    ...rest,
    min_stock: min_stock?.toString() ?? null,
    hasMovements: _count.movement_lines > 0,
    /** Codigo, nombre, unidad y control los maneja otro modulo (Ropa o Gomeria): el form los bloquea. */
    managedNotice: managed ? MANAGED_MESSAGES[managed] : null,
  };
}

export type MaterialForEdit = NonNullable<Awaited<ReturnType<typeof getMaterialForEdit>>>;
