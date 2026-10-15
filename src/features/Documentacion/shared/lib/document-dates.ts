/**
 * Vencimiento de un documento tal como lo eligió la persona en pantalla, como medianoche ARGENTINA
 * (UTC-3, sin horario de verano). Usar la medianoche del navegador corre el día cuando quien carga
 * no está en Argentina (en Madrid, "14/10" se guardaba como 13/10 a las 19 h argentinas).
 *
 * Acepta el texto de un `<input type="date">` (`YYYY-MM-DD`) o la `Date` que devuelve un calendario
 * (de la que se toma el día local, que es el que se ve en pantalla).
 */
export function toArgentinaValidityIso(value: string | Date): string {
  if (typeof value === 'string') return `${value.slice(0, 10)}T00:00:00-03:00`;
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}T00:00:00-03:00`;
}
