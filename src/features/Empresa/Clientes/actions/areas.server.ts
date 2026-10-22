'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { areaInclude, serializeArea } from '../lib/area-row';
import { diffAssignments, normalizeIds } from '../lib/assignment-diff';
import { assertComercialView, requireComercialPermission } from '../lib/require-permission.server';
import { areaFormSchema, type AreaFormValues } from '../schemas/area';

const logger = new Logger('features/Empresa/Clientes/areas');

const COMERCIAL_PATH = '/dashboard/comercial';

export type AreaRow = ReturnType<typeof serializeArea>;

/** Áreas de los clientes de la empresa activa, con sus provincias. */
export async function getAreasWithProvinces(): Promise<AreaRow[]> {
  await assertComercialView(['areas-cliente', 'service']);
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.areas_cliente.findMany({
      where: { customers: { company_id: companyId } },
      include: areaInclude,
      orderBy: { nombre: 'asc' },
    });
    return rows.map(serializeArea);
  } catch (error) {
    logger.error('Error al obtener áreas', { data: { error, companyId } });
    throw error;
  }
}

/** Áreas de UN cliente de la empresa activa (pestaña "Áreas" de la ficha). */
export async function getAreasByCustomer(customerId: string): Promise<AreaRow[]> {
  if (!(await checkPermissionServer('comercial', 'areas-cliente', 'view'))) {
    throw new Error('No tenés permiso para ver las áreas del cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.areas_cliente.findMany({
      where: { customer_id: customerId, customers: { company_id: companyId } },
      include: areaInclude,
      orderBy: { nombre: 'asc' },
    });
    return rows.map(serializeArea);
  } catch (error) {
    logger.error('Error al obtener las áreas del cliente', { data: { error, customerId } });
    throw new Error('No se pudieron cargar las áreas del cliente');
  }
}

async function findOwnedArea(areaId: string, companyId: string) {
  return prisma.areas_cliente.findFirst({
    where: { id: areaId, customers: { company_id: companyId } },
    select: { id: true, customer_id: true },
  });
}

async function assertCustomerOwned(customerId: string, companyId: string): Promise<void> {
  const customer = await prisma.customers.findFirst({
    where: { id: customerId, company_id: companyId },
    select: { id: true },
  });
  if (!customer) throw new Error('Cliente no encontrado');
}

async function assertProvincesExist(provinceIds: number[]): Promise<void> {
  const count = await prisma.provinces.count({ where: { id: { in: provinceIds.map((id) => BigInt(id)) } } });
  if (count !== provinceIds.length) throw new Error('Una o más provincias no existen');
}

/**
 * Primer contrato activo que usa el área (para impedir cambiarla de cliente).
 */
async function findContractUsingArea(areaId: string) {
  const link = await prisma.service_areas.findFirst({
    where: { area_id: areaId, customer_services: { is_active: true } },
    select: {
      customer_services: {
        select: { id: true, contract_number: true, service_name: true, customers: { select: { name: true } } },
      },
    },
    orderBy: { customer_services: { created_at: 'asc' } },
  });
  return link?.customer_services ?? null;
}

export async function createArea(input: AreaFormValues): Promise<ActionResult<{ areaId: string }>> {
  const parsed = areaFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const permissionError = await requireComercialPermission('areas-cliente', 'create');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    await assertCustomerOwned(values.customer_id, companyId);
    const provinceIds = Array.from(new Set(values.province_id));
    await assertProvincesExist(provinceIds);

    const created = await prisma.$transaction(async (tx) => {
      const area = await tx.areas_cliente.create({
        data: { nombre: values.name, descripcion_corta: values.descripcion_corta, customer_id: values.customer_id },
        select: { id: true },
      });
      await tx.area_province.createMany({
        data: provinceIds.map((id) => ({ area_id: area.id, province_id: BigInt(id) })),
      });
      return area;
    });

    logger.info('Área creada', { data: { areaId: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ areaId: created.id });
  } catch (error) {
    logger.error('Error al crear el área', { data: { error } });
    return fail(errorMessage(error, 'Error al crear el área'));
  }
}

/**
 * Edición de área. Si cambia de cliente y está en un contrato activo, se rechaza. Las
 * provincias se reconcilian con altas y bajas explícitas contra la base.
 */
