'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { ManualItemsInput, type ManualItem } from '@/features/Mantenimiento/shared/components/ManualItemsInput';
import { cn } from '@/lib/utils';
import { AlertTriangle, Info } from 'lucide-react';
import type { ChecklistTemplateForEquipment } from '../../actions/queries.server';
import type { SelectedDeviation } from './types';

export interface StepChecklistItemsProps {
  deviationComments: Record<string, string>;
  handleToggleDeviation: (
    item: { id: string; code: string; label: string; is_critical: boolean | null },
    sectionCode: string
  ) => void;
  handleUpdateComment: (itemId: string, comment: string) => void;
  isSubmitting: boolean;
  manualItems: ManualItem[];
  selectedDeviations: SelectedDeviation[];
  selectedTemplate: ChecklistTemplateForEquipment | undefined;
  selectedTemplateId: string;
  setManualItems: (items: ManualItem[]) => void;
}

/** Paso "Items": desvíos del checklist elegido más los ítems cargados a mano. */
export function StepChecklistItems({
  deviationComments,
  handleToggleDeviation,
  handleUpdateComment,
  isSubmitting,
  manualItems,
  selectedDeviations,
  selectedTemplate,
  selectedTemplateId,
  setManualItems,
}: StepChecklistItemsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Selecciona los items con desvío</Label>
        <Badge variant="secondary" role="status" aria-live="polite" className="tabular-nums">
          {selectedDeviations.length} {selectedDeviations.length === 1 ? 'seleccionado' : 'seleccionados'}
        </Badge>
      </div>

      {selectedTemplate?.checklist_template_sections ? (
        <ScrollArea className="h-[min(60dvh,28rem)] pr-4">
          <div className="space-y-4">
            {selectedTemplate.checklist_template_sections
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((section) => (
                <Card key={section.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {section.name}
                      <Badge variant="outline" className="text-xs">
                        {section.checklist_template_items?.length || 0} items
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {section.checklist_template_items
                      ?.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                      .map((item) => {
                        const isSelected = selectedDeviations.some((d) => d.itemId === item.id);
                        const isNonPropagating = isNonPropagatingChecklistItem(selectedTemplateId, item.code);
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'p-2 rounded-lg border transition-all',
                              isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted'
                            )}
                          >
                            {/* El <label> ocupa toda la fila (≥44 px): tocar el texto o la casilla marca el desvío */}
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                              <Checkbox
                                checked={isSelected}
                                className="mt-0.5 size-5"
                                onCheckedChange={() =>
                                  handleToggleDeviation(
                                    { id: item.id, code: item.code, label: item.label, is_critical: item.is_critical },
                                    section.code
                                  )
                                }
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-base">{item.label}</span>
                                  {item.is_critical && (
                                    <Badge variant="destructive" className="text-xs">
                                      Crítico
                                    </Badge>
                                  )}
                                  {isNonPropagating && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs gap-1 border-dashed font-normal"
                                      title="Si marcás este desvío, queda registrado pero no genera trabajo en taller."
                                    >
                                      <Info aria-hidden="true" className="h-3 w-3" />
                                      Solo informativo · No viaja a taller
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-sm text-muted-foreground">{item.code}</span>
                              </div>
                            </label>

                            {isSelected && (
                              <div className="mt-2 ml-8">
                                <Textarea
                                  placeholder="Comentario sobre el desvío (opcional)"
                                  value={deviationComments[item.id] || ''}
                                  onChange={(e) => handleUpdateComment(item.id, e.target.value)}
                                  rows={2}
                                  className="text-base"
                                  aria-label={`Comentario sobre el desvío: ${item.label}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </CardContent>
                </Card>
              ))}
          </div>
        </ScrollArea>
      ) : (
        <div role="status" className="rounded-lg bg-muted p-4 text-center text-sm">Este checklist no tiene items cargados.</div>
      )}

      <ManualItemsInput items={manualItems} onChange={setManualItems} disabled={isSubmitting} />
    </div>
  );
}
