import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { sectionTab } from '@/features/TabsManager/section-tab';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionTableSkeleton } from '@/shared/components/skeletons/SectionTableSkeleton';
import { ArrowLeftRight, ClipboardList, HandHelping, Layers, Package, Settings, Warehouse } from 'lucide-react';
import DepotsTabContent from './Depots/DepotsTabContent';
import LoansTabContent from './Loans/LoansTabContent';
import MaterialsTabContent from './Materials/MaterialsTabContent';
import MovementsTabContent from './Movements/MovementsTabContent';
import RequestsTabContent from './Requests/RequestsTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { SettingsSkeleton } from './Settings/fallback/SettingsSkeleton';
import StockTabContent from './Stock/StockTabContent';

/**
 * Modulo Almacenes (spec docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md).
 *
 * Secciones elegidas desde el sidebar (`?tab=`). Los iconos son los mismos que
 * `SUB_ITEM_ICONS` de `navigation.ts`, para que cada seccion se vea igual en los dos lados.
 */
export default async function WarehousesComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="stock"
      permissions={permissions}
      tabs={[
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'stock',
          icon: Layers,
          text: 'Stock',
          fallback: <SectionTableSkeleton />,
          children: <StockTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'movimientos',
          icon: ArrowLeftRight,
          text: 'Movimientos',
          fallback: <SectionTableSkeleton />,
          children: <MovementsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'prestamos',
          icon: HandHelping,
          text: 'Préstamos',
          fallback: <SectionTableSkeleton />,
          children: <LoansTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'pedidos',
          icon: ClipboardList,
          text: 'Pedidos',
          fallback: <SectionTableSkeleton />,
          children: <RequestsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'materiales',
          icon: Package,
          text: 'Materiales',
          fallback: <SectionTableSkeleton />,
          children: <MaterialsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'depositos',
          icon: Warehouse,
          text: 'Depósitos',
          fallback: <SectionTableSkeleton />,
          children: <DepotsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'almacenes',
          tabSlug: 'config-almacen',
          icon: Settings,
          text: 'Configuración',
          fallback: <SettingsSkeleton />,
          children: <SettingsTabContent permissions={permissions} />,
        }),
      ]}
    />
  );
}
