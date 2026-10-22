'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, WAREHOUSE_PATH, firstIssue, toActionError } from '../lib/action-errors';
import { referencedRemovalMode, type RemovalMode } from '../lib/catalog-rules';
import {
  materialCategoryFormSchema,
  measurementUnitFormSchema,
  type MaterialCategoryFormValues,
  type MeasurementUnitFormValues,
} from '../schemas/catalog';

const logger = new Logger('features/Warehouses/catalog');

/** Categorias y unidades de la empresa (activas e inactivas), para Configuracion y los forms. */
export async function getWarehouseSettings() {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'view'))) {
    return { categories: [], units: [] };
  }
  return getCatalogLookups(true);
}

/**
 * Catalogos para los formularios de materiales. Sin chequeo de tab propio: lo llaman pantallas
 * que ya chequearon su permiso (Materiales, Configuracion).
 */
async function getCatalogLookups(includeInactive: boolean) {
  const companyId = await getActiveCompanyId();
  const where = { company_id: companyId, ...(includeInactive ? {} : { is_active: true }) };
  const [categories, units] = await Promise.all([
    prisma.material_categories.findMany({
      where,
      select: { id: true, name: true, is_active: true, _count: { select: { materials: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.measurement_units.findMany({
      where,
      select: { id: true, name: true, abbreviation: true, is_active: true, _count: { select: { materials: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    categories: categories.map(({ _count, ...c }) => ({ ...c, materialCount: _count.materials })),
    units: units.map(({ _count, ...u }) => ({ ...u, materialCount: _count.materials })),
  };
}

export type WarehouseSettings = Awaited<ReturnType<typeof getWarehouseSettings>>;

/** Categorias y unidades ACTIVAS, para elegir en el formulario de material. */
export async function getMaterialFormLookups() {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) return { categories: [], units: [] };
  return getCatalogLookups(false);
}

export type MaterialFormLookups = Awaited<ReturnType<typeof getMaterialFormLookups>>;

export async function createMaterialCategory(
  values: MaterialCategoryFormValues
): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'create'))) return fail(NO_PERMISSION);
  const parsed = materialCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.material_categories.create({
      data: { name: parsed.data.name },
      select: { id: true },
    });
    revalidatePath(WAREHOUSE_PATH);
    return ok(created);
  } catch (error) {
    return toActionError(error, logger, 'crear la categoría', 'Ya existe una categoría con ese nombre');
  }
}

export async function updateMaterialCategory(id: string, values: MaterialCategoryFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'update'))) return fail(NO_PERMISSION);
  const parsed = materialCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.material_categories.updateMany({
      where: { id, company_id: companyId },
      data: { name: parsed.data.name },
    });
    if (count === 0) return fail('La categoría no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'actualizar la categoría', 'Ya existe una categoría con ese nombre');
  }
}

export async function removeMaterialCategory(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'delete'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const category = await prisma.material_categories.findFirst({
      where: { id, company_id: companyId },
      select: { _count: { select: { materials: true } } },
    });
    if (!category) return fail('La categoría no existe');
    const mode = referencedRemovalMode(category._count.materials);
    if (mode === 'delete') await prisma.material_categories.delete({ where: { id } });
    else await prisma.material_categories.update({ where: { id }, data: { is_active: false } });
    revalidatePath(WAREHOUSE_PATH);
    return ok({ mode });
  } catch (error) {
    return toActionError(error, logger, 'dar de baja la categoría');
  }
}

export async function reactivateMaterialCategory(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'update'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.material_categories.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: true },
    });
    if (count === 0) return fail('La categoría no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'reactivar la categoría');
  }
}

export async function createMeasurementUnit(values: MeasurementUnitFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'create'))) return fail(NO_PERMISSION);
  const parsed = measurementUnitFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.measurement_units.create({
      data: { name: parsed.data.name, abbreviation: parsed.data.abbreviation },
      select: { id: true },
    });
    revalidatePath(WAREHOUSE_PATH);
    return ok(created);
  } catch (error) {
    return toActionError(error, logger, 'crear la unidad', 'Ya existe una unidad con ese nombre o abreviatura');
  }
}

export async function updateMeasurementUnit(id: string, values: MeasurementUnitFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'update'))) return fail(NO_PERMISSION);
  const parsed = measurementUnitFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.measurement_units.updateMany({
      where: { id, company_id: companyId },
      data: { name: parsed.data.name, abbreviation: parsed.data.abbreviation },
    });
    if (count === 0) return fail('La unidad no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'actualizar la unidad', 'Ya existe una unidad con ese nombre o abreviatura');
  }
}

export async function removeMeasurementUnit(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'delete'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const unit = await prisma.measurement_units.findFirst({
      where: { id, company_id: companyId },
      select: { _count: { select: { materials: true } } },
    });
    if (!unit) return fail('La unidad no existe');
    const mode = referencedRemovalMode(unit._count.materials);
    if (mode === 'delete') await prisma.measurement_units.delete({ where: { id } });
    else await prisma.measurement_units.update({ where: { id }, data: { is_active: false } });
    revalidatePath(WAREHOUSE_PATH);
    return ok({ mode });
  } catch (error) {
    return toActionError(error, logger, 'dar de baja la unidad');
  }
}

export async function reactivateMeasurementUnit(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'update'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.measurement_units.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: true },
    });
    if (count === 0) return fail('La unidad no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'reactivar la unidad');
  }
}
