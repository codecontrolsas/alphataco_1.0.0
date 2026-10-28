/**
 * Plan de guardado de una plantilla de checklist: qué secciones e ítems se crean, se actualizan y se borran, con los
 * códigos ya resueltos. Módulo puro: la server action lo calcula y después lo aplica en una transacción.
 *
 * Las respuestas (`checklist_answers.answer_data`, `checklist_deviations.item_code`, `critical_items_failed`) se
 * guardan por CÓDIGO de sección e ítem. Por eso:
 *  - un código se genera una sola vez y nunca se reescribe;
 *  - con respuestas cargadas se puede renombrar, reordenar, marcar crítico y AGREGAR, pero no borrar secciones o ítems
 *    ni cambiar el tipo de respuesta de un ítem existente (las respuestas viejas dejarían de leerse bien).
 *    Para un cambio de estructura se duplica la plantilla.
 */

import {
  itemToColumns,
  kindFromColumns,
  slugifyCode,
  uniqueCode,
  type ItemColumns,
  type TemplateFormValues,
} from './template-schema';

/** Estructura guardada de la plantilla, tal como sale de la base. */
export type ExistingStructure = {
  sections: {
    id: string;
    code: string;
    items: { id: string; code: string; input_type: string; options: unknown }[];
  }[];
};

export type PlannedItem = ItemColumns & { id?: string; code: string; label: string; order_index: number };

export type PlannedSection = {
  id?: string;
  code: string;
  name: string;
  order_index: number;
  items: PlannedItem[];
};

export type TemplatePlan = {
  /** Secciones en orden; las que traen `id` se actualizan, las demás se crean. */
  sections: PlannedSection[];
  deleteSectionIds: string[];
  deleteItemIds: string[];
};

export type PlanResult = { ok: true; plan: TemplatePlan } | { ok: false; error: string };

const EMPTY: ExistingStructure = { sections: [] };

/**
 * Valida el payload contra la estructura guardada y arma el plan.
 *
 * Seguridad: un `id` que no pertenece a ESTA plantilla (o un ítem que viene en otra sección) se rechaza; nunca se
 * confía en los ids del cliente para elegir qué fila tocar.
 */
export function buildTemplatePlan(
  values: Pick<TemplateFormValues, 'sections'>,
  existing: ExistingStructure = EMPTY,
  hasAnswers = false
): PlanResult {
  const existingSections = new Map(existing.sections.map((s) => [s.id, s]));
  const sectionCodes = new Set(existing.sections.map((s) => s.code));
  const seenSectionIds = new Set<string>();
  const keptItemIds = new Set<string>();

  const sections: PlannedSection[] = [];
  for (const [sectionIndex, section] of values.sections.entries()) {
    const stored = section.id ? existingSections.get(section.id) : undefined;
    if (section.id && !stored) return { ok: false, error: 'Una sección no pertenece a esta plantilla.' };
    if (section.id) {
      if (seenSectionIds.has(section.id)) return { ok: false, error: 'Una sección está repetida.' };
      seenSectionIds.add(section.id);
    }

    const storedItems = new Map((stored?.items ?? []).map((i) => [i.id, i]));
    const itemCodes = new Set((stored?.items ?? []).map((i) => i.code));
    const items: PlannedItem[] = [];

    for (const [itemIndex, item] of section.items.entries()) {
      const storedItem = item.id ? storedItems.get(item.id) : undefined;
      if (item.id && !storedItem) {
        return { ok: false, error: `El ítem «${item.label}» no pertenece a la sección «${section.name}».` };
      }
      if (item.id) {
        if (keptItemIds.has(item.id)) return { ok: false, error: `El ítem «${item.label}» está repetido.` };
        keptItemIds.add(item.id);
      }
      if (storedItem && hasAnswers && kindFromColumns(storedItem).kind !== item.kind) {
        return {
          ok: false,
          error: `El ítem «${item.label}» ya tiene respuestas: no se puede cambiar su tipo. Duplicá la plantilla para hacerlo.`,
        };
      }
      items.push({
        ...itemToColumns(item),
        id: storedItem?.id,
        code: storedItem?.code ?? uniqueCode(slugifyCode(item.label, 'item'), itemCodes),
        label: item.label.trim(),
        order_index: itemIndex,
      });
    }

    sections.push({
      id: stored?.id,
      code: stored?.code ?? uniqueCode(slugifyCode(section.name, 'seccion'), sectionCodes),
      name: section.name.trim(),
      order_index: sectionIndex,
      items,
    });
  }

  const deleteSectionIds = existing.sections.filter((s) => !seenSectionIds.has(s.id)).map((s) => s.id);
  // Ítems quitados de secciones que siguen (los de una sección borrada caen con ella por el ON DELETE CASCADE).
  const deleteItemIds = existing.sections
    .filter((s) => seenSectionIds.has(s.id))
    .flatMap((s) => s.items.filter((i) => !keptItemIds.has(i.id)).map((i) => i.id));

  if (hasAnswers && (deleteSectionIds.length > 0 || deleteItemIds.length > 0)) {
    return {
      ok: false,
      error:
        'La plantilla ya tiene respuestas: no se pueden quitar secciones ni ítems. Desactivala o duplicala para armar una versión nueva.',
    };
  }

  return { ok: true, plan: { sections, deleteSectionIds, deleteItemIds } };
}
