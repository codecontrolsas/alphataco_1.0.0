import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { SectionManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ArrowLeftRight, HandCoins, Landmark, ListChecks, Percent, Repeat, ScrollText, Settings, WalletCards } from 'lucide-react';
import { Suspense } from 'react';
import AccountsTabContent from './Accounts/AccountsTabContent';
import ChecksTabContent from './Checks/ChecksTabContent';
import CollectionsTabContent from './Collections/CollectionsTabContent';
import { AccountCardsSkeleton } from './Accounts/fallback/AccountCardsSkeleton';
import MovementsTabContent from './Movements/MovementsTabContent';
import OwnChecksTabContent from './OwnChecks/OwnChecksTabContent';
import ReconciliationTabContent from './Reconciliation/ReconciliationTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { TreasurySettingsSkeleton } from './Settings/fallback/TreasurySettingsSkeleton';
import TransfersTabContent from './Transfers/TransfersTabContent';
import WithholdingsTabContent from './Withholdings/WithholdingsTabContent';
import { TreasurySectionCounter } from './components/TreasurySectionCounter';
import { TreasurySectionSkeleton } from './fallback/TreasurySectionSkeleton';

/**
 * Módulo Tesorería (specs docs/superpowers/specs/2026-10-10-tesoreria-etapa-1-design.md,
 * 2026-10-10-tesoreria-etapa-2-design.md, 2026-10-11-tesoreria-etapa-3a-design.md y
 * 2026-10-11-tesoreria-etapa-3b-design.md y 2026-10-12-tesoreria-etapa-4-design.md).
 *
 * Secciones elegidas desde el sidebar (`?tab=`). Los íconos son los mismos que `SUB_ITEM_ICONS`
 * de `navigation.ts`.
 */
export default async function TreasuryComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  const label = (Icon: typeof Landmark, text: string) => (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {text}
    </span>
  );

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="cuentas"
      permissions={permissions}
      sectionNav
      tabs={[
        {
          value: 'cuentas',
          label: label(Landmark, 'Cuentas'),
          moduleSlug: 'tesoreria',
          tabSlug: 'cuentas',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Cuentas">
              <Suspense fallback={<AccountCardsSkeleton />}>
                <AccountsTabContent permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'movimientos',
          label: label(ArrowLeftRight, 'Movimientos'),
          moduleSlug: 'tesoreria',
          tabSlug: 'movimientos',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Movimientos">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <MovementsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'transferencias',
          label: label(Repeat, 'Transferencias'),
          moduleSlug: 'tesoreria',
          tabSlug: 'transferencias',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Transferencias">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <TransfersTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'cobranzas',
          label: label(HandCoins, 'Cobranzas'),
          moduleSlug: 'tesoreria',
          tabSlug: 'cobranzas',
          navCounter: (
            <Suspense fallback={null}>
              <TreasurySectionCounter section="collections" label="Cobros vencidos" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Cobranzas">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <CollectionsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'cheques',
          label: label(WalletCards, 'Cheques'),
          moduleSlug: 'tesoreria',
          tabSlug: 'cheques',
          navCounter: (
            <Suspense fallback={null}>
              <TreasurySectionCounter section="checks" label="Cheques por vencer o vencidos para depositar" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Cheques">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <ChecksTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'cheques-propios',
          label: label(ScrollText, 'Cheques propios'),
          moduleSlug: 'tesoreria',
          tabSlug: 'cheques-propios',
          navCounter: (
            <Suspense fallback={null}>
              <TreasurySectionCounter section="ownChecks" label="Débitos pendientes de confirmar" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Cheques propios">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <OwnChecksTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'conciliacion',
          label: label(ListChecks, 'Conciliación'),
          moduleSlug: 'tesoreria',
          tabSlug: 'conciliacion',
          navCounter: (
            <Suspense fallback={null}>
              <TreasurySectionCounter section="reconciliation" label="Líneas de extracto pendientes de conciliar" />
            </Suspense>
          ),
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Conciliación">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <ReconciliationTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'retenciones-sufridas',
          label: label(Percent, 'Retenciones sufridas'),
          moduleSlug: 'tesoreria',
          tabSlug: 'retenciones-sufridas',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Retenciones sufridas">
              <Suspense fallback={<TreasurySectionSkeleton />}>
                <WithholdingsTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'config-tesoreria',
          label: label(Settings, 'Configuración'),
          moduleSlug: 'tesoreria',
          tabSlug: 'config-tesoreria',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar Configuración">
              <Suspense fallback={<TreasurySettingsSkeleton />}>
                <SettingsTabContent permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
      ]}
    />
  );
}
