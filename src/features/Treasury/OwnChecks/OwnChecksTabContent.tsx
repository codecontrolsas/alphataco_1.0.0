import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getCheckbooks, getOwnChecksHeader } from '../actions/own-checks.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { DefaultTableFilter } from '../components/DefaultTableFilter';
import { withDefaultTableFilter } from '../lib/default-table-filter';
import { getOwnChecksSectionCount } from '../lib/section-counts';
import { CheckbooksSection } from './components/CheckbooksSection';
import { OwnChecksAttentionSection } from './components/OwnChecksAttentionSection';
import { DEFAULT_STATUS_FILTER } from './OwnChecksList/constants';
import { OwnChecksList, OWN_CHECKS_TABLE_ID } from './OwnChecksList/OwnChecksList';
import { OwnChecksTableSkeleton } from './OwnChecksList/fallback/OwnChecksTableSkeleton';

/**
 * Tab Cheques propios (spec Tesorería etapa 3b §4.2): lo emitido sin debitar por cuenta, las
 * chequeras y la tabla de cheques con la confirmación de débitos.
 */
export default async function OwnChecksTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:cheques-propios:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  // Sin filtros de la tabla en la URL arranca en "Emitidos": se aplica en la consulta (sin redirect, así no se pierde
  // ningún parámetro) y `DefaultTableFilter` lo deja escrito en la URL, de donde lee el DataTable.
  const listParams = withDefaultTableFilter(searchParams, OWN_CHECKS_TABLE_ID, 'status', DEFAULT_STATUS_FILTER);
  // Las promesas arrancan ya y se resuelven en su propio Suspense: la tabla no espera al encabezado ni a las chequeras.
  const header = getOwnChecksHeader().catch(() => null);
  const pendingCount = getOwnChecksSectionCount().catch(() => null);
  const checkbooks = getCheckbooks().catch(() => null);
  const can = {
    create: permissions['tesoreria:cheques-propios:create'] === true,
    retire: permissions['tesoreria:cheques-propios:delete'] === true,
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cheques y e-cheqs que emite la empresa al pagar órdenes de pago. Quedan emitidos hasta que confirmás que el banco los debitó.
      </p>
      <OwnChecksAttentionSection tableId={OWN_CHECKS_TABLE_ID} header={header} pendingCount={pendingCount} />
      <DefaultTableFilter tableId={OWN_CHECKS_TABLE_ID} columnId="status" value={DEFAULT_STATUS_FILTER} />
      <CheckbooksSection checkbooks={checkbooks} can={can} />
      <Suspense fallback={<OwnChecksTableSkeleton />}>
        <OwnChecksList searchParams={listParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
