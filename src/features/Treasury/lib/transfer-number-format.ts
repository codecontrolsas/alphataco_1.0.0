/** `TR-000001`. Pasado 999999 sigue creciendo sin truncar. */
export function formatTransferNumber(sequence: number): string {
  return `TR-${String(sequence).padStart(6, '0')}`;
}
