import 'server-only';

import { argentinaDate } from '@/features/Jobs/lib/dates';
import { dateColumnToYmd, daysBetween } from './batch-expiry';
import { DESTINATION_SELECT, destinationLabel } from './labels';

/**
 * Un prestamo abierto es una unidad serializada en estado `OUT` (spec etapa 2 §4.1). Esta es la
 * UNICA forma de leer quien la tiene y desde cuando: la usan la seccion Prestamos y el detalle
 * del material, para que no puedan diferir.
 *
 * - Quien la tiene: el destino de su ultimo movimiento (una salida, o la anulacion de una
 *   devolucion, que copia el destino de la salida).
 * - Desde cuando: la fecha de la SALIDA original. Si el ultimo movimiento es la anulacion de
 *   una devolucion, la salida es la que apunta esa devolucion (`returned_from`).
 */
export const LOAN_UNIT_SELECT = {
  id: true,
  serial_number: true,
  material: { select: { id: true, code: true, name: true } },
  last_movement: {
    select: {
      id: true,
      number: true,
      type: true,
      occurred_on: true,
      ...DESTINATION_SELECT,
      returned_from: { select: { id: true, number: true, occurred_on: true } },
    },
  },
} as const;

interface LoanUnitRow {
  id: string;
  serial_number: string;
  material: { id: string; code: string; name: string };
  last_movement:
    | (Parameters<typeof destinationLabel>[0] & {
        id: string;
        number: string;
        type: string;
        occurred_on: Date;
        returned_from: { id: string; number: string; occurred_on: Date } | null;
      })
    | null;
}

export function toLoan(unit: LoanUnitRow, today: string = argentinaDate()) {
  const last = unit.last_movement;
  const exit = last ? (last.type === 'EXIT' ? last : last.returned_from) : null;
  const since = exit ? dateColumnToYmd(exit.occurred_on) : null;
  return {
    unitId: unit.id,
    serialNumber: unit.serial_number,
    material: unit.material,
    destinationType: last?.destination_type ?? null,
    holder: last ? destinationLabel(last) : null,
    exitMovementId: exit?.id ?? null,
    exitNumber: exit?.number ?? null,
    since,
    days: since ? Math.max(0, daysBetween(since, today)) : null,
  };
}

export type Loan = ReturnType<typeof toLoan>;
