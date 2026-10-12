import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { getReceivablesSummary } from '../actions/customer-statement.server';
import { NoPermission } from '../fallback/NoPermission';
import { TreasurySectionSkeleton } from '../fallback/TreasurySectionSkeleton';
import { CustomerStatementPicker } from './components/CustomerStatementPicker';
import { ReceivablesSummaryCards } from './components/ReceivablesSummaryCards';
import { ReceiptsList } from './ReceiptsList/ReceiptsList';
import { ReceivablesList } from './ReceivablesList/ReceivablesList';

type CollectionsView = 'receivables' | 'receipts';

const VIEWS: { value: CollectionsView; label: string }[] = [
  { value: 'receivables', label: 'A cobrar' },
  { value: 'receipts', label: 'Recibos' },
];

/**
 * Tab Cobranzas (spec Tesorería etapa 2 §4.2): "A cobrar" (comprobantes con pendiente) y
 * "Recibos", con el resumen de lo vencido, el alta de recibos y el acceso a la cuenta corriente.
 */
export default async function CollectionsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:cobranzas:view'] !== true) return <NoPermission />;
  const canCreate = permissions['tesoreria:cobranzas:create'] === true;
  const view: CollectionsView = searchParams.view === 'receipts' ? 'receipts' : 'receivables';
  const summary = view === 'receivables' ? await getReceivablesSummary() : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Vista de cobranzas" className="inline-flex rounded-md border p-0.5">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={`/dashboard/treasury?tab=cobranzas&view=${v.value}`}
              aria-current={view === v.value ? 'page' : undefined}
              className={
                view === v.value
                  ? 'rounded px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground'
                  : 'rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CustomerStatementPicker />
          {canCreate && (
            <Button asChild size="sm">
              <Link href="/dashboard/treasury/receipts/new">
                <Plus className="mr-1 h-4 w-4" />
                Nuevo recibo
              </Link>
            </Button>
          )}
        </div>
      </div>
      {view === 'receivables' && <ReceivablesSummaryCards summary={summary} />}
      <Suspense fallback={<TreasurySectionSkeleton />}>
        {view === 'receivables' ? (
          <ReceivablesList searchParams={searchParams} permissionsMap={permissions} />
        ) : (
          <ReceiptsList searchParams={searchParams} permissionsMap={permissions} />
        )}
      </Suspense>
    </div>
  );
}
