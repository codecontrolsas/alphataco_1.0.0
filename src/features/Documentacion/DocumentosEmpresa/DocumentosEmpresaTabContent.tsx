import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import CompanyDocsMensualesList from './components/CompanyDocsMensualesList';
import CompanyDocsPermanentesList from './components/CompanyDocsPermanentesList';
import { CompanyDocsTableSkeleton } from './fallback/CompanyDocsTableSkeleton';

export default async function DocumentosEmpresaTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="empresa-permanentes"
      permissions={permissions}
      ariaLabel="Documentos de la empresa"
      views={[
        {
          value: 'empresa-permanentes',
          aliases: ['permanentes'],
          label: 'Permanentes',
          description: 'Documentos sin período, con o sin vencimiento',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empresa-permanentes',
          content: (
            <Suspense fallback={<CompanyDocsTableSkeleton />}>
              <CompanyDocsPermanentesList searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'empresa-mensuales',
          aliases: ['mensuales'],
          label: 'Mensuales',
          description: 'Documentos que se presentan cada mes',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empresa-mensuales',
          content: (
            <Suspense fallback={<CompanyDocsTableSkeleton />}>
              <CompanyDocsMensualesList searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
