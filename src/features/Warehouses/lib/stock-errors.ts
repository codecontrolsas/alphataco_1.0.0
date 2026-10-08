/**
 * Errores de negocio del motor de stock. El mensaje es para el usuario, con los datos
 * concretos ("hay 12 l, se pidieron 20 l"): las actions lo devuelven tal cual en el
 * `ActionResult`. Cualquier otro error se loguea y se reemplaza por un mensaje generico.
 */
export type StockErrorCode =
  | 'INVALID_INPUT'
  | 'INSUFFICIENT_STOCK'
  | 'EXPIRED_BATCH'
  | 'NOT_ON_LOAN'
  | 'INACTIVE_MATERIAL'
  | 'INACTIVE_WAREHOUSE'
  | 'NOT_FOUND'
  | 'INVALID_TRACKING'
  | 'BATCH_EXPIRY_MISMATCH'
  | 'DUPLICATE_SERIAL'
  | 'UNIT_NOT_AVAILABLE'
  | 'INVALID_DESTINATION'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE_REVERSAL'
  | 'OVER_DELIVERY'
  | 'DIRECT_EXIT_LIMIT'
  | 'INVALID_STATE'
  | 'MANAGED_ELSEWHERE';

export class StockError extends Error {
  readonly code: StockErrorCode;

  constructor(code: StockErrorCode, message: string) {
    super(message);
    this.name = 'StockError';
    this.code = code;
  }
}
