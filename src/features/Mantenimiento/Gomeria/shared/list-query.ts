/**
 * Armado de consultas compartido por los listados de Gomería (órdenes, catálogo, marcas, tipos, plantillas).
 * Módulo sin directiva: lo importan archivos `'use server'`, así que no puede exportar nada que no sea servidor-seguro.
 */

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
export const GOMERIA_EXPORT_MAX_ROWS = 10_000;

/**
 * Pone TODAS las condiciones (perímetro, búsqueda, filtros, texto, fechas, extras) dentro de un único `AND`.
 * Así ninguna condición pisa a otra con una clave repetida (`company_id`, `AND`, `OR`) y el perímetro
 * de la empresa no se puede sobrescribir desde un filtro. Las partes vacías se descartan.
 */
export function composeAnd<Where>(...parts: ReadonlyArray<object | null | undefined>): { AND: Where[] } {
  const conditions = parts.filter((part): part is object => part != null && Object.keys(part).length > 0);
  return { AND: conditions as Where[] };
}
