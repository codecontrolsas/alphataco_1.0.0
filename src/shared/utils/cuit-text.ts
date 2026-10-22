/** Solo dígitos: quita guiones y espacios (el input admite "30-71234567-3"). */
export function normalizeCuit(value: string): string {
  return value.replace(/[-\s]/g, '');
}

/** Dígito verificador del CUIT/CUIL (11 dígitos, con o sin guiones). */
export function isValidCuit(cuit: string): boolean {
  const digits = normalizeCuit(cuit);
  if (!/^\d{11}$/.test(digits)) return false;
  const coefficients = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * coefficients[i];
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  return Number(digits[10]) === check;
}

/** CUIT con guiones (`30712345678` → `30-71234567-8`). Si no tiene 11 dígitos, se devuelve tal cual. */
export function formatCuitText(cuit: string | number | bigint): string {
  const digits = String(cuit);
  return /^\d{11}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : digits;
}
