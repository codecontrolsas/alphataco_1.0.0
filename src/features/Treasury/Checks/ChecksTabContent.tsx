import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';
import { getChecksHeader } from '../actions/checks.server';
import { NoPermission } from '../fallback/NoPermission';
import { ChecksTableSkeleton } from './ChecksList/fallback/ChecksTableSkeleton';
import { ChecksList, CHECKS_TABLE_ID } from './ChecksList/ChecksList';
import { DEFAULT_STATUS_FILTER } from './ChecksList/constants';
import { ChecksHeaderCards } from './components/ChecksHeaderCards';
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
  if (permissions['tesoreria:cheques:view'] !== true) return <NoPermission />;
  // La tabla lee sus filtros de la URL: al entrar sin ninguno, arranca mostrando los cheques En cartera.
  const statusKey = `${CHECKS_TABLE_ID}${PARAM_SEPARATOR}status`;
  const hasTableParams = Object.keys(searchParams).some((key) => key.startsWith(`${CHECKS_TABLE_ID}${PARAM_SEPARATOR}`));
  if (!hasTableParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (typeof value === 'string') params.set(key, value);
    params.set(statusKey, DEFAULT_STATUS_FILTER);
    redirect(`/dashboard/treasury?${params.toString()}`);
  }
  const header = await getChecksHeader();
  const canCreate = permissions['tesoreria:cheques:create'] === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cheques recibidos de clientes: entran por un recibo o por la carga inicial.</p>
        {canCreate && <OpeningChecksButton />}
      </div>
      {header && header.portfolios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay una cartera de cheques. Creala en Tesorería → Configuración, con el tipo «Cartera de cheques».
        </p>
      ) : (
        header && <ChecksHeaderCards header={header} />
      )}
      <Suspense fallback={<ChecksTableSkeleton />}>
        <ChecksList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
