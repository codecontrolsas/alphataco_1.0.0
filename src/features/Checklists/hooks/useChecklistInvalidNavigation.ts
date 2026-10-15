'use client';

import { getSectionCode } from '@/features/Checklists/lib/checklist-evaluation';
import type { ChecklistTemplateSection } from '@/features/Checklists/lib/checklist-form-schema';
import { logger } from '@/lib/logger';
import { useCallback, useMemo, useState } from 'react';
import type { FieldErrors, FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

type Params = {
  form: UseFormReturn<FieldValues>;
  sortedSections: ChecklistTemplateSection[];
};

/** Acordeón controlado + manejo del submit inválido (abre y enfoca el primer item pendiente). */
export function useChecklistInvalidNavigation({ form, sortedSections }: Params) {
  /** Secciones abiertas del acordeón. Controlado para poder abrir la del primer error. */
  const [openSections, setOpenSections] = useState<string[]>([]);

  /** nombre de campo -> id de la sección que lo contiene */
  const sectionByField = useMemo(() => {
    const map = new Map<string, string>();
    sortedSections.forEach((section) => {
      const sectionCode = getSectionCode(section);
      (section.checklist_template_items || []).forEach((item) => {
        const base = `${sectionCode}__${item.code || `item_${item.id}`}`;
        map.set(base, section.id);
        map.set(`${base}_left`, section.id);
        map.set(`${base}_right`, section.id);
      });
    });
    return map;
  }, [sortedSections]);

  /**
   * Un checklist puede tener más de cien items repartidos en secciones colapsadas,
   * así que un submit inválido tiene que decir qué falta y llevar hasta ahí: sin
   * esto el botón "Guardar" no producía ninguna reacción visible.
   */
  const handleInvalid = useCallback(
    (errors: FieldErrors<FieldValues>) => {
      const pending = Object.keys(errors);
      logger.debug('Checklist inválido', { data: { pending } });
      if (pending.length === 0) return;

      toast.error(pending.length === 1 ? 'Falta responder 1 item' : `Faltan responder ${pending.length} items`, {
        description: 'Te llevamos al primero que quedó sin completar.',
      });

      const firstField = pending[0];
      const sectionId = sectionByField.get(firstField);
      if (sectionId) {
        setOpenSections((prev) => (prev.includes(sectionId) ? prev : [...prev, sectionId]));
      }

      // Radix desmonta el contenido de las secciones cerradas: hay que esperar a que
      // el panel se monte antes de poder enfocar el campo.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementsByName(firstField)[0];
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          form.setFocus(firstField);
        });
      });
    },
    [form, sectionByField]
  );

  return { openSections, setOpenSections, handleInvalid };
}
