'use client';

import { getSectionCode } from '@/features/Checklists/lib/checklist-evaluation';
import type { DefaultAnswers, NormalizedChecklistFormProps } from '@/features/Checklists/lib/checklist-form-schema';
import { isHitchSectionCode } from '@/features/Checklists/utils/hitchSections';
import { useMemo } from 'react';

type Params = {
  template: NormalizedChecklistFormProps['template'];
  selectedHitchEquipment: string | null;
  readOnly: boolean;
  defaultAnswers?: DefaultAnswers;
};

/** Secciones del checklist: ordenadas, visibles y las del enganche (ticket 677). */
export function useChecklistSections({ template, selectedHitchEquipment, readOnly, defaultAnswers }: Params) {
  /**
   * Códigos de las secciones que describen la unidad enganchada (ticket 677).
   * Se calculan una vez por plantilla; el detalle de por qué no salen de la BD
   * está en `utils/hitchSections.ts`.
   */
  const hitchSectionCodes = useMemo(() => {
    const codes = new Set<string>();
    template.checklist_template_sections?.forEach((section) => {
      const sectionCode = getSectionCode(section);
      if (isHitchSectionCode(sectionCode)) {
        codes.add(sectionCode);
      }
    });
    return codes;
  }, [template]);

  /**
   * La sección del enganche solo se muestra cuando el operario declaró qué unidad
   * lleva enganchada. Sin esa declaración, esos ítems no aplican a nada y sus
   * desvíos terminarían imputados a la unidad tractora.
   */
  const hiddenSectionCodes = useMemo(() => {
    if (selectedHitchEquipment) return new Set<string>();

    const hidden = new Set(hitchSectionCodes);

    // En modo consulta no se esconde lo que ya quedó registrado: las respuestas
    // anteriores al ticket 677 pudieron completar la sección del enganche sin
    // declarar la unidad, y ese dato tiene que seguir siendo visible.
    if (readOnly && defaultAnswers) {
      const storedAnswers = defaultAnswers as Record<string, unknown>;
      hitchSectionCodes.forEach((sectionCode) => {
        const sectionAnswers = storedAnswers[sectionCode];
        if (sectionAnswers && typeof sectionAnswers === 'object') {
          const hasAnyAnswer = Object.values(sectionAnswers as Record<string, unknown>).some(
            (value) => value !== null && value !== undefined && value !== ''
          );
          if (hasAnyAnswer) hidden.delete(sectionCode);
        }
      });
    }

    return hidden;
  }, [selectedHitchEquipment, hitchSectionCodes, readOnly, defaultAnswers]);

  // Ordenar secciones por order_index
  const sortedSections = useMemo(
    () => [...(template.checklist_template_sections || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [template]
  );

  /**
   * Secciones que realmente se renderizan y se guardan. Coincide con `sortedSections`
   * salvo cuando la plantilla tiene sección de enganche y no se declaró la unidad.
   */
  const visibleSections = useMemo(
    () => sortedSections.filter((section) => !hiddenSectionCodes.has(getSectionCode(section))),
    [sortedSections, hiddenSectionCodes]
  );

  /** Nombres de las secciones del enganche que quedaron ocultas por no declarar la unidad. */
  const hiddenHitchSectionNames = useMemo(
    () =>
      sortedSections
        .filter((section) => hiddenSectionCodes.has(getSectionCode(section)))
        .map((section) => section.name || section.section?.name || 'Sin nombre'),
    [sortedSections, hiddenSectionCodes]
  );

  return { hitchSectionCodes, hiddenSectionCodes, sortedSections, visibleSections, hiddenHitchSectionNames };
}
