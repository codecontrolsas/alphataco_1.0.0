import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { getPurchasesVatBook, getPurchasesVatBookPeriods } from '../actions/vat-book.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { VatBookView } from './components/VatBookView';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Libro IVA Compras del periodo elegido (`?period=YYYY-MM`, por defecto el mes actual). */
export default async function VatBookTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:libro-iva:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const raw = (searchParams as Record<string, string | string[] | undefined>).period;
  const requested = typeof raw === 'string' && PERIOD_RE.test(raw) ? raw : argentinaDate().slice(0, 7);
  const [book, periods] = await Promise.all([getPurchasesVatBook(requested), getPurchasesVatBookPeriods()]);
  if (!book) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  return <VatBookView initialBook={book} periods={periods.includes(requested) ? periods : [requested, ...periods]} />;
}
