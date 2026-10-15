import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getChecksHeader } from '../actions/check-reads.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { DefaultTableFilter } from '../components/DefaultTableFilter';
import { withDefaultTableFilter } from '../lib/default-table-filter';
import { getChecksSectionCount } from '../lib/section-counts';
import { ChecksTableSkeleton } from './ChecksList/fallback/ChecksTableSkeleton';
import { ChecksList, CHECKS_TABLE_ID } from './ChecksList/ChecksList';
import { DEFAULT_STATUS_FILTER } from './ChecksList/constants';
import { ChecksAttentionSection } from './components/ChecksAttentionSection';
import { OpeningChecksButton } from './components/OpeningChecksButton';

/**
 * Tab Cheques (spec Tesorería etapa 3a §4.2): cartera de cheques de terceros con su encabezado
 * (total por cartera y avisos de plazo), la carga inicial y la tabla con depósito y descuento.
 */
export default async function ChecksTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:cheques:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  // Sin filtros de la tabla en la URL arranca en "En cartera": se aplica en la consulta (sin redirect, así no se pierde
  // ningún parámetro) y `DefaultTableFilter` lo deja escrito en la URL, de donde lee el DataTable.
  const listParams = withDefaultTableFilter(searchParams, CHECKS_TABLE_ID, 'status', DEFAULT_STATUS_FILTER);
  // Las promesas arrancan ya y se resuelven en su propio Suspense: la tabla no espera al encabezado.
  const header = getChecksHeader().catch(() => null);
  const warnedCount = getChecksSectionCount().catch(() => null);
  const canCreate = permissions['tesoreria:cheques:create'] === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cheques recibidos de clientes: entran por un recibo o por la carga inicial.</p>
        {canCreate && <OpeningChecksButton />}
      </div>
      <ChecksAttentionSection tableId={CHECKS_TABLE_ID} header={header} warnedCount={warnedCount} />
      <DefaultTableFilter tableId={CHECKS_TABLE_ID} columnId="status" value={DEFAULT_STATUS_FILTER} />
      <Suspense fallback={<ChecksTableSkeleton />}>
        <ChecksList searchParams={listParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
