/**
 * Reglas de catalogo de Almacenes (spec §4.1). Puras, para testearlas sin base.
 *
 * Un registro que ya participo de movimientos no se borra: el historial (kardex, imputaciones)
 * lo referencia. Se desactiva, y deja de ofrecerse en los formularios.
 */

export type RemovalMode = 'delete' | 'deactivate';

/** Material: se borra solo si nunca tuvo movimientos. */
export function materialRemovalMode(movementCount: number): RemovalMode {
  return movementCount > 0 ? 'deactivate' : 'delete';
}

/** El tipo de control (cantidad, serie, lote) no cambia despues del primer movimiento. */
export function trackingTypeChangeError(movementCount: number, changed: boolean): string | null {
  if (!changed || movementCount === 0) return null;
  return 'El material ya tiene movimientos: no se puede cambiar cómo se controla su stock';
}

/** La unidad de medida tampoco: cambiarla reinterpretaria saldos e historial sin convertirlos. */
export function unitChangeError(movementCount: number, changed: boolean): string | null {
  if (!changed || movementCount === 0) return null;
  return 'El material ya tiene movimientos: no se puede cambiar su unidad de medida';
}

/**
 * Deposito: con stock no se puede dar de baja (quedaria inventario en un lugar que ya no se
 * ofrece). Sin stock: se borra si nunca tuvo movimientos, si no se desactiva.
 */
export function warehouseRemoval(
  stockQuantity: number,
  movementCount: number
): { mode: RemovalMode } | { error: string } {
  if (stockQuantity > 0) {
    return { error: 'El depósito tiene stock: transferilo o ajustalo antes de darlo de baja' };
  }
  return { mode: movementCount > 0 ? 'deactivate' : 'delete' };
}

/** Categoria o unidad: si algun material la usa, se desactiva en vez de borrarse. */
export function referencedRemovalMode(materialCount: number): RemovalMode {
  return materialCount > 0 ? 'deactivate' : 'delete';
}
