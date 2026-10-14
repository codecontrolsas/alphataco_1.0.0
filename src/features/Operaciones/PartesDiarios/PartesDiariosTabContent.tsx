import { checkPermissionServer, getUserPermissionsMapServer } from '@/features/Permissions';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { DailyReportList } from './list/DailyReportList';
import { DailyReportTableSkeleton } from './list/fallback/DailyReportTableSkeleton';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  searchParams?: DataTableSearchParams;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function PartesDiariosTabContent({ searchParams = {} }: Props) {
  const [canCreate, permissionsMap] = await Promise.all([
    checkPermissionServer('operaciones', 'dailyreportstable', 'create'),
    getUserPermissionsMapServer(),
  ]);

  return (
    <Suspense fallback={<DailyReportTableSkeleton />}>
      <DailyReportList searchParams={searchParams} permissionsMap={permissionsMap} canCreate={canCreate} />
    </Suspense>
  );
}
