'use client';

import { createClothingSize, updateClothingSize } from '@/features/Clothing/actions/catalog.server';
import {
  ClothingNameFormDialog,
  type ClothingNameFormConfig,
} from '@/features/Clothing/components/ClothingNameFormDialog';
import type { ClothingSizeListItem } from '../ClothingSizesList/actions.server';

const SIZE_FORM_CONFIG: ClothingNameFormConfig = {
  loggerName: 'ClothingSizeForm',
  logNoun: 'clothing size',
  queryKey: 'clothing-sizes',
  maxLength: 50,
  placeholder: 'Ej: S, M, L, XL, 42, 44...',
  create: createClothingSize,
  update: updateClothingSize,
  texts: {
    createTitle: 'Nuevo talle',
    editTitle: 'Editar talle',
    createDescription: 'Ingresá el nombre del nuevo talle de indumentaria.',
    editDescription: 'Modificá el nombre del talle de indumentaria.',
    created: 'Talle creado exitosamente',
    updated: 'Talle actualizado exitosamente',
    duplicate: 'Ya existe un talle con ese nombre',
    saveError: 'Error al guardar el talle. Por favor, intente de nuevo.',
    createButton: 'Crear talle',
  },
};

interface ClothingSizeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, the form is in edit mode */
  size?: ClothingSizeListItem | null;
  /** Called after a successful create/update */
  onSuccess?: () => void;
}

export function ClothingSizeForm({ open, onOpenChange, size, onSuccess }: ClothingSizeFormProps) {
  return (
    <ClothingNameFormDialog
      config={SIZE_FORM_CONFIG}
      open={open}
      onOpenChange={onOpenChange}
      record={size}
      onSuccess={onSuccess}
    />
  );
}
