'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { ExecutionDatePicker } from './ExecutionDatePicker';
import type { ContractItemOption, ItemRow } from './types';

interface ItemRowCardProps {
  row: ItemRow;
  index: number;
  /** Todas las líneas: sirve para no ofrecer un ítem ya elegido en otra línea. */
  rows: ItemRow[];
  contractItems: ContractItemOption[];
  isLoadingItems: boolean;
  isEditing: boolean;
  /** `false` en edición de un pedido que ya no está pendiente. */
  canEditItem: boolean;
  /** El combo de ítems está deshabilitado (sin contrato, cargando o sin permiso de edición). */
  isItemDisabled: boolean;
  /** Hay errores de validación en los ítems: marca en rojo lo que falta. */
  hasItemErrors: boolean;
  onSelectItem: (itemId: string) => void;
  onChange: (patch: Partial<ItemRow> | ((row: ItemRow) => Partial<ItemRow>)) => void;
  onRemove: () => void;
}

/** Una línea del pedido: ítem, cantidad y, una vez elegido el ítem, jornada, tipo, observaciones y fecha. */
export function ItemRowCard({
  row,
  index,
  rows,
  contractItems,
  isLoadingItems,
  isEditing,
  canEditItem,
  isItemDisabled,
  hasItemErrors,
  onSelectItem,
  onChange,
  onRemove,
}: ItemRowCardProps) {
  const missingShift = hasItemErrors && !row.jornada;
  const missingType = hasItemErrors && !row.tipo;

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
      {/* Fila superior: Item, Cantidad, Eliminar */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormLabel>{index === 0 ? 'Item' : `Item ${index + 1}`}</FormLabel>
          <MultiSelectCombobox
            data-testid={`item-select-${index}`}
            options={contractItems.filter((item) => !rows.some((r) => r.id === item.value && r.id !== row.id))}
            selectedValues={row.id ? [row.id] : []}
            isLoading={isLoadingItems}
            onChange={(selectedIds) => onSelectItem(selectedIds[0] || '')}
            placeholder="Seleccionar item"
            emptyMessage="No hay items disponibles"
            disabled={isItemDisabled}
            maxSelections={1}
          />
        </div>

        <div className="w-20">
          <FormLabel>Cantidad</FormLabel>
          <Input
            type="number"
            min="1"
            value={row.quantity}
            disabled={!row.id || !canEditItem}
            onChange={(e) => onChange({ quantity: parseInt(e.target.value) || 1 })}
            className="w-full bg-background"
          />
        </div>

        {rows.length > 1 && !isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canEditItem}
            onClick={onRemove}
            className="mb-0"
            aria-label={`Quitar ítem ${index + 1}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      {/* PP-3: Campos por ítem - solo visibles cuando hay ítem seleccionado */}
      {row.id && (
        <>
          {/* Jornada por ítem */}
          <div className="flex flex-col gap-2">
            <FormLabel className={cn('text-sm', missingShift && 'text-destructive')}>
              Jornada {missingShift && <span className="text-destructive">*</span>}
            </FormLabel>
            <Select
              value={row.jornada}
              onValueChange={(value) => onChange({ jornada: value, start_time: '', end_time: '' })}
              disabled={!canEditItem}
            >
              <SelectTrigger className={cn('bg-background', missingShift && 'border-destructive')}>
                <SelectValue placeholder="Seleccionar jornada">{row.jornada || 'Seleccionar jornada'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Jornada 8 horas">Jornada 8 horas</SelectItem>
                <SelectItem value="Jornada 12 horas">Jornada 12 horas</SelectItem>
                <SelectItem value="Jornada 24 horas">Jornada 24 horas</SelectItem>
                <SelectItem value="por horario">Por horario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Horario (solo si jornada es "por horario") */}
          {row.jornada === 'por horario' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm">Hora de inicio</FormLabel>
                <Input
                  type="time"
                  value={row.start_time || ''}
                  onChange={(e) => onChange({ start_time: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm">Hora de fin</FormLabel>
                <Input
                  type="time"
                  value={row.end_time || ''}
                  onChange={(e) => onChange({ end_time: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>
          )}

          {/* Tipo de servicio por ítem */}
          <div className="flex flex-col gap-2">
            <FormLabel className={cn('text-sm', missingType && 'text-destructive')}>
              Tipo de servicio {missingType && <span className="text-destructive">*</span>}
            </FormLabel>
            <RadioGroup
              value={row.tipo}
              onValueChange={(value) => onChange({ tipo: value })}
              disabled={!canEditItem}
              className={cn('flex flex-row space-x-4', missingType && 'p-2 border border-destructive rounded-md')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mensual" id={`tipo-mensual-${index}`} />
                <label htmlFor={`tipo-mensual-${index}`} className="text-sm">
                  Mensual
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="adicional" id={`tipo-adicional-${index}`} />
                <label htmlFor={`tipo-adicional-${index}`} className="text-sm">
                  Adicional
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="adicional_permanente" id={`tipo-permanente-${index}`} />
                <label htmlFor={`tipo-permanente-${index}`} className="text-sm">
                  Adicional Permanente
                </label>
              </div>
            </RadioGroup>
          </div>

          {/* Observaciones por ítem */}
          <div className="flex flex-col gap-2">
            <FormLabel className="text-sm">Observaciones</FormLabel>
            <Textarea
              placeholder="Observaciones para este ítem..."
              value={row.observaciones || ''}
              onChange={(e) => onChange({ observaciones: e.target.value })}
              className="min-h-[60px] bg-background"
            />
          </div>

          {/* Fecha de ejecución por ítem */}
          <ExecutionDatePicker
            row={row}
            isEditing={isEditing}
            hasItemErrors={hasItemErrors}
            onChange={(executionDate) => onChange({ executionDate })}
          />

          {/* PP-3: Checkbox sujeto a disponibilidad por ítem */}
          <div className="flex items-center space-x-3 pt-2">
            <Checkbox
              id={`subject-availability-${index}`}
              checked={row.subject_to_availability}
              onCheckedChange={(checked) =>
                onChange((current) => ({
                  subject_to_availability: !!checked,
                  // Si se marca, limpiar fecha
                  executionDate: checked ? { from: undefined, to: undefined } : current.executionDate,
                }))
              }
            />
            <label htmlFor={`subject-availability-${index}`} className="text-sm cursor-pointer leading-none">
              Sujeto a disponibilidad operativa
            </label>
          </div>
          {row.subject_to_availability && (
            <p className="text-xs text-muted-foreground pl-6">
              {isEditing
                ? 'Desmarcar para asignar fecha y poder confirmar.'
                : 'No podrá confirmarse hasta asignar fecha.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
