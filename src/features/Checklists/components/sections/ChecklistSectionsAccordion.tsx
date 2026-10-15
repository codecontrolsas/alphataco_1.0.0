'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChecklistItemField } from '@/features/Checklists/components/sections/ChecklistItemField';
import { getSectionCode } from '@/features/Checklists/lib/checklist-evaluation';
import type { ChecklistTemplateSection } from '@/features/Checklists/lib/checklist-form-schema';
import { AlertTriangle } from 'lucide-react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type ChecklistSectionsAccordionProps = {
  form: UseFormReturn<FieldValues>;
  visibleSections: ChecklistTemplateSection[];
  readOnly: boolean;
  showItemObservations: boolean;
  openSections: string[];
  setOpenSections: (value: string[]) => void;
};

/**
 * Acordeón de secciones del checklist (la del enganche solo si se declaró la unidad).
 */
export function ChecklistSectionsAccordion({
  form,
  visibleSections,
  readOnly,
  showItemObservations,
  openSections,
  setOpenSections,
}: ChecklistSectionsAccordionProps) {
  return (
    /*
      "multiple" en vez de "single": con una sola sección abierta a la vez, Radix
      desmontaba el resto y los mensajes de error de los items pendientes no
      llegaban siquiera a existir en el DOM.
    */
    <Accordion type="multiple" className="w-full space-y-6" value={openSections} onValueChange={setOpenSections}>
      {/* Secciones del checklist (la del enganche solo si se declaró la unidad) */}
      {visibleSections.map((section) => {
        const sectionCode = getSectionCode(section);
        const sectionName = section.name || section.section?.name || 'Sin nombre';
        const sectionDescription = section.section?.description || null;

        // Ordenar items por order_index y eliminar duplicados por ID
        const allItems = section.checklist_template_items || [];

        const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values());

        const sortedItems = uniqueItems.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        // Contar items fallidos en la sección (solo en modo readOnly)
        const failedCount = readOnly
          ? sortedItems.reduce((count, item) => {
              const itemCode = item.code || `item_${item.id}`;
              const fieldName = `${sectionCode}__${itemCode}`;
              const val = form.getValues(fieldName);
              const leftVal = form.getValues(`${fieldName}_left`);
              const rightVal = form.getValues(`${fieldName}_right`);
              const hasFail = (v: unknown) => v === 'M' || v === 'Malo';
              return count + (hasFail(val) || hasFail(leftVal) || hasFail(rightVal) ? 1 : 0);
            }, 0)
          : 0;

        return (
          <Card key={section.id}>
            <AccordionItem className="pr-5" value={section.id}>
              <AccordionTrigger>
                <CardHeader className="text-start flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>{sectionName}</CardTitle>
                    {failedCount > 0 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {failedCount} {failedCount === 1 ? 'item fallido' : 'items fallidos'}
                      </Badge>
                    )}
                  </div>
                  {sectionDescription && <CardDescription>{sectionDescription}</CardDescription>}
                </CardHeader>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 text-balance">
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {sortedItems.map((item) => (
                      <ChecklistItemField
                        key={item.id}
                        item={item}
                        sectionCode={sectionCode}
                        form={form}
                        readOnly={readOnly}
                        showObservations={showItemObservations}
                      />
                    ))}
                  </div>
                </CardContent>
                <AccordionTrigger className="text-start border-t-2 border-muted p-5 pb-0">Cerrar</AccordionTrigger>
              </AccordionContent>
            </AccordionItem>
          </Card>
        );
      })}
    </Accordion>
  );
}
