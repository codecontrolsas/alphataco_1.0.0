import { Skeleton } from '@/components/ui/skeleton';
import CertificacionesTabContent from '@/features/Comercial/Certificaciones/CertificacionesTabContent';
import { CertificationsTableSkeleton } from '@/features/Comercial/Certificaciones/fallback/CertificationsTableSkeleton';
import DailyReportWrapper from '@/features/Comercial/Comerce/components/DailyReportWrapper';
import DataCustomersWrapper from '@/features/Comercial/Comerce/components/DataCustomersWrapper';
import MensureUnitsWrapper from '@/features/Comercial/Comerce/components/MensureUnitsWrapper';
import ServiceComponentWrapper from '@/features/Comercial/Comerce/components/ServiceComponentWrapper';
import { DailyReportsSkeleton } from '@/features/Comercial/Comerce/fallback/DailyReportsSkeleton';
import FacturacionTabContent from '@/features/Comercial/Facturacion/FacturacionTabContent';
import { InvoicesTableSkeleton } from '@/features/Comercial/Facturacion/fallback/InvoicesTableSkeleton';
import ReglasPrecioTabContent from '@/features/Comercial/ReglasPrecio/ReglasPrecioTabContent';
import { SectionManagerServer } from '@/features/TabsManager';
import { ClipboardList, FileSpreadsheet, FileText, Receipt, Ruler, TrendingUp, Users } from 'lucide-react';
import { Suspense } from 'react';

export default function ComerceTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <SectionManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultTab="customers"
      permissions={permissions}
      tabs={[
        {
          value: 'customers',
          label: (
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'customers',
          content: (
            <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
              <DataCustomersWrapper searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'service',
          label: (
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Contratos
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'service',
          content: (
            <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
              <ServiceComponentWrapper />
            </Suspense>
          ),
        },
        {
          value: 'mensure_units',
          label: (
            <span className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Unidades de Medida
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'mensure_units',
          content: (
            <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
              <MensureUnitsWrapper />
            </Suspense>
          ),
        },
        {
          value: 'reglas-precio',
          label: (
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Reglas de Precio
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'reglas-precio',
          content: (
            <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
              <ReglasPrecioTabContent />
            </Suspense>
          ),
        },
        {
          value: 'certificaciones',
          label: (
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Certificaciones
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'certificaciones',
          content: (
            <Suspense fallback={<CertificationsTableSkeleton />}>
              <CertificacionesTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'facturacion',
          label: (
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Facturación
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'facturacion',
          content: (
            <Suspense fallback={<InvoicesTableSkeleton />}>
              <FacturacionTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'daily_reports',
          label: (
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Partes Diarios
            </span>
          ),
          moduleSlug: 'comercial',
          tabSlug: 'daily_reports',
          content: (
            <Suspense fallback={<DailyReportsSkeleton />}>
              <DailyReportWrapper searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