export async function updateArea(input: AreaFormValues & { id: string }): Promise<ActionResult<{ areaId: string }>> {
  const parsed = areaFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;
  const areaId = input.id;

  const permissionError = await requireComercialPermission('areas-cliente', 'update');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    const current = await findOwnedArea(areaId, companyId);
    if (!current) return fail('Área no encontrada');
    await assertCustomerOwned(values.customer_id, companyId);

    if (current.customer_id !== values.customer_id) {
      const contract = await findContractUsingArea(areaId);
      if (contract) {
        return fail(
          `No se puede actualizar el área porque está siendo utilizada en el contrato ${contract.contract_number || 'Sin número'} (${contract.service_name || 'Sin nombre'}) del cliente ${contract.customers?.name ?? 'Cliente desconocido'}.`
        );
      }
    }

    const provinceIds = Array.from(new Set(values.province_id));
    await assertProvincesExist(provinceIds);
    const currentProvinces = await prisma.area_province.findMany({
      where: { area_id: areaId },
      select: { province_id: true },
    });
    const provinces = diffAssignments(
      currentProvinces.map((p) => String(p.province_id)),
      provinceIds.map(String)
    );

    await prisma.$transaction(async (tx) => {
      await tx.areas_cliente.update({
        where: { id: areaId },
        data: { nombre: values.name, descripcion_corta: values.descripcion_corta, customer_id: values.customer_id },
      });
      if (provinces.toRemove.length > 0) {
        await tx.area_province.deleteMany({
          where: { area_id: areaId, province_id: { in: provinces.toRemove.map((id) => BigInt(id)) } },
        });
      }
      if (provinces.toAdd.length > 0) {
        await tx.area_province.createMany({
          data: provinces.toAdd.map((id) => ({ area_id: areaId, province_id: BigInt(id) })),
        });
      }
    });

    logger.info('Área actualizada', { data: { areaId } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ areaId });
  } catch (error) {
    logger.error('Error al actualizar el área', { data: { error, areaId } });
    return fail(errorMessage(error, 'Error al actualizar el área'));
  }
}

/** Ids de contratos ya vinculados a un área (para filtrarlos del selector en edición). */
export async function getAreaLinkedContracts(areaId: string): Promise<string[]> {
  await assertComercialView(['areas-cliente']);
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.service_areas.findMany({
      where: { area_id: areaId, areas_cliente: { customers: { company_id: companyId } } },
      select: { service_id: true },
    });
    return rows.map((r) => r.service_id);
  } catch (error) {
    logger.error('Error al cargar vínculos existentes del área', { data: { error, areaId } });
    throw error;
  }
}

/**
 * Vincula un área a uno o varios contratos del mismo cliente. Idempotente: sólo inserta los
 * que faltan y devuelve cuántos vinculó.
 */
export async function linkAreaToContracts(
  areaId: string,
  serviceIds: string[]
): Promise<{ ok: true; linked: number } | { ok: false; error: string }> {
  const ids = normalizeIds(serviceIds);
  if (!areaId || ids.length === 0) return { ok: false, error: 'Faltan datos para vincular' };

  const permissionError = await requireComercialPermission('areas-cliente', 'update');
  if (permissionError) return { ok: false, error: permissionError };
  const companyId = await getActiveCompanyId();
  try {
    const area = await findOwnedArea(areaId, companyId);
    if (!area) return { ok: false, error: 'Área no encontrada' };

    const owned = await prisma.customer_services.count({
      // Perímetro por la relación (customer_services.company_id es nullable).
      where: { id: { in: ids }, customer_id: area.customer_id, customers: { company_id: companyId } },
    });
    if (owned !== ids.length) return { ok: false, error: 'Uno o más contratos no pertenecen al cliente del área' };

    const existing = await prisma.service_areas.findMany({
      where: { area_id: areaId, service_id: { in: ids } },
      select: { service_id: true },
    });
    const { toAdd } = diffAssignments(
      existing.map((r) => r.service_id),
      [...existing.map((r) => r.service_id), ...ids]
    );
    if (toAdd.length === 0) return { ok: true, linked: 0 };

    await prisma.service_areas.createMany({ data: toAdd.map((service_id) => ({ service_id, area_id: areaId })) });
    logger.info('Área vinculada a contratos', { data: { areaId, linked: toAdd.length } });
    revalidatePath(COMERCIAL_PATH);
    return { ok: true, linked: toAdd.length };
  } catch (error) {
    logger.error('Error al vincular área a contratos', { data: { error, areaId } });
    return { ok: false, error: errorMessage(error, 'Error al guardar los vínculos') };
  }
}
