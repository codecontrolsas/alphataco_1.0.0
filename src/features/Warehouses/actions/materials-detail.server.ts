'use server';

import { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { dateColumnToYmd } from '../lib/batch-expiry';
import { replayKardex } from '../lib/kardex';
import { DESTINATION_SELECT, destinationLabel } from '../lib/labels';
import { LOAN_UNIT_SELECT, toLoan } from '../lib/loans';

const logger = new Logger('features/Warehouses/materials-detail');

/** Filas que se traen por vez en las listas del detalle (unidades en depósito, bajas, kardex). */
const DETAIL_LIST_LIMIT = 200;

/**
 * Unidad (abreviatura) del material para la página de detalle, o `null` si no existe, es de otra empresa
 * o el usuario no puede ver Stock. La página queda delgada: nada de Prisma directo en `app/`.
 */
export async function getMaterialUnitForPage(id: string): Promise<string | null> {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return null;
  const material = await prisma.materials.findFirst({
    where: { id, company_id: await getActiveCompanyId() },
    select: { unit: { select: { abbreviation: true } } },
  });
  return material?.unit.abbreviation ?? null;
}

/**
 * Detalle de un material: datos, stock por deposito (y por lote) y unidades serializadas.
 * Se llega desde la tabla de Stock, asi que hereda su permiso. Sin `view_prices` el costo
 * promedio no sale del servidor.
 */
export async function getMaterialDetail(id: string) {
  const [canView, canViewPrices, canViewLoans] = await Promise.all([
    checkPermissionServer('almacenes', 'stock', 'view'),
    checkPermissionServer('almacenes', 'stock', 'view_prices'),
    // Quien tiene cada herramienta es informacion de Prestamos: sin ese permiso no sale.
    checkPermissionServer('almacenes', 'prestamos', 'view'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  const today = argentinaDate();

  try {
    const [material, loanedUnits, writeOffs, unitsInStockTotal, writeOffsTotal] = await Promise.all([
      prisma.materials.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        tracking_type: true,
        requires_approval: true,
        min_stock: true,
        average_cost: true,
        is_active: true,
        category: { select: { name: true } },
        unit: { select: { name: true, abbreviation: true } },
        stock_balances: {
          where: { quantity: { gt: 0 } },
          select: {
            quantity: true,
            warehouse: { select: { id: true, code: true, name: true } },
            batch: { select: { batch_number: true, expires_at: true } },
          },
        },
        units: {
          where: { status: 'IN_STOCK' },
          select: { id: true, serial_number: true, warehouse: { select: { name: true } } },
          orderBy: { serial_number: 'asc' },
          take: DETAIL_LIST_LIMIT,
        },
      },
      }),
      prisma.material_units.findMany({
        where: canViewLoans ? { material_id: id, company_id: companyId, status: 'OUT' } : { id: { in: [] } },
        select: LOAN_UNIT_SELECT,
        orderBy: { serial_number: 'asc' },
      }),
      prisma.material_unit_write_offs.findMany({
        where: canViewLoans ? { company_id: companyId, unit: { material_id: id } } : { id: { in: [] } },
        select: {
          id: true,
          reason: true,
          notes: true,
          created_at: true,
          unit: { select: { serial_number: true } },
          loan_movement: { select: DESTINATION_SELECT },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: DETAIL_LIST_LIMIT,
      }),
      prisma.material_units.count({ where: { material_id: id, company_id: companyId, status: 'IN_STOCK' } }),
      canViewLoans
        ? prisma.material_unit_write_offs.count({ where: { company_id: companyId, unit: { material_id: id } } })
        : Promise.resolve(0),
    ]);
    if (!material) return null;

    const total = material.stock_balances.reduce((acc, b) => acc.plus(b.quantity), new Prisma.Decimal(0));
    const stock = material.stock_balances
      .map((b) => ({
        warehouse: b.warehouse,
        batch: b.batch?.batch_number ?? null,
        expiresAt: b.batch?.expires_at ? dateColumnToYmd(b.batch.expires_at) : null,
        quantity: b.quantity.toString(),
      }))
      .sort(
        (a, b) =>
          a.warehouse.name.localeCompare(b.warehouse.name) ||
          (a.expiresAt ?? '9999-12-31').localeCompare(b.expiresAt ?? '9999-12-31')
      );

    return {
      id: material.id,
      code: material.code,
      name: material.name,
      description: material.description,
      trackingType: material.tracking_type,
      requiresApproval: material.requires_approval,
      isActive: material.is_active,
      category: material.category?.name ?? null,
      unit: material.unit,
      minStock: material.min_stock?.toString() ?? null,
      /** Misma regla que `lib/stock-levels.ts`: activo, con mínimo definido y por debajo (agotado incluido). */
      stockLevel: (material.is_active && material.min_stock != null && total.lt(material.min_stock)
        ? total.lte(0)
          ? 'OUT_OF_STOCK'
          : 'BELOW_MIN'
        : null) as 'OUT_OF_STOCK' | 'BELOW_MIN' | null,
      totalStock: total.toString(),
      averageCost: canViewPrices ? material.average_cost.toFixed(4) : null,
      stockValue: canViewPrices ? total.times(material.average_cost).toFixed(2) : null,
      stock,
      unitsInStockTotal,
      writeOffsTotal,
      unitsInStock: material.units.map((u) => ({ id: u.id, serialNumber: u.serial_number, warehouse: u.warehouse?.name ?? null })),
      unitsOnLoan: loanedUnits.map((u) => toLoan(u, today)),
      writeOffs: writeOffs.map((w) => ({
        id: w.id,
        serialNumber: w.unit.serial_number,
        reason: w.reason,
        notes: w.notes,
        holder: destinationLabel(w.loan_movement),
        date: w.created_at.toISOString(),
      })),
    };
  } catch (error) {
    logger.error('Error al obtener el detalle del material', { data: { error, id } });
    throw error;
  }
}

/**
 * Kardex del material: sus lineas de movimiento con el saldo de la empresa y el costo promedio
 * resultante despues de cada una.
 *
 * El orden es el de APLICACION (numero `MOV-`, ver `lib/kardex.ts`), no el de la fecha del hecho: es el orden en que el
 * motor aplico los movimientos, y el unico en que el saldo acumulado y el promedio coinciden con
 * lo que calculo el motor (`created_at` no sirve: es el inicio de la transaccion). El numero se compara
 * por su valor numerico (no como texto), asi que sigue ordenando bien pasado MOV-999999.
 *
 * El saldo y el promedio dependen de TODA la historia: se reproduce completa en el servidor con una
 * consulta liviana, pero al cliente solo viajan `DETAIL_LIST_LIMIT` filas por vez (las mas recientes
 * primero; `offset` = filas recientes ya cargadas). Las filas salen en orden cronologico.
 *
 * El promedio se reconstruye repitiendo la misma regla que el motor (`average-cost.ts`): solo lo
 * mueven las entradas y las anulaciones de entradas y salidas.
 */
export async function getMaterialKardexPage(id: string, offset = 0) {
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('almacenes', 'stock', 'view'),
    checkPermissionServer('almacenes', 'stock', 'view_prices'),
  ]);
  if (!canView) return { rows: [], total: 0, hasMore: false };
  const companyId = await getActiveCompanyId();
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;

  // 1) Historia completa, solo lo necesario para reproducir el saldo y el promedio.
  const history = await prisma.stock_movement_lines.findMany({
    where: { material_id: id, movement: { company_id: companyId } },
    select: {
      id: true,
      quantity: true,
      direction: true,
      unit_cost: true,
      movement: { select: { number: true, type: true, reverses_movement_id: true } },
    },
  });
  const sequence = (number: string) => Number(number.replace(/\D/g, ''));
  history.sort((a, b) => sequence(a.movement.number) - sequence(b.movement.number) || a.id.localeCompare(b.id));

  const steps = replayKardex(history);
  const total = history.length;
  const end = Math.max(total - safeOffset, 0);
  const start = Math.max(end - DETAIL_LIST_LIMIT, 0);
  const window = history.slice(start, end);
  if (window.length === 0) return { rows: [], total, hasMore: false };

  // 2) Detalle (depositos, destinos, lotes, series) solo de las filas que se muestran.
  const details = await prisma.stock_movement_lines.findMany({
    where: { id: { in: window.map((l) => l.id) }, movement: { company_id: companyId } },
    select: {
      id: true,
      batch: { select: { batch_number: true } },
      unit: { select: { serial_number: true } },
      movement: {
        select: {
          id: true,
          occurred_on: true,
          warehouse: { select: { name: true } },
          target_warehouse: { select: { name: true } },
          ...DESTINATION_SELECT,
        },
      },
    },
  });
  const detailById = new Map(details.map((d) => [d.id, d]));

  const rows = window.flatMap((line, i) => {
    const detail = detailById.get(line.id);
    if (!detail) return [];
    const m = { ...line.movement, ...detail.movement };
    const quantity = line.quantity;
    const isTransfer = m.type === 'TRANSFER';
    const { balance, average } = steps[start + i]!;

    return [
      {
        id: line.id,
        movementId: m.id,
        number: m.number,
        type: m.type,
        isReversal: m.reverses_movement_id !== null,
        occurredOn: dateColumnToYmd(m.occurred_on),
        warehouse: isTransfer
          ? line.direction === -1
            ? `${m.warehouse.name} → ${m.target_warehouse?.name ?? ''}`
            : `${m.target_warehouse?.name ?? ''} → ${m.warehouse.name}`
          : m.warehouse.name,
        destination: destinationLabel(m),
        batch: detail.batch?.batch_number ?? null,
        serialNumber: detail.unit?.serial_number ?? null,
        inbound: !isTransfer && line.direction === 1 ? quantity.toString() : null,
        outbound: !isTransfer && line.direction === -1 ? quantity.toString() : null,
        transferred: isTransfer ? quantity.toString() : null,
        balance: balance.toString(),
        unitCost: canViewPrices ? line.unit_cost.toFixed(4) : null,
        averageCost: canViewPrices ? average.toFixed(4) : null,
      },
    ];
  });

  return { rows, total, hasMore: start > 0 };
}

/** Las ultimas filas del kardex (la primera pagina de `getMaterialKardexPage`). */
export async function getMaterialKardex(id: string) {
  return (await getMaterialKardexPage(id)).rows;
}

export type MaterialKardexRow = Awaited<ReturnType<typeof getMaterialKardexPage>>['rows'][number];
