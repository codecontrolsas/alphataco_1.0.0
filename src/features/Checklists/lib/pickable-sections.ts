import type { ChecklistTemplateSection } from '@/features/Checklists/lib/checklist-form-schema';
import type { PickableSection } from '@/features/Mantenimiento/shared/components/ChecklistItemPicker';

/**
 * Secciones e items adaptados al formato requerido por ChecklistItemPicker.
 * Se usan las visibles: si no se declaró el enganche, sus ítems no se pueden
 * elegir como desvío adicional (no habría a qué unidad imputarlos).
 */
export function buildPickableSections(visibleSections: ChecklistTemplateSection[]): PickableSection[] {
  return visibleSections.map((section) => ({
    id: section.id,
    code: section.code,
    name: section.name || section.section?.name || 'Sin nombre',
    order_index: section.order_index ?? null,
    items: (section.checklist_template_items ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
        is_critical: item.is_critical ?? false,
      })),
  }));
}
