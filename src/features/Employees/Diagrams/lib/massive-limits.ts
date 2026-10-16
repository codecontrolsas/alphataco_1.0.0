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

/** Máximo de rangos de fechas por carga (masiva por novedad e individual). */
export const MASSIVE_MAX_RANGES = 10;

/**
 * Máximo de días (inclusivos) entre todos los rangos de una carga masiva. Es el mismo tope de siempre
 * (`MASSIVE_MAX_DAYS_RANGE` es una diferencia, por eso suma 1): varios rangos no permiten saltearlo.
 */
export const MASSIVE_MAX_TOTAL_DAYS = MASSIVE_MAX_DAYS_RANGE + 1;

/** Máximo de días (inclusivos) entre todos los rangos de una carga individual (tope de consulta del servidor). */
export const INDIVIDUAL_MAX_TOTAL_DAYS = 366;
