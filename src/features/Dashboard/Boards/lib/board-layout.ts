import {
  BOARD_TEMPLATES,
  WIDGET_SIZES,
  clampWidgetSize,
  getWidgetDefinition,
  type BoardTemplateKey,
  type WidgetSize,
} from '@/features/Dashboard/lib/widget-registry';
import { z } from 'zod';

/**
 * Layout de un tablero y schemas compartidos servidor/cliente (módulo SIN directiva: los usan las
 * server actions y los formularios del cliente).
 *
 * El layout es la lista ORDENADA de widgets con su ancho: `[{ widgetId, size }]`. El orden es el
 * de lectura en la grilla de 12 columnas (de izquierda a derecha y hacia abajo).
 */

/** Parámetro de URL con el tablero activo. */
export const BOARD_PARAM = 'tablero';

/** Tope de widgets por tablero y de tableros por usuario/empresa. */
export const MAX_WIDGETS_PER_BOARD = 40;
export const MAX_BOARDS = 20;

export const boardLayoutItemSchema = z.object({
  widgetId: z.string().min(1).max(64),
  size: z.enum(WIDGET_SIZES),
});

export const boardLayoutSchema = z
  .array(boardLayoutItemSchema)
  .max(MAX_WIDGETS_PER_BOARD, `Un tablero admite hasta ${MAX_WIDGETS_PER_BOARD} widgets`)
  .refine((items) => new Set(items.map((item) => item.widgetId)).size === items.length, {
    message: 'Un widget figura dos veces en el tablero',
  });

export type BoardLayoutItem = z.infer<typeof boardLayoutItemSchema>;
export type BoardLayout = BoardLayoutItem[];

export const boardNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(60, 'El nombre admite hasta 60 caracteres');

export const boardNameFormSchema = z.object({ name: boardNameSchema });
export type BoardNameFormValues = z.infer<typeof boardNameFormSchema>;

/** Id de un tablero por defecto que todavía no se guardó en la base. */
const TEMPLATE_ID_PREFIX = 'tpl-';

export function templateBoardId(key: BoardTemplateKey): string {
  return `${TEMPLATE_ID_PREFIX}${key}`;
}

export function templateKeyFromBoardId(id: string): BoardTemplateKey | null {
  if (!id.startsWith(TEMPLATE_ID_PREFIX)) return null;
  const key = id.slice(TEMPLATE_ID_PREFIX.length);
  return BOARD_TEMPLATES.find((template) => template.key === key)?.key ?? null;
}

/** Referencia a un tablero en una acción: uuid de la base o id de un tablero por defecto. */
export const boardIdSchema = z.union([
  z.string().uuid(),
  z.string().refine((value) => templateKeyFromBoardId(value) !== null, 'Tablero inexistente'),
]);

/**
 * Lee el JSON guardado sin confiar en él: descarta lo que no tenga forma válida, los widgets que
 * ya no existen en el registro y los repetidos, y lleva cada tamaño al rango del widget. Un layout
 * viejo o corrupto nunca rompe el render.
 */
export function parseStoredLayout(raw: unknown): BoardLayout {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const layout: BoardLayout = [];
  for (const entry of raw) {
    const parsed = boardLayoutItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const widget = getWidgetDefinition(parsed.data.widgetId);
    if (!widget || seen.has(widget.id)) continue;
    seen.add(widget.id);
    layout.push({ widgetId: widget.id, size: clampWidgetSize(widget, parsed.data.size) });
  }
  return layout;
}

/**
 * Columnas que ocupa cada tamaño. Se decide por el ANCHO DEL TABLERO (container queries sobre la
 * grilla), no por el viewport: bajo 448 px todo va a ancho completo; en tablet los chicos van de a
 * dos o tres; desde 896 px rige el ancho elegido. Clases escritas completas (Tailwind v4 no genera
 * clases armadas en runtime).
 */
export const WIDGET_SPAN_CLASS: Record<WidgetSize, string> = {
  xs: 'col-span-12 @md:col-span-6 @2xl:col-span-4 @4xl:col-span-2',
  sm: 'col-span-12 @2xl:col-span-6 @4xl:col-span-3',
  md: 'col-span-12 @2xl:col-span-6 @4xl:col-span-4',
  lg: 'col-span-12 @4xl:col-span-6',
  xl: 'col-span-12 @4xl:col-span-8',
  full: 'col-span-12',
};

export type BoardActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };
