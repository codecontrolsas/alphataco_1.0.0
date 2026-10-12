/** `RE-000001`. Pasado 999999 sigue creciendo sin truncar. */
export function formatReceiptNumber(sequence: number): string {
  return `RE-${String(sequence).padStart(6, '0')}`;
}
