import { createHash } from 'node:crypto';

/**
 * Controles de instancia que opera TaskApp (pausa del sistema y banners globales), en su forma pura: claves de
 * `instance_settings`, valores por defecto, lectura tolerante de lo guardado y la versión de concurrencia.
 *
 * Sin `server-only` ni base: lo usan el proxy, los Server Components, la API de administración y los tests unitarios.
 * La lectura con base y caché está en `instance-controls.ts`.
 */

/** Claves de `instance_settings` de los controles (el límite de empresas es `max_companies`, ticket 807). */
export const INSTANCE_CONTROL_KEYS = {
  pause: 'instance_pause',
  loginBanner: 'banner_login',
  dashboardBanner: 'banner_dashboard',
} as const;

export const BANNER_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type BannerSeverity = (typeof BANNER_SEVERITIES)[number];

/** Largo máximo del texto de un banner (texto plano). */
export const BANNER_MESSAGE_MAX = 280;
/** Largo máximo del mensaje de la pausa (texto plano). */
export const PAUSE_MESSAGE_MAX = 500;

/** Lo que se muestra si la pausa se activa sin mensaje propio. */
export const DEFAULT_PAUSE_MESSAGE =
  'Estamos realizando tareas de mantenimiento. El sistema vuelve a estar disponible en breve.';

/** Código estable de las respuestas 503 de las APIs mientras la instancia está en pausa. */
export const INSTANCE_PAUSED_CODE = 'INSTANCE_PAUSED';

export interface PauseState {
  active: boolean;
  /** Texto plano; vacío = se usa `DEFAULT_PAUSE_MESSAGE`. */
  message: string;
  /** ISO de cuándo se activó; null si no está activa. */
  since: string | null;
}

export interface BannerState {
  enabled: boolean;
  message: string;
  severity: BannerSeverity;
}

export interface InstanceControls {
  pause: PauseState;
  banners: { login: BannerState; dashboard: BannerState };
}

export const DEFAULT_PAUSE: PauseState = { active: false, message: '', since: null };
export const DEFAULT_BANNER: BannerState = { enabled: false, message: '', severity: 'info' };
export const DEFAULT_INSTANCE_CONTROLS: InstanceControls = {
  pause: DEFAULT_PAUSE,
  banners: { login: DEFAULT_BANNER, dashboard: DEFAULT_BANNER },
};

/** Texto plano de una línea o párrafo: sin caracteres de control (salvo salto de línea), recortado. */
export function sanitizePlainText(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Lee la pausa guardada; cualquier valor inválido equivale a «sin pausa» (falla abierta, como el resto de la app). */
export function parsePause(value: unknown): PauseState {
  const raw = asRecord(value);
  const active = raw.active === true;
  const message = typeof raw.message === 'string' ? sanitizePlainText(raw.message, PAUSE_MESSAGE_MAX) : '';
  return { active, message, since: active && isIsoDate(raw.since) ? new Date(raw.since).toISOString() : null };
}

/** Lee un banner guardado; sin mensaje no se muestra aunque figure encendido. */
export function parseBanner(value: unknown): BannerState {
  const raw = asRecord(value);
  const message = typeof raw.message === 'string' ? sanitizePlainText(raw.message, BANNER_MESSAGE_MAX) : '';
  const severity = BANNER_SEVERITIES.includes(raw.severity as BannerSeverity)
    ? (raw.severity as BannerSeverity)
    : 'info';
  return { enabled: raw.enabled === true && message !== '', message, severity };
}

/** Arma los controles desde las filas de `instance_settings` (las que falten quedan en su valor por defecto). */
export function controlsFromSettings(rows: readonly { key: string; value: unknown }[]): InstanceControls {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    pause: parsePause(byKey.get(INSTANCE_CONTROL_KEYS.pause)),
    banners: {
      login: parseBanner(byKey.get(INSTANCE_CONTROL_KEYS.loginBanner)),
      dashboard: parseBanner(byKey.get(INSTANCE_CONTROL_KEYS.dashboardBanner)),
    },
  };
}

/** Mensaje visible de la pausa. */
export function pauseMessageOf(pause: PauseState): string {
  return pause.message || DEFAULT_PAUSE_MESSAGE;
}

/** Estado editable completo de la instancia: el límite de empresas más los controles. Lo que versiona la API. */
export interface InstanceEditableState extends InstanceControls {
  maxCompanies: number;
}

/**
 * Versión de concurrencia (sha256 del estado editable en forma canónica). NO incluye cuántas empresas hay: un alta de
 * empresa no debe invalidar un cambio de banners que el operador ya revisó.
 */
export function computeInstanceVersion(state: InstanceEditableState): string {
  const canonical = [
    `max_companies:${state.maxCompanies}`,
    `pause:${state.pause.active ? 1 : 0}:${state.pause.since ?? ''}:${state.pause.message}`,
    ...(['login', 'dashboard'] as const).map((slot) => {
      const banner = state.banners[slot];
      return `banner:${slot}:${banner.enabled ? 1 : 0}:${banner.severity}:${banner.message}`;
    }),
  ].join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Clave con la que el navegador recuerda que se descartó un banner: cambia con el texto o la severidad, así que un
 * mensaje nuevo vuelve a aparecer aunque el anterior se haya ocultado.
 */
export function bannerDismissToken(banner: BannerState): string {
  return createHash('sha256').update(`${banner.severity}:${banner.message}`).digest('hex').slice(0, 16);
}
