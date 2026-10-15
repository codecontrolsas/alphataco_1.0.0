/**
 * Reglas de presentacion de los prestamos que se usan de los dos lados (servidor y cliente). Sin
 * `server-only`: la columna "Dias en prestamo" de la tabla y la banda de atencion las comparten con el
 * conteo del servidor (`staleLoansWhere` en `loans.ts`).
 *
 * UNICO lugar de verdad del umbral de "prestamo viejo": no hay fecha de devolucion prevista, asi que
 * un prestamo se considera viejo cuando lleva `STALE_LOAN_DAYS` dias o mas desde la salida.
 */
export const STALE_LOAN_DAYS = 30;

/** `days` = dias desde la salida (`toLoan`). Sin fecha de salida no se puede afirmar que sea viejo. */
export function isStaleLoan(days: number | null | undefined): boolean {
  return days != null && days >= STALE_LOAN_DAYS;
}
