/**
 * Tonos de los bloques del manual (Callout, FlowStep, State). Las clases van ESCRITAS COMPLETAS:
 * Tailwind v4 solo genera las que encuentra literales en el código, así que nada de armarlas con
 * `replace()` ni template literals.
 *
 * Los colores salen de los tokens de estado de `globals.css` (info/ok/warn/danger), que ya traen su
 * variante oscura. El cuerpo va en `text-foreground`; `text-muted-foreground` sobre los fondos de color
 * no alcanza el contraste mínimo en claro: NO usarlo dentro de un bloque con tono.
 */
export type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger';

type ToneClasses = {
  /** Fondo y borde del bloque. */
  surface: string;
  /** Barra de acento lateral (o superior) que marca el tono. */
  bar: string;
  /** Texto de rótulo e íconos. */
  label: string;
};

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  default: {
    surface: 'border-border bg-card',
    bar: 'bg-muted-foreground',
    label: 'text-muted-foreground',
  },
  info: {
    surface: 'border-info/30 bg-info-subtle',
    bar: 'bg-info',
    label: 'text-info-subtle-foreground',
  },
  success: {
    surface: 'border-ok/30 bg-ok-subtle',
    bar: 'bg-ok',
    label: 'text-ok-subtle-foreground',
  },
  warning: {
    surface: 'border-warn/30 bg-warn-subtle',
    bar: 'bg-warn',
    label: 'text-warn-subtle-foreground',
  },
  danger: {
    surface: 'border-danger/30 bg-danger-subtle',
    bar: 'bg-danger',
    label: 'text-danger-subtle-foreground',
  },
};

/** Los redactores escriben el tono a mano: uno desconocido cae a `default` en vez de romper. */
export function toTone(value: string | undefined): Tone {
  return value && value in TONE_CLASSES ? (value as Tone) : 'default';
}
