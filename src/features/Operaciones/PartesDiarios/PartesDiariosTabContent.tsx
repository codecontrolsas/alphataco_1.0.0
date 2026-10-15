import { checkPermissionServer, getUserPermissionsMapServer } from '@/features/Permissions';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { NewDailyReportDialog } from './components/NewDailyReportDialog';
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-end gap-4">{canCreate && <NewDailyReportDialog />}</div>

      <Suspense fallback={<DailyReportTableSkeleton />}>
        <DailyReportList searchParams={searchParams} permissionsMap={permissionsMap} />
      </Suspense>
    </div>
  );
}
