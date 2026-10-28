/**
 * Editor de plantillas de checklist por empresa (ticket 805): schema del formulario y traducción entre lo que edita
 * la empresa y las columnas de `checklist_template_sections` / `checklist_template_items`.
 *
 * Módulo puro (sin React ni acceso a datos): lo usan el formulario del cliente y las server actions, que validan el
 * mismo schema. Las reglas de qué se puede cambiar en una plantilla con respuestas viven en `template-plan.ts`.
 */

import { z } from 'zod';

/** Opciones Bueno / Malo de los ítems de inspección; la app agrega sola «No aplica» (`NA`) al renderizar. */
export const GOOD_BAD_OPTIONS = ['B', 'M'] as const;

/**
 * Tipos de respuesta que la empresa puede elegir. Son los que sabe renderizar y evaluar el checklist normalizado
 * (`ChecklistItemField`, `generateChecklistSchema`): solo `bm` genera desvíos (el valor «Malo»).
 */
export const ITEM_KINDS = ['bm', 'options', 'text', 'number', 'date'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  bm: 'Bueno / Malo / No aplica',
  options: 'Lista de opciones',
  text: 'Texto libre',
  number: 'Número',
  date: 'Fecha',
};

export const LIMITS = {
  name: 120,
  description: 500,
  sectionName: 120,
  itemLabel: 200,
  options: 500,
  sections: 50,
  itemsPerSection: 100,
} as const;

/** Opciones de un ítem «Lista de opciones», separadas por coma, sin vacías ni repetidas. */
export function parseOptions(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const value = part.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

const uuid = z.string().uuid();

export const templateItemSchema = z
  .object({
    /** Fila existente (`checklist_template_items.id`); ausente en un ítem nuevo. */
    id: uuid.optional(),
    /** Código ya guardado: no se edita (las respuestas se guardan por código). */
    code: z.string().optional(),
    label: z
      .string()
      .trim()
      .min(1, 'El ítem necesita un texto')
      .max(LIMITS.itemLabel, `Máximo ${LIMITS.itemLabel} caracteres`),
    kind: z.enum(ITEM_KINDS),
    options: z.string().max(LIMITS.options, `Máximo ${LIMITS.options} caracteres`),
    is_critical: z.boolean(),
    double_side: z.boolean(),
  })
  .superRefine((item, ctx) => {
    if (item.kind !== 'options') return;
    const options = parseOptions(item.options);
    if (options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Cargá al menos dos opciones' });
    }
    if (options.some((o) => o.length > 60)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Cada opción admite hasta 60 caracteres',
      });
    }
  });

export const templateSectionSchema = z.object({
  id: uuid.optional(),
  code: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'La sección necesita un nombre')
    .max(LIMITS.sectionName, `Máximo ${LIMITS.sectionName} caracteres`),
  items: z
    .array(templateItemSchema)
    .min(1, 'La sección necesita al menos un ítem')
    .max(LIMITS.itemsPerSection, `Máximo ${LIMITS.itemsPerSection} ítems por sección`),
});

export const templateFormSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(LIMITS.name, `Máximo ${LIMITS.name} caracteres`),
  description: z.string().trim().max(LIMITS.description, `Máximo ${LIMITS.description} caracteres`),
  is_active: z.boolean(),
  sections: z
    .array(templateSectionSchema)
    .min(1, 'Agregá al menos una sección')
    .max(LIMITS.sections, `Máximo ${LIMITS.sections} secciones`),
});

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
export type TemplateSectionValues = TemplateFormValues['sections'][number];
export type TemplateItemValues = TemplateSectionValues['items'][number];

export function emptyItem(): TemplateItemValues {
  return { label: '', kind: 'bm', options: '', is_critical: false, double_side: false };
}

export function emptySection(): TemplateSectionValues {
  return { name: '', items: [emptyItem()] };
}

/** Columnas de `checklist_template_items` que salen de un ítem del editor. */
export type ItemColumns = {
  input_type: string;
  options: string[] | null;
  is_critical: boolean;
  requires_side_validation: boolean;
};

/** Ítem del editor → columnas de la fila. «Crítico» y «doble lado» solo tienen sentido en Bueno / Malo. */
export function itemToColumns(
  item: Pick<TemplateItemValues, 'kind' | 'options' | 'is_critical' | 'double_side'>
): ItemColumns {
  switch (item.kind) {
    case 'bm':
      return {
        input_type: 'select',
        options: [...GOOD_BAD_OPTIONS],
        is_critical: item.is_critical,
        requires_side_validation: item.double_side,
      };
    case 'options':
      return {
        input_type: 'select',
        options: parseOptions(item.options),
        is_critical: false,
        requires_side_validation: false,
      };
    default:
      return { input_type: item.kind, options: null, is_critical: false, requires_side_validation: false };
  }
}

function optionsArray(options: unknown): string[] | null {
  if (Array.isArray(options)) return options.filter((o): o is string => typeof o === 'string');
  if (typeof options === 'string') {
    try {
      return optionsArray(JSON.parse(options));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Columnas guardadas → tipo del editor. Igual que el renderer: un `select` sin opciones propias, o con solo B/M, es
 * Bueno / Malo; cualquier `input_type` desconocido cae en Bueno / Malo (es la rama por defecto de
 * `generateChecklistSchema`).
 */
export function kindFromColumns(row: { input_type: string; options: unknown }): { kind: ItemKind; options: string } {
  if (row.input_type === 'text' || row.input_type === 'number' || row.input_type === 'date') {
    return { kind: row.input_type, options: '' };
  }
  const options = optionsArray(row.options);
  if (row.input_type === 'select' && options && options.some((o) => o !== 'B' && o !== 'M' && o !== 'NA')) {
    return { kind: 'options', options: options.join(', ') };
  }
  return { kind: 'bm', options: '' };
}

/**
 * Código legible y estable a partir de un texto: minúsculas, sin tildes, `_` como separador. Es lo que indexa las
 * respuestas (`answer_data[seccion][item]`), así que se genera una sola vez y nunca se reescribe.
 */
export function slugifyCode(text: string, fallback: string, separator = '_', maxLength = 40): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '')
    .slice(0, maxLength)
    .replace(new RegExp(`\\${separator}+$`), '');
  return slug || fallback;
}

/** Primer código libre: `base`, `base_2`, `base_3`… Registra el elegido en `taken`. */
export function uniqueCode(base: string, taken: Set<string>, separator = '_'): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${separator}${n}`;
  taken.add(candidate);
  return candidate;
}

/** Código de plantilla (único por empresa) a partir del nombre: `CHECKLIST-DIARIO`, `CHECKLIST-DIARIO-2`… */
export function templateCodeFor(name: string, takenCodes: Iterable<string>): string {
  const taken = new Set([...takenCodes].map((c) => c.toUpperCase()));
  return uniqueCode(slugifyCode(name, 'checklist', '-', 30).toUpperCase(), taken, '-');
}
