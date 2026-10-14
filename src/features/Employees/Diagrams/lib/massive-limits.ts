/**
 * Topes de las cargas masivas de diagramas/novedades. Módulo SIN directiva: lo importan el formulario
 * (cliente) y las server actions, para que el límite que ve el usuario sea el mismo que se hace cumplir
 * en el servidor.
 */

/** Máximo de empleados por carga masiva. */
export const MASSIVE_MAX_EMPLOYEES = 100;

/** Máximo de días entre la fecha desde y la fecha hasta (diferencia, no cantidad inclusiva). */
export const MASSIVE_MAX_DAYS_RANGE = 90;

/** Máximo de filas (empleado × día) que acepta una sola llamada de alta/modificación de novedades. */
export const DIAGRAM_MUTATION_MAX_ROWS = 10_000;
