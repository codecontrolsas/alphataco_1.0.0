import { TabsManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Calendar, FileArchive } from 'lucide-react';
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
    <div>
      <p className="text-muted-foreground mb-4">Documentación propia de la empresa, con su estado y vencimiento.</p>
      <TabsManagerServer
        paramName="subtab"
        searchParams={searchParams}
        defaultTab="empresa-permanentes"
        permissions={permissions}
        tabs={[
          {
            value: 'empresa-permanentes',
            label: (
              <span className="flex items-center gap-2">
                <FileArchive className="h-4 w-4" />
                Permanentes
              </span>
            ),
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
            label: (
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Mensuales
              </span>
            ),
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
    </div>
  );
}
