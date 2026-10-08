import { Prisma } from '@/generated/prisma/client';
import { averageCostAfterEntry, averageCostAfterEntryReversal } from './average-cost';

/** Lo minimo de una linea de movimiento para reconstruir el kardex. */
export interface KardexLineInput {
  quantity: Prisma.Decimal;
  direction: number;
  unit_cost: Prisma.Decimal;
  movement: { type: 'ENTRY' | 'EXIT' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN'; reverses_movement_id: string | null };
}

export interface KardexStep {
  /** Saldo de la empresa despues de la linea. */
  balance: Prisma.Decimal;
  /** Costo promedio despues de la linea. */
  average: Prisma.Decimal;
}

/**
 * Reproduce el saldo y el costo promedio de un material linea por linea, con la MISMA regla que
 * el motor (`average-cost.ts`): solo mueven el promedio las entradas, las devoluciones y las
 * anulaciones de entradas, devoluciones y salidas, calculadas con el saldo anterior a la linea. Las lineas tienen que
 * venir en el orden en que el motor las APLICO: por `movement.number` y despues `id`.
 *
 * No sirve `created_at`: es el inicio de la transaccion, y una transaccion que empezo antes puede
 * tomar el lock del material despues que otra. El numero se asigna al final, bajo advisory lock y
 * despues del lock del material, asi que es monotono en el orden de aplicacion. Se ordena como
 * texto: vale mientras tenga 6 digitos (hasta MOV-999999 por empresa).
 *
 * Que el ultimo paso coincida con `materials.average_cost` lo verifica la integracion del motor.
 */
export function replayKardex(lines: KardexLineInput[]): KardexStep[] {
  let balance = new Prisma.Decimal(0);
  let average = new Prisma.Decimal(0);

  return lines.map((line) => {
    const { type, reverses_movement_id } = line.movement;
    const isReversal = reverses_movement_id !== null;

    // Una devolucion reingresa al costo de la salida: para el promedio es una entrada, igual
    // que la anulacion de una salida. Su anulacion es la anulacion de una entrada.
    if (type === 'ENTRY' || type === 'RETURN') {
      average = isReversal
        ? averageCostAfterEntryReversal(balance, average, line.quantity, line.unit_cost)
        : averageCostAfterEntry(balance, average, line.quantity, line.unit_cost);
    } else if (type === 'EXIT' && isReversal) {
      average = averageCostAfterEntry(balance, average, line.quantity, line.unit_cost);
    }

    // Una transferencia no cambia el stock de la empresa.
    if (type !== 'TRANSFER') balance = balance.plus(line.quantity.times(line.direction));
    return { balance, average };
  });
}
