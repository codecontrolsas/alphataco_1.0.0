'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createMaterialCategory,
  reactivateMaterialCategory,
  removeMaterialCategory,
  updateMaterialCategory,
  type WarehouseSettings,
} from '../../actions/catalog.server';
import { materialCategoryFormSchema, type MaterialCategoryFormValues } from '../../schemas/catalog';
import { MaterialCatalogSection } from './MaterialCatalogSection';

type Category = WarehouseSettings['categories'][number];

interface CategoriesSectionProps {
  categories: Category[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function CategoriesSection({ categories, ...permissions }: CategoriesSectionProps) {
  return (
    <MaterialCatalogSection<Category, MaterialCategoryFormValues>
      title="Categorías de materiales"
      description="Agrupan el catálogo: Lubricantes, Herramientas, EPP…"
      noun="categoría"
      emptyMessage="Todavía no hay categorías. Los materiales pueden cargarse sin categoría."
      removalDescription="Si algún material la usa, se desactiva y deja de ofrecerse; si no, se elimina."
      items={categories}
      resolver={zodResolver(materialCategoryFormSchema)}
      emptyValues={{ name: '' }}
      toFormValues={(c) => ({ name: c.name })}
      itemTitle={(c) => c.name}
      create={createMaterialCategory}
      update={updateMaterialCategory}
      remove={removeMaterialCategory}
      reactivate={reactivateMaterialCategory}
      {...permissions}
    />
  );
}
