'use server';

import { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { dateColumnToYmd } from '../lib/batch-expiry';
import { replayKardex } from '../lib/kardex';
import { DESTINATION_SELECT, destinationLabel } from '../lib/labels';
import { LOAN_UNIT_SELECT, toLoan } from '../lib/loans';

const logger = new Logger('features/Warehouses/materials-detail');

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
    const [material, loanedUnits, writeOffs] = await Promise.all([
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
        orderBy: { created_at: 'desc' },
      }),
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
      belowMinimum: material.min_stock != null && total.lt(material.min_stock),
      totalStock: total.toString(),
      averageCost: canViewPrices ? material.average_cost.toFixed(4) : null,
      stockValue: canViewPrices ? total.times(material.average_cost).toFixed(2) : null,
      stock,
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

export type MaterialDetail = NonNullable<Awaited<ReturnType<typeof getMaterialDetail>>>;

/**
 * Kardex del material: todas sus lineas de movimiento con el saldo de la empresa y el costo
 * promedio resultante despues de cada una.
 *
 * El orden es el de APLICACION (numero `MOV-`, ver `lib/kardex.ts`), no el de la fecha del hecho: es el orden en que el
 * motor aplico los movimientos, y el unico en que el saldo acumulado y el promedio coinciden con
 * lo que calculo el motor (un movimiento cargado con fecha atrasada se aplico despues). La fecha
 * del hecho se muestra igual en cada fila.
 *
 * El promedio se reconstruye repitiendo la misma regla que el motor (`average-cost.ts`): solo lo
 * mueven las entradas y las anulaciones de entradas y salidas.
 */
export async function getMaterialKardex(id: string) {
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('almacenes', 'stock', 'view'),
    checkPermissionServer('almacenes', 'stock', 'view_prices'),
  ]);
  if (!canView) return [];
  const companyId = await getActiveCompanyId();

  const lines = await prisma.stock_movement_lines.findMany({
    where: { material_id: id, movement: { company_id: companyId } },
    select: {
      id: true,
      quantity: true,
      direction: true,
      unit_cost: true,
      batch: { select: { batch_number: true } },
      unit: { select: { serial_number: true } },
      movement: {
        select: {
          id: true,
          number: true,
          type: true,
          occurred_on: true,
          created_at: true,
          reverses_movement_id: true,
          warehouse: { select: { name: true } },
          target_warehouse: { select: { name: true } },
          ...DESTINATION_SELECT,
        },
      },
    },
    orderBy: [{ movement: { number: 'asc' } }, { id: 'asc' }],
  });

  const steps = replayKardex(lines);

  return lines.map((line, i) => {
    const m = line.movement;
    const quantity = line.quantity;
    const isTransfer = m.type === 'TRANSFER';
    const isReversal = m.reverses_movement_id !== null;
    const { balance, average } = steps[i]!;

    return {
      id: line.id,
      movementId: m.id,
      number: m.number,
      type: m.type,
      isReversal,
      occurredOn: dateColumnToYmd(m.occurred_on),
      warehouse: isTransfer
        ? line.direction === -1
          ? `${m.warehouse.name} → ${m.target_warehouse?.name ?? ''}`
          : `${m.target_warehouse?.name ?? ''} → ${m.warehouse.name}`
        : m.warehouse.name,
      destination: destinationLabel(m),
      batch: line.batch?.batch_number ?? null,
      serialNumber: line.unit?.serial_number ?? null,
      inbound: !isTransfer && line.direction === 1 ? quantity.toString() : null,
      outbound: !isTransfer && line.direction === -1 ? quantity.toString() : null,
      transferred: isTransfer ? quantity.toString() : null,
      balance: balance.toString(),
      unitCost: canViewPrices ? line.unit_cost.toFixed(4) : null,
      averageCost: canViewPrices ? average.toFixed(4) : null,
    };
  });
}

export type MaterialKardexRow = Awaited<ReturnType<typeof getMaterialKardex>>[number];
