/**
 * Colores de los desvíos de recursos en el detalle del parte. Única fuente: la usan los badges de
 * empleados/equipos y la leyenda de la tabla, así el color que se ve en la celda siempre tiene su
 * explicación. Las clases van escritas completas (Tailwind v4 no genera clases armadas en runtime).
 *
 * Se conservan las familias de color que los usuarios ya leen (naranja = duplicado, azul = no
 * afectado al cliente, rojo = sin diagrama / no operativo…); solo se agregan texto y borde legibles
 * en los dos temas.
 */

export type DeviationTone = 'orange' | 'purple' | 'blue' | 'red' | 'yellow' | 'sky' | 'gray';

export const DEVIATION_BADGE_CLASSES: Record<DeviationTone, string> = {
  orange:
    'border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-950 dark:text-orange-100',
  purple:
    'border-purple-500 bg-purple-50 text-purple-900 dark:border-purple-400 dark:bg-purple-950 dark:text-purple-100',
  blue: 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100',
  red: 'border-red-500 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100',
  yellow:
    'border-yellow-500 bg-yellow-50 text-yellow-900 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100',
  sky: 'border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100',
  gray: 'border-gray-400 bg-transparent text-foreground',
};

/** Muestra (cuadradito) de cada color, para la leyenda. */
export const DEVIATION_SWATCH_CLASSES: Record<DeviationTone, string> = {
  orange: 'border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-950',
  purple: 'border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-950',
  blue: 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950',
  red: 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-950',
  yellow: 'border-yellow-500 bg-yellow-50 dark:border-yellow-400 dark:bg-yellow-950',
  sky: 'border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950',
  gray: 'border-gray-400 bg-transparent',
};

/** Leyenda de empleados, en el mismo orden de prioridad con que se elige el color del badge. */
export const EMPLOYEE_DEVIATION_LEGEND: { tone: DeviationTone; label: string }[] = [
  { tone: 'orange', label: 'En varias filas del parte' },
  { tone: 'purple', label: 'Sin afectar al cliente y sin diagrama' },
  { tone: 'blue', label: 'No afectado al cliente de la fila' },
  { tone: 'red', label: 'Sin diagrama para el día' },
  { tone: 'yellow', label: 'Día no laboral' },
];

/** Leyenda de equipos, en el mismo orden de prioridad con que se elige el color del badge. */
export const EQUIPMENT_DEVIATION_LEGEND: { tone: DeviationTone; label: string }[] = [
  { tone: 'orange', label: 'En varias filas del parte' },
  { tone: 'red', label: 'No operativo' },
  { tone: 'yellow', label: 'En reparación' },
  { tone: 'blue', label: 'No afectado al cliente de la fila' },
  { tone: 'sky', label: 'Condicionado' },
  { tone: 'gray', label: 'En preparación' },
];
