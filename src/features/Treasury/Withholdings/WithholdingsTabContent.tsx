import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TreasurySectionSkeleton } from '../fallback/TreasurySectionSkeleton';
import { WithholdingsList } from './WithholdingsList/WithholdingsList';

/**
 * Tab Retenciones sufridas (spec Tesorería etapa 2 §4.5): las retenciones de los recibos
 * confirmados, por mes, con su certificado y el Excel para la liquidación.
 */
export default async function WithholdingsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:retenciones-sufridas:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  return (
    <Suspense fallback={<TreasurySectionSkeleton />}>
      <WithholdingsList searchParams={searchParams} permissionsMap={permissions} />
    </Suspense>
  );
}
