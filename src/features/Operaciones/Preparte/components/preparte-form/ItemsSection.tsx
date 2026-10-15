'use client';

import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { ControllerRenderProps, UseFormReturn } from 'react-hook-form';
import { useItemRows } from '../../hooks/useItemRows';
import type { PreparteFormData } from '../../schemas/preparte-form';
import { ItemRowCard } from './ItemRowCard';
import type { ContractItemOption, ItemRow } from './types';

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
  /** `page`: el botón de agregar ítem se alinea a la izquierda. Por defecto, el Sheet. */
  variant?: 'sheet' | 'page';
}

type ItemsFieldProps = Omit<ItemsSectionProps, 'form'> & {
  form: UseFormReturn<PreparteFormData>;
  field: ControllerRenderProps<PreparteFormData, 'item'>;
};

/** Cuerpo del campo `item`: las líneas, el botón de agregar y los errores de validación. */
function ItemsField({
  form,
  field,
  contractItems,
  isEditing,
  isLoading,
  isLoadingItems,
  selectedItems,
  setSelectedItems,
  handleAddItem,
  originalItemId,
  setShowItemChangeReason,
  variant = 'sheet',
}: ItemsFieldProps) {
  // Los errores del ítem se marcan en cada fila; se leen del estado del formulario padre.
  const formErrors = form.formState.errors;

  // En edición, solo permitir cambiar item si status='pendiente'
  const currentStatus = form.watch('status');
  const canEditItem = !isEditing || currentStatus === 'pendiente';
  const isItemDisabled = !form.getValues('contrato_id') || isLoading || !canEditItem;

  const { updateRow, removeRow, selectItem } = useItemRows({
    form,
    selectedItems,
    setSelectedItems,
    onChange: field.onChange,
    isEditing,
    originalItemId,
    setShowItemChangeReason,
  });

  return (
    <FormItem>
      <div className="space-y-6">
        {selectedItems.map((row, index) => (
          <ItemRowCard
            key={row.id || `temp-${index}`}
            row={row}
            index={index}
            rows={selectedItems}
            contractItems={contractItems}
            isLoadingItems={isLoadingItems}
            isEditing={isEditing}
            canEditItem={canEditItem}
            isItemDisabled={isItemDisabled}
            hasItemErrors={Boolean(formErrors.item)}
            onSelectItem={(itemId) => selectItem(index, itemId)}
            onChange={(patch) => updateRow(index, patch)}
            onRemove={() => removeRow(index)}
          />
        ))}
        {!isEditing && selectedItems.some((item) => item.id) && (
          <div className={cn('flex mt-4', variant === 'page' ? 'justify-start' : 'justify-center')}>
            <Button type="button" variant="outline" size="sm" onClick={handleAddItem} disabled={isEditing}>
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
}

/**
 * Ítems del pedido con sus campos por línea (jornada, tipo, horario, fecha, observaciones).
 * La lógica de datos vive en `useItemRows` y cada línea en `ItemRowCard`.
 */
export function ItemsSection({ form, ...props }: ItemsSectionProps) {
  return (
    <FormField
      control={form.control}
      name="item"
      render={({ field }) => <ItemsField form={form} field={field} {...props} />}
    />
  );
}
