/** Texto del vencimiento (módulo sin dependencias: lo usa la campana de avisos, que es cliente). */
/** "Vence hoy", "vence en 3 días", "venció hace 2 días". */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'Vence hoy';
  if (daysLeft === 1) return 'Vence mañana';
  if (daysLeft > 1) return `Vence en ${daysLeft} días`;
  if (daysLeft === -1) return 'Venció ayer';
  return `Venció hace ${Math.abs(daysLeft)} días`;
}
