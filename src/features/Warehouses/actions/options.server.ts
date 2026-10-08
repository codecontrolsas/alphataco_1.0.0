'use server';

import { Prisma } from '@/generated/prisma/client';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { classifyBatch, dateColumnToYmd } from '../lib/batch-expiry';
import { findEmployeeOptions } from '../lib/employee-search';
import { otherEquipmentLabel, vehicleLabel } from '../lib/labels';
import { CLOSED_MAINTENANCE_ORDER_STATUSES } from '../lib/stock-engine-constants';

/**
 * Opciones de los selectores del formulario de movimientos. Todas filtran en el servidor con un
 * tope de resultados y devuelven el total, para el aviso "Mostrando X de Y" (los catalogos de
 * materiales y empleados son grandes: no se traen enteros al cliente).
 *
 * Los destinos solo ofrecen lo vigente: empleados/equipos/clientes activos y ordenes de
 * mantenimiento abiertas. El motor lo vuelve a validar al registrar.
 */

const logger = new Logger('features/Warehouses/options');

/** Cuantas opciones devuelve cada busqueda. */
const OPTIONS_LIMIT = 30;

const contains = (query: string) => ({ contains: query.trim(), mode: 'insensitive' as const });

/**
 * Los selectores los usan quienes registran movimientos (`create`) o solo ajustan (`adjust`), y
 * en Pedidos quien pide (`create`: materiales y destinos) y quien entrega (`update`: depositos,
 * lotes y unidades).
 */
async function canUseMovementForm(): Promise<boolean> {
  const checks = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'create'),
    checkPermissionServer('almacenes', 'movimientos', 'adjust'),
    checkPermissionServer('almacenes', 'pedidos', 'create'),
    checkPermissionServer('almacenes', 'pedidos', 'update'),
  ]);
  return checks.some(Boolean);
}

export interface SearchResult<T> {
  items: T[];
  total: number;
}

const empty = <T,>(): SearchResult<T> => ({ items: [], total: 0 });

/** Depositos activos y clientes activos con sus contratos: listas cortas, se cargan con la pagina. */
export async function getMovementFormLookups() {
  if (!(await canUseMovementForm())) return { warehouses: [], customers: [] };
  const companyId = await getActiveCompanyId();
  const [warehouses, customers] = await Promise.all([
    prisma.warehouses.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.customers.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        name: true,
        customer_services: {
          where: { is_active: true },
          select: { id: true, service_name: true, contract_number: true },
          orderBy: { service_name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);
  return { warehouses, customers };
}

export type MovementFormLookups = Awaited<ReturnType<typeof getMovementFormLookups>>;

export async function searchMaterialOptions(query: string) {
  if (!(await canUseMovementForm())) return empty<MaterialOption>();
  const companyId = await getActiveCompanyId();
  const where = {
    company_id: companyId,
    ...(query.trim() ? { OR: [{ code: contains(query) }, { name: contains(query) }] } : {}),
  };
  try {
    const [items, total] = await Promise.all([
      prisma.materials.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          tracking_type: true,
          is_active: true,
          unit: { select: { abbreviation: true } },
        },
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        take: OPTIONS_LIMIT,
      }),
      prisma.materials.count({ where }),
    ]);
    return {
      items: items.map(({ unit, ...m }) => ({ ...m, unit: unit.abbreviation, label: `${m.code} · ${m.name}` })),
      total,
    };
  } catch (error) {
    logger.error('Error al buscar materiales', { data: { error } });
    throw error;
  }
}

export type MaterialOption = {
  id: string;
  label: string;
  code: string;
  name: string;
  tracking_type: 'QUANTITY' | 'SERIAL' | 'BATCH';
  is_active: boolean;
  unit: string;
};

export async function searchEmployeeOptions(query: string) {
  if (!(await canUseMovementForm())) return empty<{ id: string; label: string }>();
  return findEmployeeOptions(await getActiveCompanyId(), query, OPTIONS_LIMIT);
}

