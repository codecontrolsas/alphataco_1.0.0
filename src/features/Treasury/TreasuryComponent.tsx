import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ArrowLeftRight, Landmark, Repeat, Settings } from 'lucide-react';
import { Suspense } from 'react';
import AccountsTabContent from './Accounts/AccountsTabContent';
import { AccountCardsSkeleton } from './Accounts/fallback/AccountCardsSkeleton';
import MovementsTabContent from './Movements/MovementsTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { TreasurySettingsSkeleton } from './Settings/fallback/TreasurySettingsSkeleton';
import TransfersTabContent from './Transfers/TransfersTabContent';
import { TreasurySectionSkeleton } from './fallback/TreasurySectionSkeleton';

/**
 * Módulo Tesorería (spec docs/superpowers/specs/2026-10-10-tesoreria-etapa-1-design.md).
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
      tabs={[
        {
          value: 'cuentas',
          label: label(Landmark, 'Cuentas'),
          moduleSlug: 'tesoreria',
          tabSlug: 'cuentas',
          content: (
            <Suspense fallback={<AccountCardsSkeleton />}>
              <AccountsTabContent permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'movimientos',
          label: label(ArrowLeftRight, 'Movimientos'),
          moduleSlug: 'tesoreria',
          tabSlug: 'movimientos',
          content: (
            <Suspense fallback={<TreasurySectionSkeleton />}>
              <MovementsTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'transferencias',
          label: label(Repeat, 'Transferencias'),
          moduleSlug: 'tesoreria',
          tabSlug: 'transferencias',
          content: (
            <Suspense fallback={<TreasurySectionSkeleton />}>
              <TransfersTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'config-tesoreria',
          label: label(Settings, 'Configuración'),
          moduleSlug: 'tesoreria',
          tabSlug: 'config-tesoreria',
          content: (
            <Suspense fallback={<TreasurySettingsSkeleton />}>
              <SettingsTabContent permissions={permissions} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
