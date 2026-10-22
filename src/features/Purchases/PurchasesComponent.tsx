import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { sectionTab } from '@/features/TabsManager/section-tab';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionTableSkeleton } from '@/shared/components/skeletons/SectionTableSkeleton';
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
import WithholdingsTabContent from './Withholdings/WithholdingsTabContent';
import { PeriodReportSkeleton } from './fallback/PeriodReportSkeleton';

/**
 * Modulo Compras (specs docs/superpowers/specs/2026-10-08-compras-etapa-1-design.md y
 * 2026-10-08-compras-etapa-2-design.md, y las de las etapas 3 a 5).
 *
 * Secciones elegidas desde el sidebar (`?tab=`). Los iconos son los mismos que
 * `SUB_ITEM_ICONS` de `navigation.ts`, para que cada seccion se vea igual en los dos lados.
 */
export default async function PurchasesComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="solicitudes"
      permissions={permissions}
      tabs={[
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'solicitudes',
          icon: ClipboardList,
          text: 'Solicitudes',
          fallback: <SectionTableSkeleton />,
          children: <RequestsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'cotizaciones',
          icon: FileQuestion,
          text: 'Cotizaciones',
          fallback: <SectionTableSkeleton />,
          children: <QuotesTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'ordenes',
          icon: FileCheck,
          text: 'Órdenes de compra',
          fallback: <SectionTableSkeleton />,
          children: <OrdersTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'recepciones',
          icon: PackageCheck,
          text: 'Recepciones',
          fallback: <SectionTableSkeleton />,
          children: <ReceiptsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'facturas',
          icon: ReceiptText,
          text: 'Facturas',
          fallback: <SectionTableSkeleton />,
          children: <InvoicesTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'pagos',
          icon: Banknote,
          text: 'Pagos',
          fallback: <SectionTableSkeleton />,
          children: <PaymentsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'retenciones',
          icon: Percent,
          text: 'Retenciones',
          fallback: <PeriodReportSkeleton columnCount={7} />,
          children: <WithholdingsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'libro-iva',
          icon: BookOpenText,
          text: 'Libro IVA',
          fallback: <PeriodReportSkeleton columnCount={8} />,
          children: <VatBookTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'proveedores',
          icon: Truck,
          text: 'Proveedores',
          fallback: <SectionTableSkeleton />,
          children: <SuppliersTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'compras',
          tabSlug: 'config-compras',
          icon: Settings,
          text: 'Configuración',
          fallback: <PurchasesSettingsSkeleton />,
          children: <SettingsTabContent permissions={permissions} />,
        }),
      ]}
    />
  );
}
