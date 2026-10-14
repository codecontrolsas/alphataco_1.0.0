'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { PreparteFormData } from '../../schemas/preparte-form';
import type { Cliente } from '../PreparteManager';
import type { AreaOption, ContractItemOption, Contrato, EquipmentOption, ItemRow, SectorOption } from './types';

const logger = new Logger('PreparteForm');

interface ItemsSectionProps {
  form: UseFormReturn<PreparteFormData>;
  contractItems: ContractItemOption[];
  isEditing: boolean;
  isLoading: boolean;
  isLoadingItems: boolean;
  selectedItems: ItemRow[];
  setSelectedItems: Dispatch<SetStateAction<ItemRow[]>>;
  handleAddItem: () => void;
  originalItemId: string | null;
  setShowItemChangeReason: Dispatch<SetStateAction<boolean>>;
}

/**
 * Ítems del pedido con sus campos por línea (jornada, tipo, horario, fecha, observaciones).
 * Sección extraída de `PreparteForm` (el formulario superaba las 1.000 líneas).
 */
export function ItemsSection({ form, contractItems, isEditing, isLoading, isLoadingItems, selectedItems, setSelectedItems, handleAddItem, originalItemId, setShowItemChangeReason }: ItemsSectionProps) {
  // Los errores del ítem se marcan en cada fila; se leen del estado del formulario padre.
  const formErrors = form.formState.errors;

  return (
    <>
            {/* Multiselector de items - PP-3: con fecha y sujeto a disponibilidad por ítem */}
            <FormField
              control={form.control}
              name="item"
              render={({ field }) => {
                // En edición, solo permitir cambiar item si status='pendiente'
                const currentStatus = form.watch('status');
                const canEditItem = !isEditing || currentStatus === 'pendiente';
                const isItemDisabled = !form.getValues('contrato_id') || isLoading || !canEditItem;

                // Función helper para sincronizar selectedItems con el form
                const syncFormValue = (items: typeof selectedItems) => {
                  const formItems = items
                    .filter((r) => r.id)
                    .map((r) => ({
                      id: r.id,
                      quantity: r.quantity,
                      // PP-3: Incluir todos los campos requeridos por ítem
                      jornada: r.jornada,
                      tipo: r.tipo,
                      observaciones: r.observaciones,
                      start_time: r.start_time,
                      end_time: r.end_time,
                      executionDate: r.executionDate,
                      subject_to_availability: r.subject_to_availability,
                    }));
                  field.onChange(formItems);

                  // Log para depuración
                  logger.debug('syncFormValue - Items sincronizados', {
                    data: {
                      itemCount: formItems.length,
                      items: formItems,
                    },
                  });
                };

                return (
                  <FormItem>
                    <div className="space-y-6">
                      {selectedItems.map((row, index) => {
                        const selectedItem = contractItems.find((item) => item.value === row.id);
                        const rowKey = row.id || `temp-${index}`;

                        return (
                          <div key={rowKey} className="bg-muted/40 space-y-4 rounded-lg border p-4">
                            {/* Fila superior: Item, Cantidad, Eliminar */}
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <FormLabel>{selectedItems.length > 1 ? `Ítem ${index + 1}` : 'Ítem'}</FormLabel>
                                <MultiSelectCombobox
                                  data-testid={`item-select-${index}`}
                                  options={contractItems.filter(
                                    (item) => !selectedItems.some((r) => r.id === item.value && r.id !== row.id)
                                  )}
                                  selectedValues={row.id ? [row.id] : []}
                                  isLoading={isLoadingItems}
                                  onChange={(selectedIds) => {
                                    const newItemId = selectedIds[0] || '';
                                    const updatedItems = selectedItems.map((r, i) =>
                                      i === index ? { ...r, id: newItemId } : r
                                    );
                                    setSelectedItems(updatedItems);

                                    // Detectar si el item cambió respecto al original (en edición)
                                    if (isEditing && originalItemId && newItemId !== originalItemId) {
                                      setShowItemChangeReason(true);
                                    } else if (isEditing && newItemId === originalItemId) {
                                      setShowItemChangeReason(false);
                                      form.setValue('item_change_reason', '');
                                    }

                                    syncFormValue(updatedItems);
                                  }}
                                  placeholder="Seleccionar ítem"
                                  emptyMessage="No hay ítems disponibles"
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
                                  onChange={(e) => {
                                    const newQuantity = parseInt(e.target.value) || 1;
                                    const updatedItems = selectedItems.map((r, i) =>
                                      i === index ? { ...r, quantity: newQuantity } : r
                                    );
                                    setSelectedItems(updatedItems);
                                    syncFormValue(updatedItems);
                                  }}
                                  className="w-full bg-background"
                                />
                              </div>

                              {selectedItems.length > 1 && !isEditing && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={!canEditItem}
                                  onClick={() => {
                                    const updatedItems = selectedItems.filter((_, i) => i !== index);
                                    setSelectedItems(updatedItems);
                                    syncFormValue(updatedItems);
                                  }}
                                  className="mb-0"
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
                                  <FormLabel
                                    className={cn('text-sm', formErrors.item && !row.jornada && 'text-destructive')}
                                  >
                                    Jornada{' '}
                                    {!row.jornada && formErrors.item && <span className="text-destructive">*</span>}
                                  </FormLabel>
                                  <Select
                                    value={row.jornada}
                                    onValueChange={(value) => {
                                      const updatedItems = selectedItems.map((r, i) =>
                                        i === index ? { ...r, jornada: value, start_time: '', end_time: '' } : r
                                      );
                                      setSelectedItems(updatedItems);
                                      syncFormValue(updatedItems);
                                    }}
                                    disabled={!canEditItem}
                                  >
                                    <SelectTrigger
                                      className={cn(
                                        'bg-background',
                                        formErrors.item && !row.jornada && 'border-destructive'
                                      )}
                                    >
                                      <SelectValue placeholder="Seleccionar jornada">
                                        {row.jornada || 'Seleccionar jornada'}
                                      </SelectValue>
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
                                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                      <FormLabel className="text-sm">Hora de inicio</FormLabel>
                                      <Input
                                        type="time"
                                        value={row.start_time || ''}
                                        onChange={(e) => {
                                          const updatedItems = selectedItems.map((r, i) =>
                                            i === index ? { ...r, start_time: e.target.value } : r
                                          );
                                          setSelectedItems(updatedItems);
                                          syncFormValue(updatedItems);
                                        }}
                                        className="bg-background"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <FormLabel className="text-sm">Hora de fin</FormLabel>
                                      <Input
                                        type="time"
                                        value={row.end_time || ''}
                                        onChange={(e) => {
                                          const updatedItems = selectedItems.map((r, i) =>
                                            i === index ? { ...r, end_time: e.target.value } : r
                                          );
                                          setSelectedItems(updatedItems);
                                          syncFormValue(updatedItems);
                                        }}
                                        className="bg-background"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Tipo de servicio por ítem */}
                                <div className="flex flex-col gap-2">
                                  <FormLabel
                                    className={cn('text-sm', formErrors.item && !row.tipo && 'text-destructive')}
                                  >
                                    Tipo de servicio{' '}
                                    {!row.tipo && formErrors.item && <span className="text-destructive">*</span>}
                                  </FormLabel>
                                  <RadioGroup
                                    value={row.tipo}
                                    onValueChange={(value) => {
                                      const updatedItems = selectedItems.map((r, i) =>
                                        i === index ? { ...r, tipo: value } : r
                                      );
                                      setSelectedItems(updatedItems);
                                      syncFormValue(updatedItems);
                                    }}
                                    disabled={!canEditItem}
                                    className={cn(
                                      'flex flex-row space-x-4',
                                      formErrors.item && !row.tipo && 'p-2 border border-destructive rounded-md'
                                    )}
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
                                    onChange={(e) => {
                                      const updatedItems = selectedItems.map((r, i) =>
                                        i === index ? { ...r, observaciones: e.target.value } : r
                                      );
                                      setSelectedItems(updatedItems);
                                      syncFormValue(updatedItems);
                                    }}
                                    className="min-h-[60px] bg-background"
                                  />
                                </div>

                                {/* Fecha de ejecución por ítem */}
                                <div className="flex flex-col gap-2">
                                  <FormLabel
                                    className={cn(
                                      'text-sm',
                                      formErrors.item &&
                                        !row.executionDate?.from &&
                                        !row.subject_to_availability &&
                                        'text-destructive'
                                    )}
                                  >
                                    Fecha de Ejecución{' '}
                                    {!row.executionDate?.from && !row.subject_to_availability && formErrors.item && (
                                      <span className="text-destructive">*</span>
                                    )}
                                  </FormLabel>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        disabled={row.subject_to_availability}
                                        className={cn(
                                          'w-full justify-start text-left font-normal',
                                          !row.executionDate?.from && 'text-muted-foreground',
                                          row.subject_to_availability && 'opacity-50',
                                          formErrors.item &&
                                            !row.executionDate?.from &&
                                            !row.subject_to_availability &&
                                            'border-destructive'
                                        )}
                                      >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {row.subject_to_availability ? (
                                          <span className="italic">Sujeto a disponibilidad operativa</span>
                                        ) : row.executionDate?.from ? (
                                          row.executionDate.to &&
                                          row.executionDate.from.getTime() !== row.executionDate.to.getTime() ? (
                                            <>
                                              {format(row.executionDate.from, 'dd/MM/yyyy', { locale: es })} -{' '}
                                              {format(row.executionDate.to, 'dd/MM/yyyy', { locale: es })}
                                            </>
                                          ) : (
                                            format(row.executionDate.from, 'PPP', { locale: es })
                                          )
                                        ) : (
                                          <span>Seleccionar fecha</span>
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                      {isEditing ? (
                                        <Calendar
                                          mode="single"
                                          selected={row.executionDate?.from}
                                          onSelect={(date) => {
                                            if (date) {
                                              const updatedItems = selectedItems.map((r, i) =>
                                                i === index ? { ...r, executionDate: { from: date, to: date } } : r
                                              );
                                              setSelectedItems(updatedItems);
                                              syncFormValue(updatedItems);
                                            }
                                          }}
                                          initialFocus
                                          locale={es}
                                        />
                                      ) : (
                                        <Calendar
                                          mode="range"
                                          selected={
                                            row.executionDate?.from
                                              ? (row.executionDate as { from: Date; to?: Date })
                                              : undefined
                                          }
                                          fromDate={new Date()}
                                          onSelect={(range) => {
                                            if (range?.from && range?.to && range.from > range.to) {
                                              return;
                                            }
                                            const updatedItems = selectedItems.map((r, i) =>
                                              i === index ? { ...r, executionDate: range || undefined } : r
                                            );
                                            setSelectedItems(updatedItems);
                                            syncFormValue(updatedItems);
                                          }}
                                          initialFocus
                                          locale={es}
                                          numberOfMonths={2}
                                        />
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                </div>

                                {/* PP-3: Checkbox sujeto a disponibilidad por ítem */}
                                <div className="flex items-center space-x-3 pt-2">
                                  <Checkbox
                                    id={`subject-availability-${index}`}
                                    checked={row.subject_to_availability}
                                    onCheckedChange={(checked) => {
                                      const updatedItems = selectedItems.map((r, i) =>
                                        i === index
                                          ? {
                                              ...r,
                                              subject_to_availability: !!checked,
                                              // Si se marca, limpiar fecha
                                              executionDate: checked
                                                ? { from: undefined, to: undefined }
                                                : r.executionDate,
                                            }
                                          : r
                                      );
                                      setSelectedItems(updatedItems);
                                      syncFormValue(updatedItems);
                                    }}
                                  />
                                  <label
                                    htmlFor={`subject-availability-${index}`}
                                    className="text-sm cursor-pointer leading-none"
                                  >
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
                      })}
                      {!isEditing && selectedItems.some((item) => item.id) && (
                        <div className="flex justify-center mt-4">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddItem}
                            disabled={isEditing}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar ítem
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* Mostrar errores de validación de items de forma más específica */}
                    <FormMessage />
                    {formErrors.item && (
                      <div className="text-sm text-destructive mt-2 space-y-1">
                        {Array.isArray(formErrors.item)
                          ? formErrors.item.map((itemError, idx) => {
                              if (!itemError) return null;
                              const errors = [];
                              if (itemError.jornada) errors.push(`Item ${idx + 1}: ${itemError.jornada.message}`);
                              if (itemError.tipo) errors.push(`Item ${idx + 1}: ${itemError.tipo.message}`);
                              if (itemError.quantity) errors.push(`Item ${idx + 1}: ${itemError.quantity.message}`);
                              return errors.map((err, errIdx) => <p key={`${idx}-${errIdx}`}>{err}</p>);
                            })
                          : formErrors.item.message && <p>{formErrors.item.message}</p>}
                      </div>
                    )}
                  </FormItem>
                );
              }}
            />
    </>
  );
}
