import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCheckbooks, getOwnChecksHeader } from '../actions/own-checks.server';
import { NoPermission } from '../fallback/NoPermission';
import { CheckbooksCard } from './components/CheckbooksCard';
import { OwnChecksHeaderCards } from './components/OwnChecksHeaderCards';
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
  if (permissions['tesoreria:cheques-propios:view'] !== true) return <NoPermission />;
  // La tabla lee sus filtros de la URL: al entrar sin ninguno, arranca mostrando los cheques Emitidos.
  const statusKey = `${OWN_CHECKS_TABLE_ID}${PARAM_SEPARATOR}status`;
  const hasTableParams = Object.keys(searchParams).some((key) => key.startsWith(`${OWN_CHECKS_TABLE_ID}${PARAM_SEPARATOR}`));
  if (!hasTableParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (typeof value === 'string') params.set(key, value);
    params.set(statusKey, DEFAULT_STATUS_FILTER);
    redirect(`/dashboard/treasury?${params.toString()}`);
  }
  const [header, checkbooks] = await Promise.all([getOwnChecksHeader(), getCheckbooks()]);
  const can = {
    create: permissions['tesoreria:cheques-propios:create'] === true,
    retire: permissions['tesoreria:cheques-propios:delete'] === true,
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cheques y e-cheqs que emite la empresa al pagar órdenes de pago. Quedan emitidos hasta que confirmás que el banco los debitó.
      </p>
      {header && <OwnChecksHeaderCards header={header} />}
      <CheckbooksCard checkbooks={checkbooks} can={can} />
      <Suspense fallback={<OwnChecksTableSkeleton />}>
        <OwnChecksList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
