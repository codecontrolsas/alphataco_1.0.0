import type { ChecklistTemplate } from '@/features/Checklists/lib/checklist-form-schema';
import { formatDateAr } from '@/shared/lib/argentina-time';

/**
 * Helpers de las páginas de detalle de formularios (módulo sin directiva: lo usan RSC).
 */

type TemplateDetail = NonNullable<ChecklistTemplate>;

type PdfAnswerValue = string | { left: string; right: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Contenido tipado del JSON `answer_data` de una respuesta de checklist. */
export function readAnswerData(raw: unknown) {
  const data = isRecord(raw) ? raw : {};
  return {
    customerId: asText(data.customer_id),
    chofer: asText(data.chofer),
    fecha: asText(data.fecha),
    hora: asText(data.hora),
    kilometraje: asText(data.kilometraje),
    horometro: asText(data.horometro),
    observaciones: asText(data.observaciones),
    answers: (isRecord(data.answers) ? data.answers : {}) as Record<string, Record<string, unknown>>,
    pdfAnswers: (isRecord(data.answers) ? data.answers : {}) as Record<string, Record<string, PdfAnswerValue>>,
    itemObservations: (isRecord(data.item_observations) ? data.item_observations : {}) as Record<string, string>,
  };
}

/** `DD/MM/YYYY` de una fecha cargada en el formulario (`YYYY-MM-DD` o ISO); otro formato se muestra tal cual. */
export function formatAnswerDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? formatDateAr(match[1]) : value;
}

/** Secciones de la plantilla en la forma que esperan los botones de PDF. */
export function toPdfSections(template: TemplateDetail) {
  return template.checklist_template_sections.map((section) => ({
    id: section.id,
    code: section.code || section.section?.code || `section_${section.id}`,
    name: section.name || section.section?.name || 'Sin nombre',
    order_index: section.order_index,
    checklist_template_items: section.checklist_template_items.map((item) => ({
      id: item.id,
      code: item.code || `item_${item.id}`,
      label: item.label,
      order_index: item.order_index,
      is_critical: item.is_critical || false,
      requires_side_validation: item.requires_side_validation || false,
      input_type: item.input_type || undefined,
    })),
  }));
}
