import { Prisma } from '@/generated/prisma/client';

/**
 * Costo promedio ponderado de un material, a nivel empresa (spec §3.3).
 *
 * Solo dos cosas lo mueven: una entrada (o la anulacion de una salida, que reingresa a su
 * costo original) y la anulacion de una entrada. Salidas, transferencias y ajustes se valuan
 * al promedio vigente y no lo cambian.
 *
 * Funciones puras: el motor de stock les pasa el stock total de la empresa y el promedio ya
 * bloqueados, y escribe el resultado.
 */

/** Escala del costo: 4 decimales, como las columnas `Decimal(15, 4)`. */
export const COST_SCALE = 4;

type DecimalLike = Prisma.Decimal | string | number;

const dec = (value: DecimalLike) => new Prisma.Decimal(value);
const round = (value: Prisma.Decimal) => value.toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Promedio despues de ingresar `qtyIn` unidades a `costIn` cada una.
 * Sin stock previo (o con stock no positivo) el promedio pasa a ser el costo de la entrada.
 */
export function averageCostAfterEntry(
  stockQty: DecimalLike,
  averageCost: DecimalLike,
  qtyIn: DecimalLike,
  costIn: DecimalLike
): Prisma.Decimal {
  const q = dec(stockQty);
  if (q.lte(0)) return round(dec(costIn));
  const total = q.plus(qtyIn);
  return round(q.times(averageCost).plus(dec(qtyIn).times(costIn)).dividedBy(total));
}

/**
 * Promedio despues de retirar una entrada anulada: sale `qtyOut` al costo con el que entro.
 * Si no queda stock, el promedio conserva su ultimo valor (no hay nada que promediar, y el
 * proximo ingreso lo reemplaza). Nunca baja de 0: con costos muy desparejos la cuenta puede
 * dar negativa por redondeo, y un costo negativo no tiene sentido.
 */
export function averageCostAfterEntryReversal(
  stockQty: DecimalLike,
  averageCost: DecimalLike,
  qtyOut: DecimalLike,
  costOut: DecimalLike
): Prisma.Decimal {
  const q = dec(stockQty);
  const remaining = q.minus(qtyOut);
  if (remaining.lte(0)) return round(dec(averageCost));
  const value = q.times(averageCost).minus(dec(qtyOut).times(costOut)).dividedBy(remaining);
  return value.isNegative() ? new Prisma.Decimal(0) : round(value);
}

/** Importe de una linea: cantidad × costo unitario, a 4 decimales. */
export function lineTotal(quantity: DecimalLike, unitCost: DecimalLike): Prisma.Decimal {
  return round(dec(quantity).times(unitCost));
}
