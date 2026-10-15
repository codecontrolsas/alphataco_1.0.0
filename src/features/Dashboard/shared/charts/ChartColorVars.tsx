/**
 * Colores de los gráficos del Dashboard como variables CSS por tema.
 *
 * Se renderiza una vez en un ancestro común y envuelve con `data-dashboard-colors` (ver
 * `DASHBOARD_COLORS_ATTR`): el gráfico, su leyenda y los KPI que viven fuera del `ChartContainer`
 * leen el mismo color con `var(--dash-cat-N)` / `var(--dash-status-*)`, y el modo oscuro se
 * resuelve por CSS. Mismo patrón que `SeriesColorVars` (Sala de Control) y
 * `MaintenanceStatsColorVars`. No toca `--chart-1..5` de `globals.css` (una sola rampa de azules).
 *
 * MEDICIÓN (ΔE CIEDE2000 de TODOS los pares; deuteranopía/protanopía/tritanopía con Machado 2009
 * a severidad 1.0; fondos #ffffff y #12171d; contraste de cada color >= 3:1 contra su fondo):
 *   Categórica (8):  claro  normal 20.1 · deut 15.9 · prot 14.7 · trit 15.5
 *                    oscuro normal 20.1 · deut 14.6 · prot 14.6 · trit 14.1
 *   Estados (4):     claro  normal 31.6 · deut 19.4 · prot 20.6 · trit 13.7
 *                    oscuro normal 34.2 · deut 23.1 · prot 22.6 · trit 16.5
 * Piso de visión normal (15) cumplido; los valores en CVD quedan sobre el piso de 8 del módulo
 * Mantenimiento. Cada slot conserva el mismo tono en claro y oscuro (no es el claro invertido).
 * Si se cambia un valor hay que volver a medir TODOS los pares. Aun así la identidad no debe
 * depender sólo del color: etiquetas visibles con valor al lado de cada serie.
 */
type ThemedColor = { light: string; dark: string };

export const DASHBOARD_COLORS_ATTR = 'data-dashboard-colors';

/** Paleta categórica de 8 series, en el orden en que se asignan. */
export const CATEGORICAL_COLORS: readonly ThemedColor[] = [
  { light: '#ec4b7f', dark: '#f4a1a0' },
  { light: '#1f744f', dark: '#1ea662' },
  { light: '#849b11', dark: '#a7d91d' },
  { light: '#aa167d', dark: '#c16b9d' },
  { light: '#ba0d01', dark: '#ea5202' },
  { light: '#5c53da', dark: '#8cb2f1' },
  { light: '#33a397', dark: '#53e8e0' },
  { light: '#a485da', dark: '#8e6ffb' },
];

/** Estados de recursos. */
export const STATUS_COLORS = {
  operational: { light: '#52a27a', dark: '#95e6bb' },
  unavailable: { light: '#843b3e', dark: '#b46762' },
  inUse: { light: '#0c54a0', dark: '#4081d2' },
  available: { light: '#a06b01', dark: '#eba002' },
} as const satisfies Record<string, ThemedColor>;

export type StatusColorKey = keyof typeof STATUS_COLORS;

const STATUS_VAR: Record<StatusColorKey, string> = {
  operational: '--dash-status-operational',
  unavailable: '--dash-status-unavailable',
  inUse: '--dash-status-in-use',
  available: '--dash-status-available',
};

/** `var(--dash-cat-N)` para la serie `index` (base 0, cíclico). */
export function categoricalColorVar(index: number): string {
  return `var(--dash-cat-${(index % CATEGORICAL_COLORS.length) + 1})`;
}

/** `var(--dash-status-*)` del estado. */
export function statusColorVar(status: StatusColorKey): string {
  return `var(${STATUS_VAR[status]})`;
}

export function ChartColorVars() {
  const declarations = (mode: 'light' | 'dark') =>
    [
      ...CATEGORICAL_COLORS.map((color, i) => `--dash-cat-${i + 1}: ${color[mode]};`),
      ...(Object.keys(STATUS_COLORS) as StatusColorKey[]).map(
        (key) => `${STATUS_VAR[key]}: ${STATUS_COLORS[key][mode]};`
      ),
      // Semáforo: reutiliza los estados medidos. "Sin dato" es neutro, nunca verde.
      `--dash-ok: ${STATUS_COLORS.operational[mode]};`,
      `--dash-warn: ${STATUS_COLORS.available[mode]};`,
      `--dash-danger: ${STATUS_COLORS.unavailable[mode]};`,
      '--dash-neutral: var(--muted-foreground);',
    ].join(' ');

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: [
          `[${DASHBOARD_COLORS_ATTR}] { ${declarations('light')} }`,
          `.dark [${DASHBOARD_COLORS_ATTR}] { ${declarations('dark')} }`,
        ].join('\n'),
      }}
    />
  );
}
