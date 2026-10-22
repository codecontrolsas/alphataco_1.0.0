'use client';

import { createClothingBrand, updateClothingBrand } from '@/features/Clothing/actions/catalog.server';
import {
  ClothingNameFormDialog,
  type ClothingNameFormConfig,
} from '@/features/Clothing/components/ClothingNameFormDialog';
import type { ClothingBrandListItem } from '../actions.server';

const BRAND_FORM_CONFIG: ClothingNameFormConfig = {
  loggerName: 'ClothingBrandForm',
  logNoun: 'clothing brand',
  queryKey: 'clothing-brands',
  maxLength: 100,
  placeholder: 'Ej: Nike, Adidas, Caterpillar...',
  create: createClothingBrand,
  update: updateClothingBrand,
  texts: {
    createTitle: 'Nueva marca',
    editTitle: 'Editar marca',
    createDescription: 'Ingresá el nombre de la nueva marca de indumentaria.',
    editDescription: 'Modificá el nombre de la marca de indumentaria.',
    created: 'Marca creada exitosamente',
    updated: 'Marca actualizada exitosamente',
    duplicate: 'Ya existe una marca con ese nombre',
    saveError: 'Error al guardar la marca. Por favor, intente de nuevo.',
    createButton: 'Crear marca',
  },
};

interface ClothingBrandFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, the form is in edit mode */
  brand?: ClothingBrandListItem | null;
}

export function ClothingBrandForm({ open, onOpenChange, brand }: ClothingBrandFormProps) {
  return <ClothingNameFormDialog config={BRAND_FORM_CONFIG} open={open} onOpenChange={onOpenChange} record={brand} />;
}
