'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSupplierCategory,
  setSupplierCategoryActive,
  updateSupplierCategory,
  type SupplierCategoryRow,
} from '../../actions/categories.server';
import { supplierCategoryFormSchema, type SupplierCategoryFormValues } from '../../schemas/suppliers';
import { NameCatalogSection } from './NameCatalogSection';

const resolver = zodResolver(supplierCategoryFormSchema);

const supplierCount = (n: number) => (n === 0 ? 'Sin proveedores' : n === 1 ? '1 proveedor' : `${n} proveedores`);

/** Rubros de proveedor: alta, renombre y activar/desactivar. Desactivar no lo quita de los proveedores. */
export function SupplierCategoriesSection({
  categories,
  canUpdate,
}: {
  categories: SupplierCategoryRow[];
  canUpdate: boolean;
}) {
  return (
    <NameCatalogSection<SupplierCategoryRow, SupplierCategoryFormValues>
      title="Rubros de proveedor"
      description="Qué vende cada proveedor: repuestos, cubiertas, servicios de taller…"
      noun="rubro"
      namePlaceholder="Repuestos, Cubiertas, Servicios de taller…"
      emptyMessage="Todavía no hay rubros. Los proveedores pueden cargarse sin rubro."
      loggerName="Purchases/SupplierCategoriesSection"
      rows={categories}
      canUpdate={canUpdate}
      rowDetail={(c) => supplierCount(c.supplierCount)}
      resolver={resolver}
      create={createSupplierCategory}
      rename={updateSupplierCategory}
      setActive={setSupplierCategoryActive}
    />
  );
}
