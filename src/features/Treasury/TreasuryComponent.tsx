import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { sectionTab } from '@/features/TabsManager/section-tab';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionTableSkeleton } from '@/shared/components/skeletons/SectionTableSkeleton';
import {
  ArrowLeftRight,
  HandCoins,
  Landmark,
  ListChecks,
  Percent,
  Repeat,
  ScrollText,
  Settings,
  WalletCards,
} from 'lucide-react';
import AccountsTabContent from './Accounts/AccountsTabContent';
import { AccountCardsSkeleton } from './Accounts/fallback/AccountCardsSkeleton';
import ChecksTabContent from './Checks/ChecksTabContent';
import CollectionsTabContent from './Collections/CollectionsTabContent';
import MovementsTabContent from './Movements/MovementsTabContent';
import OwnChecksTabContent from './OwnChecks/OwnChecksTabContent';
import ReconciliationTabContent from './Reconciliation/ReconciliationTabContent';
import SettingsTabContent from './Settings/SettingsTabContent';
import { TreasurySettingsSkeleton } from './Settings/fallback/TreasurySettingsSkeleton';
import TransfersTabContent from './Transfers/TransfersTabContent';
import WithholdingsTabContent from './Withholdings/WithholdingsTabContent';

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

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="cuentas"
      permissions={permissions}
      tabs={[
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'cuentas',
          icon: Landmark,
          text: 'Cuentas',
          fallback: <AccountCardsSkeleton />,
          children: <AccountsTabContent permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'movimientos',
          icon: ArrowLeftRight,
          text: 'Movimientos',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <MovementsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'transferencias',
          icon: Repeat,
          text: 'Transferencias',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <TransfersTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'cobranzas',
          icon: HandCoins,
          text: 'Cobranzas',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <CollectionsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'cheques',
          icon: WalletCards,
          text: 'Cheques',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <ChecksTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'cheques-propios',
          icon: ScrollText,
          text: 'Cheques propios',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <OwnChecksTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'conciliacion',
          icon: ListChecks,
          text: 'Conciliación',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <ReconciliationTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'retenciones-sufridas',
          icon: Percent,
          text: 'Retenciones sufridas',
          fallback: <SectionTableSkeleton filterCount={2} />,
          children: <WithholdingsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'tesoreria',
          tabSlug: 'config-tesoreria',
          icon: Settings,
          text: 'Configuración',
          fallback: <TreasurySettingsSkeleton />,
          children: <SettingsTabContent permissions={permissions} />,
        }),
      ]}
    />
  );
}
