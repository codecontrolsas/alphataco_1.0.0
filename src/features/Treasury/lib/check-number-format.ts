/** Numeración de las operaciones de cheques: CD- depósitos, CL- liquidaciones de descuento, CR- rechazos. */
export const CHECK_OPERATION_PREFIX = { DEPOSIT: 'CD', DISCOUNT: 'CL', REJECTION: 'CR' } as const;

export type NumberedCheckOperation = keyof typeof CHECK_OPERATION_PREFIX;

export function formatCheckOperationNumber(kind: NumberedCheckOperation, n: number): string {
  return `${CHECK_OPERATION_PREFIX[kind]}-${String(n).padStart(6, '0')}`;
}

/** Banco normalizado (es parte de la clave de cheques repetidos): sin espacios de más y en mayúsculas. */
export function normalizeBank(bank: string): string {
  return bank.trim().replace(/\s+/g, ' ').toUpperCase();
}
