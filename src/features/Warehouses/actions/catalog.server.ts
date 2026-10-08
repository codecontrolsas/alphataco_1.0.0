'use server';

import { revalidatePath } from 'next/cache';
import { checkPermissionServer } from '@/features/Permissions';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { toActionError } from '../lib/action-errors';
import { findEmployeeOptions } from '../lib/employee-search';
import { employeeLabel } from '../lib/labels';
import {
  materialRemovalMode,
  referencedRemovalMode,
  trackingTypeChangeError,
  unitChangeError,
  warehouseRemoval,
  type RemovalMode,
} from '../lib/catalog-rules';
import {
  materialCategoryFormSchema,
  materialFormSchema,
  measurementUnitFormSchema,
  warehouseFormSchema,
  type MaterialCategoryFormValues,
  type MaterialFormValues,
  type MeasurementUnitFormValues,
  type WarehouseFormValues,
} from '../schemas/catalog';

const logger = new Logger('features/Warehouses/catalog');

const WAREHOUSE_PATH = '/dashboard/warehouse';

const NO_PERMISSION = 'No tenés permiso para realizar esta acción';

const nullable = (value: string) => (value.trim() ? value.trim() : null);

/** Primer mensaje de validacion de Zod, para el toast. */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

// ── Depositos ───────────────────────────────────────────────────────────────

async function assertManager(companyId: string, employeeId: string | null) {
  if (!employeeId) return null;
  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId, is_active: true },
    select: { id: true },
  });
  return employee ? null : 'El responsable no existe o está dado de baja';
}

export async function createWarehouse(values: WarehouseFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'create'))) return fail(NO_PERMISSION);
  const parsed = warehouseFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  const managerId = nullable(parsed.data.managerEmployeeId);
  try {
    const managerError = await assertManager(companyId, managerId);
    if (managerError) return fail(managerError);

    const created = await prisma.warehouses.create({
      data: {
        company_id: companyId,
        code: parsed.data.code,
        name: parsed.data.name,
        address: nullable(parsed.data.address),
        manager_employee_id: managerId,
      },
      select: { id: true },
    });
    revalidatePath(WAREHOUSE_PATH);
    return ok(created);
  } catch (error) {
    return toActionError(error, logger, 'crear el depósito', 'Ya existe un depósito con ese código o nombre');
  }
}

export async function updateWarehouse(id: string, values: WarehouseFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'update'))) return fail(NO_PERMISSION);
  const parsed = warehouseFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  const managerId = nullable(parsed.data.managerEmployeeId);
  try {
    const managerError = await assertManager(companyId, managerId);
    if (managerError) return fail(managerError);

    const { count } = await prisma.warehouses.updateMany({
      where: { id, company_id: companyId },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        address: nullable(parsed.data.address),
        manager_employee_id: managerId,
      },
    });
    if (count === 0) return fail('El depósito no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'actualizar el depósito', 'Ya existe un depósito con ese código o nombre');
  }
}

/** Borra un deposito sin historial o lo desactiva; con stock, se rechaza. */
export async function removeWarehouse(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'delete'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const warehouse = await prisma.warehouses.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
    if (!warehouse) return fail('El depósito no existe');

    const [stock, movementCount] = await Promise.all([
      prisma.stock_balances.aggregate({ where: { warehouse_id: id }, _sum: { quantity: true } }),
      prisma.stock_movements.count({ where: { OR: [{ warehouse_id: id }, { target_warehouse_id: id }] } }),
    ]);
    const decision = warehouseRemoval(Number(stock._sum.quantity ?? 0), movementCount);
    if ('error' in decision) return fail(decision.error);

    if (decision.mode === 'delete') {
      await prisma.$transaction([
        prisma.stock_balances.deleteMany({ where: { warehouse_id: id } }),
        prisma.warehouses.delete({ where: { id } }),
      ]);
    } else {
      await prisma.warehouses.update({ where: { id }, data: { is_active: false } });
    }
    revalidatePath(WAREHOUSE_PATH);
    return ok({ mode: decision.mode });
  } catch (error) {
    return toActionError(error, logger, 'dar de baja el depósito');
  }
}

export async function reactivateWarehouse(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'update'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.warehouses.updateMany({ where: { id, company_id: companyId }, data: { is_active: true } });
    if (count === 0) return fail('El depósito no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'reactivar el depósito');
  }
}

/** Responsables posibles de un deposito (empleados activos), para el formulario. */
export async function searchDepotManagerOptions(query: string) {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('almacenes', 'depositos', 'create'),
    checkPermissionServer('almacenes', 'depositos', 'update'),
  ]);
  if (!canCreate && !canUpdate) return { items: [], total: 0 };
  return findEmployeeOptions(await getActiveCompanyId(), query, 30);
}

/** Datos de un deposito para el formulario de edicion. */
export async function getDepotForEdit(id: string) {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const depot = await prisma.warehouses.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      manager_employee_id: true,
      manager: { select: { file: true, lastname: true, firstname: true } },
    },
  });
  if (!depot) return null;
  const { manager, ...rest } = depot;
  return { ...rest, managerLabel: manager ? employeeLabel(manager) : null };
}

export type DepotForEdit = NonNullable<Awaited<ReturnType<typeof getDepotForEdit>>>;

// ── Materiales ──────────────────────────────────────────────────────────────

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
      data: { company_id: companyId, ...materialData(parsed.data) },
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
    const material = await prisma.materials.findFirst({
      where: { id, company_id: companyId },
      select: {
        clothing_combination: { select: { id: true } },
        tire_combination: { select: { id: true } },
        _count: { select: { movement_lines: true } },
      },
    });
    if (!material) return fail('El material no existe');
    const managed = managedBy(material);
    if (managed === 'clothing') return fail(`${MANAGED_MESSAGES.clothing}: se da de baja quitando la combinación`);
    if (managed === 'tires') return fail(`${MANAGED_MESSAGES.tires}: se da de baja desactivando el tipo o la marca`);

    const mode = materialRemovalMode(material._count.movement_lines);
    if (mode === 'delete') {
      await prisma.$transaction([
        prisma.stock_balances.deleteMany({ where: { material_id: id } }),
        prisma.materials.delete({ where: { id } }),
      ]);
    } else {
      await prisma.materials.update({ where: { id }, data: { is_active: false } });
    }
    revalidatePath(WAREHOUSE_PATH);
    return ok({ mode });
  } catch (error) {
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
    const { count } = await prisma.materials.updateMany({ where: { id, company_id: companyId }, data: { is_active: true } });
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

// ── Categorias y unidades ───────────────────────────────────────────────────

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

export async function createMaterialCategory(values: MaterialCategoryFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'create'))) return fail(NO_PERMISSION);
  const parsed = materialCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.material_categories.create({
      data: { company_id: companyId, name: parsed.data.name },
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
      data: { company_id: companyId, name: parsed.data.name, abbreviation: parsed.data.abbreviation },
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
