import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import {
  Banknote,
  BookOpenText,
  ClipboardList,
  FileCheck,
  FileQuestion,
  PackageCheck,
  Percent,
  ReceiptText,
  Settings,
  Truck,
} from 'lucide-react';
import { Suspense } from 'react';
import InvoicesTabContent from './Invoices/InvoicesTabContent';
import OrdersTabContent from './Orders/OrdersTabContent';
import PaymentsTabContent from './Payments/PaymentsTabContent';
import QuotesTabContent from './Quotes/QuotesTabContent';
import ReceiptsTabContent from './Receipts/ReceiptsTabContent';
import RequestsTabContent from './Requests/RequestsTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { PurchasesSettingsSkeleton } from './Settings/fallback/PurchasesSettingsSkeleton';
import SuppliersTabContent from './Suppliers/SuppliersTabContent';
import VatBookTabContent from './VatBook/VatBookTabContent';
import { VatBookSkeleton } from './VatBook/fallback/VatBookSkeleton';
import WithholdingsTabContent from './Withholdings/WithholdingsTabContent';
import { WithholdingsSkeleton } from './Withholdings/fallback/WithholdingsSkeleton';
import { PurchasesSectionSkeleton } from './fallback/PurchasesSectionSkeleton';

/**
 * Modulo Compras (specs docs/superpowers/specs/2026-10-08-compras-etapa-1-design.md y
 * 2026-10-08-compras-etapa-2-design.md, y las de las etapas 3 a 5).
 *
 * Secciones elegidas desde el sidebar (`?tab=`). Los iconos son los mismos que
 * `SUB_ITEM_ICONS` de `navigation.ts`, para que cada seccion se vea igual en los dos lados.
 */
export default async function PurchasesComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  const label = (Icon: typeof Truck, text: string) => (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {text}
    </span>
  );

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="solicitudes"
      permissions={permissions}
      tabs={[
        {
          value: 'solicitudes',
          label: label(ClipboardList, 'Solicitudes'),
          moduleSlug: 'compras',
          tabSlug: 'solicitudes',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Solicitudes">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <RequestsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'cotizaciones',
          label: label(FileQuestion, 'Cotizaciones'),
          moduleSlug: 'compras',
          tabSlug: 'cotizaciones',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Cotizaciones">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <QuotesTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'ordenes',
          label: label(FileCheck, 'Órdenes de compra'),
          moduleSlug: 'compras',
          tabSlug: 'ordenes',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Órdenes de compra">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <OrdersTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'recepciones',
          label: label(PackageCheck, 'Recepciones'),
          moduleSlug: 'compras',
          tabSlug: 'recepciones',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Recepciones">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <ReceiptsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'facturas',
          label: label(ReceiptText, 'Facturas'),
          moduleSlug: 'compras',
          tabSlug: 'facturas',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Facturas">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <InvoicesTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'pagos',
          label: label(Banknote, 'Pagos'),
          moduleSlug: 'compras',
          tabSlug: 'pagos',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Pagos">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <PaymentsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'retenciones',
          label: label(Percent, 'Retenciones'),
          moduleSlug: 'compras',
          tabSlug: 'retenciones',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Retenciones">
              <Suspense fallback={<WithholdingsSkeleton />}>
                <WithholdingsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'libro-iva',
          label: label(BookOpenText, 'Libro IVA'),
          moduleSlug: 'compras',
          tabSlug: 'libro-iva',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Libro IVA">
              <Suspense fallback={<VatBookSkeleton />}>
                <VatBookTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'proveedores',
          label: label(Truck, 'Proveedores'),
          moduleSlug: 'compras',
          tabSlug: 'proveedores',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Proveedores">
              <Suspense fallback={<PurchasesSectionSkeleton />}>
                <SuppliersTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'config-compras',
          label: label(Settings, 'Configuración'),
          moduleSlug: 'compras',
          tabSlug: 'config-compras',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Configuración">
              <Suspense fallback={<PurchasesSettingsSkeleton />}>
                <SettingsTabContent permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
      ]}
    />
  );
}
