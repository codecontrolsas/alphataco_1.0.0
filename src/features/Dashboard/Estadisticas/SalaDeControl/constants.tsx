import type { DeviationTotals } from './actions/actions.server';

/**
 * Las cinco series del grafico son los mismos cinco contadores que el mail
 * nocturno de desvios muestra en su cabecera, con los mismos nombres, para que
 * quien recibe el mail reconozca el grafico sin traducir nada.
 *
 * COLORES: cada serie trae su valor para tema claro y oscuro. La paleta esta
 * validada por diferencia perceptual (OKLab) entre todos los pares, tanto para
 * vision normal como para deuteranopia y protanopia: la version anterior usaba
 * dos naranjas separados por 5-10 grados de hue y dos violetas por 5, que en
 * pantalla eran literalmente el mismo color.
 *
 * El criterio semantico es calido = desvio, frio = duplicado. "Filas con
 * desvios" va en gris neutro a proposito: no es una serie par de las otras
 * cuatro, es el agregado que las contiene (una fila entra si tiene un desvio de
 * empleado O de equipo), y competir en color con sus propios componentes seria
 * un error de jerarquia.
 */
export const DEVIATION_SERIES = [
  {
    key: 'employee_deviations',
    label: 'Desvíos Empleados',
    theme: { light: 'oklch(0.68 0.155 55)', dark: 'oklch(0.66 0.151 55)' },
  },
  {
    key: 'equipment_deviations',
    label: 'Desvíos Equipos',
    theme: { light: 'oklch(0.44 0.164 25)', dark: 'oklch(0.54 0.202 25)' },
  },
  {
    key: 'duplicated_employees',
    label: 'Empleados Duplicados',
    theme: { light: 'oklch(0.67 0.192 300)', dark: 'oklch(0.64 0.212 300)' },
  },
  {
    key: 'duplicated_equipment',
    label: 'Equipos Duplicados',
    theme: { light: 'oklch(0.45 0.118 250)', dark: 'oklch(0.51 0.133 250)' },
  },
  {
    key: 'rows_with_deviations',
    label: 'Filas con desvíos',
    theme: { light: 'oklch(0.55 0.02 265)', dark: 'oklch(0.72 0.02 265)' },
  },
] as const satisfies ReadonlyArray<{
  key: keyof DeviationTotals;
  label: string;
  theme: { light: string; dark: string };
}>;

export type DeviationSeriesKey = (typeof DEVIATION_SERIES)[number]['key'];

/** Nombre de la CSS var que expone el color de una serie. Ver `SeriesColorVars`. */
export function seriesColorVar(key: DeviationSeriesKey): string {
  return `var(--deviation-${key.replace(/_/g, '-')})`;
}

/**
 * Unica fuente del color de cada serie para el grafico, la leyenda y los KPI.
 *
 * Los KPI del header viven FUERA del `ChartContainer`, asi que no alcanza con el
 * `theme` del `ChartConfig` de shadcn (que solo define las variables dentro del
 * contenedor del grafico). Declarandolas en un ancestro comun, el mismo color
 * llega a los tres lugares y el modo oscuro se resuelve por CSS, sin JS.
 */
export function SeriesColorVars() {
  const declarations = (mode: 'light' | 'dark') =>
    DEVIATION_SERIES.map((serie) => `--deviation-${serie.key.replace(/_/g, '-')}: ${serie.theme[mode]};`).join(' ');

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: [
          `[data-deviation-series] { ${declarations('light')} }`,
          `.dark [data-deviation-series] { ${declarations('dark')} }`,
        ].join('\n'),
      }}
    />
  );
}

/**
 * Los cuatro indicadores que la clienta pidio ver por defecto (comentario del
 * ticket 578). "Filas con desvíos" queda disponible pero apagado: se guarda en
 * el snapshot para no tener que rehacer la migracion si lo piden despues.
 */
export const DEFAULT_VISIBLE_SERIES: DeviationSeriesKey[] = [
  'employee_deviations',
  'equipment_deviations',
  'duplicated_employees',
  'duplicated_equipment',
];
