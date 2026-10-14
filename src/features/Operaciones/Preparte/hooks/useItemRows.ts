'use client';

import { Logger } from '@/lib/logger';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ItemRow } from '../components/preparte-form/types';
import type { PreparteFormData } from '../schemas/preparte-form';

const logger = new Logger('PreparteForm');

type RowPatch = Partial<ItemRow> | ((row: ItemRow) => Partial<ItemRow>);

interface UseItemRowsOptions {
  form: UseFormReturn<PreparteFormData>;
  selectedItems: ItemRow[];
  setSelectedItems: Dispatch<SetStateAction<ItemRow[]>>;
  /** `field.onChange` del campo `item` de RHF: así la validación sigue el modo del formulario. */
  onChange: (items: object[]) => void;
  isEditing: boolean;
  originalItemId: string | null;
  setShowItemChangeReason: Dispatch<SetStateAction<boolean>>;
}

/**
 * Lógica de datos de las líneas de ítem del pedido: cada cambio actualiza el estado local de las
 * líneas y sincroniza el campo `item` del formulario (solo las líneas con ítem elegido).
 */
export function useItemRows({
  form,
  selectedItems,
  setSelectedItems,
  onChange,
  isEditing,
  originalItemId,
  setShowItemChangeReason,
}: UseItemRowsOptions) {
  const syncFormValue = (rows: ItemRow[]) => {
    const formItems = rows
      .filter((row) => row.id)
      .map((row) => ({
        id: row.id,
        quantity: row.quantity,
        // PP-3: Incluir todos los campos requeridos por ítem
        jornada: row.jornada,
        tipo: row.tipo,
        observaciones: row.observaciones,
        start_time: row.start_time,
        end_time: row.end_time,
        executionDate: row.executionDate,
        subject_to_availability: row.subject_to_availability,
      }));
    onChange(formItems);

    // Log para depuración
    logger.debug('syncFormValue - Items sincronizados', {
      data: {
        itemCount: formItems.length,
        items: formItems,
      },
    });
  };

  const apply = (rows: ItemRow[]) => {
    setSelectedItems(rows);
    syncFormValue(rows);
  };

  /** Cambia campos de la línea `index` (un objeto parcial o una función de la línea actual). */
  const updateRow = (index: number, patch: RowPatch) => {
    apply(
      selectedItems.map((row, i) =>
        i === index ? { ...row, ...(typeof patch === 'function' ? patch(row) : patch) } : row
      )
    );
  };

  const removeRow = (index: number) => {
    apply(selectedItems.filter((_, i) => i !== index));
  };

  /** Elige el ítem de una línea; en edición detecta si cambió respecto del original para pedir el motivo. */
  const selectItem = (index: number, newItemId: string) => {
    apply(selectedItems.map((row, i) => (i === index ? { ...row, id: newItemId } : row)));

    if (isEditing && originalItemId && newItemId !== originalItemId) {
      setShowItemChangeReason(true);
    } else if (isEditing && newItemId === originalItemId) {
      setShowItemChangeReason(false);
      form.setValue('item_change_reason', '');
    }
  };

  return { updateRow, removeRow, selectItem };
}
