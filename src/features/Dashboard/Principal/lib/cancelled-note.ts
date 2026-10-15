/**
 * Nota de los recursos que hoy figuran en el parte solo en servicios cancelados: no cuentan
 * "en operación", pero se muestran aparte para que se vean. `undefined` cuando no hay ninguno.
 */
export function cancelledNote(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `+${count.toLocaleString('es-AR')} en ${count === 1 ? 'servicio cancelado' : 'servicios cancelados'}`;
}