export async function searchVehicleOptions(query: string) {
  if (!(await canUseMovementForm())) return empty<{ id: string; label: string }>();
  const companyId = await getActiveCompanyId();
  const where = {
    company_id: companyId,
    is_active: true,
    ...(query.trim()
      ? { OR: [{ intern_number: contains(query) }, { domain: contains(query) }, { serie: contains(query) }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vehicles.findMany({
      where,
      select: { id: true, intern_number: true, domain: true, serie: true },
      orderBy: [{ intern_number: 'asc' }],
      take: OPTIONS_LIMIT,
    }),
    prisma.vehicles.count({ where }),
  ]);
  return {
    items: rows.map((v) => ({
      id: v.id,
      label: vehicleLabel(v),
    })),
    total,
  };
}

export async function searchOtherEquipmentOptions(query: string) {
  if (!(await canUseMovementForm())) return empty<{ id: string; label: string }>();
  const companyId = await getActiveCompanyId();
  const where = {
    company_id: companyId,
    is_active: true,
    ...(query.trim()
      ? { OR: [{ intern_number: contains(query) }, { serial_number: contains(query) }, { type: { name: contains(query) } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.other_equipment.findMany({
      where,
      select: { id: true, intern_number: true, serial_number: true, type: { select: { name: true } } },
      orderBy: [{ intern_number: 'asc' }],
      take: OPTIONS_LIMIT,
    }),
    prisma.other_equipment.count({ where }),
  ]);
  return {
    items: rows.map((e) => ({
      id: e.id,
      label: otherEquipmentLabel(e),
    })),
    total,
  };
}

export async function searchMaintenanceOrderOptions(query: string) {
  if (!(await canUseMovementForm())) return empty<{ id: string; label: string }>();
  const companyId = await getActiveCompanyId();
  const where = {
    company_id: companyId,
    status: { notIn: [...CLOSED_MAINTENANCE_ORDER_STATUSES] },
    ...(query.trim()
      ? {
          OR: [
            { order_number: contains(query) },
            { vehicles: { domain: contains(query) } },
            { vehicles: { intern_number: contains(query) } },
            { other_equipment: { intern_number: contains(query) } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.maintenance_orders.findMany({
      where,
      select: {
        id: true,
        order_number: true,
        vehicles: { select: { domain: true, intern_number: true, serie: true } },
        other_equipment: { select: { intern_number: true, serial_number: true, type: { select: { name: true } } } },
      },
      orderBy: [{ created_at: 'desc' }],
      take: OPTIONS_LIMIT,
    }),
    prisma.maintenance_orders.count({ where }),
  ]);
  return {
    items: rows.map((o) => {
      const equipment = o.vehicles ? vehicleLabel(o.vehicles) : o.other_equipment ? otherEquipmentLabel(o.other_equipment) : '';
      return { id: o.id, label: [o.order_number ?? 'Sin número', equipment].filter(Boolean).join(' · ') };
    }),
    total,
  };
}

/**
 * Lo disponible de un material en un deposito, para la linea del formulario: cantidad total,
 * lotes con saldo (el que vence primero, primero: FEFO) y unidades serializadas en stock.
 */
export async function getMaterialAvailability(materialId: string, warehouseId: string) {
  // Quien solo pide (`pedidos:create`) no ve stock: la disponibilidad es para registrar o entregar.
  const checks = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'create'),
    checkPermissionServer('almacenes', 'movimientos', 'adjust'),
    checkPermissionServer('almacenes', 'pedidos', 'update'),
  ]);
  if (!checks.some(Boolean)) return null;
  const companyId = await getActiveCompanyId();
  const [balances, units] = await Promise.all([
    prisma.stock_balances.findMany({
      where: { company_id: companyId, material_id: materialId, warehouse_id: warehouseId, quantity: { gt: 0 } },
      select: {
        quantity: true,
        batch: { select: { id: true, batch_number: true, expires_at: true } },
      },
    }),
    prisma.material_units.findMany({
      where: { company_id: companyId, material_id: materialId, warehouse_id: warehouseId, status: 'IN_STOCK' },
      select: { id: true, serial_number: true },
      orderBy: { serial_number: 'asc' },
    }),
  ]);

  const total = balances.reduce((acc, b) => acc.plus(b.quantity), new Prisma.Decimal(0));
  const today = argentinaDate();
  const batches = balances
    .filter((b) => b.batch)
    .map((b) => {
      const expiresAt = b.batch!.expires_at ? dateColumnToYmd(b.batch!.expires_at) : null;
      return {
        id: b.batch!.id,
        batchNumber: b.batch!.batch_number,
        expiresAt,
        quantity: b.quantity.toString(),
        // El motor rechaza sacarlo; el formulario lo muestra deshabilitado para no ofrecerlo.
        expired: classifyBatch(expiresAt, today) === 'EXPIRED',
      };
    })
    .sort((a, b) => (a.expiresAt ?? '9999-12-31').localeCompare(b.expiresAt ?? '9999-12-31'));

  return { total: total.toString(), batches, units };
}

export type MaterialAvailability = NonNullable<Awaited<ReturnType<typeof getMaterialAvailability>>>;
