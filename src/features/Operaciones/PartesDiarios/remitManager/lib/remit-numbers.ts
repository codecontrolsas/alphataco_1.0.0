import type { Prisma } from '@/generated/prisma/client';

/**
 * Remitos de una línea del parte diario: la ÚNICA fuente es la tabla `remitos` (una línea puede tener
 * varios). La columna vieja `dailyreportrows.remit_number` se eliminó; toda lectura, filtro o búsqueda
 * de remitos pasa por estos helpers para que todas las pantallas muestren el mismo dato.
 */

/** Select de los números de remito de una línea, en orden de carga. */
export const REMIT_NUMBERS_SELECT = {
  select: { id: true, remit_number: true },
  orderBy: { created_at: 'asc' },
} satisfies Prisma.dailyreportrows$remitosArgs;

/** Números de remito de una línea (vacío si no tiene). */
export function remitNumbersOf(row: { remitos?: { remit_number: string }[] | null }): string[] {
  return (row.remitos ?? []).map((remito) => remito.remit_number).filter(Boolean);
}

/** Filtro "algún remito de la línea contiene `term`" (sin distinguir mayúsculas). */
export function remitNumberContainsWhere(term: string): Prisma.dailyreportrowsWhereInput {
  return { remitos: { some: { remit_number: { contains: term.trim(), mode: 'insensitive' } } } };
}
