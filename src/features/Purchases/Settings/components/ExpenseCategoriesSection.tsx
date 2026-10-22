'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createExpenseCategory,
  renameExpenseCategory,
  setExpenseCategoryActive,
  type ExpenseCategoryRow,
} from '../../actions/expense-categories.server';
import { expenseCategoryFormSchema, type ExpenseCategoryFormValues } from '../../schemas/expense-categories';
import { NameCatalogSection } from './NameCatalogSection';

const resolver = zodResolver(expenseCategoryFormSchema);

const lineCount = (n: number) =>
  n === 0 ? 'Sin usar' : n === 1 ? 'En 1 línea de comprobante' : `En ${n} líneas de comprobante`;

/** Conceptos de gasto: alta, renombre y activar/desactivar. Desactivar no los quita de los comprobantes. */
export function ExpenseCategoriesSection({
  categories,
  canUpdate,
}: {
  categories: ExpenseCategoryRow[];
  canUpdate: boolean;
}) {
  return (
    <NameCatalogSection<ExpenseCategoryRow, ExpenseCategoryFormValues>
      title="Conceptos de gasto"
      description="Para cargar comprobantes sin OC: luz, honorarios, fletes sueltos…"
      noun="concepto"
      namePlaceholder="Luz, Honorarios, Fletes…"
      emptyMessage="Todavía no hay conceptos. Hacen falta para cargar gastos sin OC."
      loggerName="Purchases/ExpenseCategoriesSection"
      rows={categories}
      canUpdate={canUpdate}
      rowDetail={(c) => lineCount(c.lineCount)}
      resolver={resolver}
      create={createExpenseCategory}
      rename={renameExpenseCategory}
      setActive={setExpenseCategoryActive}
    />
  );
}
