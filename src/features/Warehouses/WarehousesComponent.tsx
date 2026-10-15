import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { SectionManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ArrowLeftRight, ClipboardList, HandHelping, Layers, Package, Settings, Warehouse } from 'lucide-react';
import { Suspense } from 'react';
import DepotsTabContent from './Depots/DepotsTabContent';
import LoansTabContent from './Loans/LoansTabContent';
import MaterialsTabContent from './Materials/MaterialsTabContent';
import MovementsTabContent from './Movements/MovementsTabContent';
import RequestsTabContent from './Requests/RequestsTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { SettingsSkeleton } from './Settings/fallback/SettingsSkeleton';
import StockTabContent from './Stock/StockTabContent';
import { WarehouseSectionCounter } from './components/WarehouseSectionCounter';
import { WarehouseSectionSkeleton } from './fallback/WarehouseSectionSkeleton';

/**
 * Modulo Almacenes (spec docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md).
 *
 * Secciones elegidas desde el sidebar (`?tab=`). Los iconos son los mismos que
 * `SUB_ITEM_ICONS` de `navigation.ts`, para que cada seccion se vea igual en los dos lados.
 */
export default async function WarehousesComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  const label = (Icon: typeof Layers, text: string) => (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {text}
    </span>
  );

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="stock"
      permissions={permissions}
      sectionNav
      tabs={[
        {
          value: 'stock',
          label: label(Layers, 'Stock'),
          moduleSlug: 'almacenes',
          tabSlug: 'stock',
          navCounter: (
            <Suspense fallback={null}>
              <WarehouseSectionCounter section="stock" label="Materiales bajo mínimo y lotes por vencer" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Stock">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <StockTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'movimientos',
          label: label(ArrowLeftRight, 'Movimientos'),
          moduleSlug: 'almacenes',
          tabSlug: 'movimientos',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Movimientos">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <MovementsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'prestamos',
          label: label(HandHelping, 'Préstamos'),
          moduleSlug: 'almacenes',
          tabSlug: 'prestamos',
          navCounter: (
            <Suspense fallback={null}>
              <WarehouseSectionCounter section="loans" label="Préstamos abiertos" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Préstamos">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <LoansTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'pedidos',
          label: label(ClipboardList, 'Pedidos'),
          moduleSlug: 'almacenes',
          tabSlug: 'pedidos',
          navCounter: (
            <Suspense fallback={null}>
              <WarehouseSectionCounter section="requests" label="Pedidos pendientes de aprobación" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Pedidos">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <RequestsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'materiales',
          label: label(Package, 'Materiales'),
          moduleSlug: 'almacenes',
          tabSlug: 'materiales',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Materiales">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <MaterialsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'depositos',
          label: label(Warehouse, 'Depósitos'),
          moduleSlug: 'almacenes',
          tabSlug: 'depositos',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Depósitos">
              <Suspense fallback={<WarehouseSectionSkeleton />}>
                <DepotsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'config-almacen',
          label: label(Settings, 'Configuración'),
          moduleSlug: 'almacenes',
          tabSlug: 'config-almacen',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Configuración">
              <Suspense fallback={<SettingsSkeleton />}>
                <SettingsTabContent permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
      ]}
    />
  );
}
