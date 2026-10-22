import { Card, CardContent } from '@/components/ui/card';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { DailyReportStatusFilterBar } from './components/DailyReportStatusFilterBar';
import { _DailyReportDetailDataTable } from './components/_DailyReportDetailDataTable';
import { DETAIL_PARAM_NAMESPACE, DETAIL_PREFS_ID } from './constants';
import { getCachedDailyReportHeader } from './lib/header-cache';
import { toReportDateString } from './lib/report-date';
import { getDailyReportDetailPaginated } from './queries.server';

/** Primer valor de un param de URL (puede venir como string o array). */
function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

interface Props {
  uuid: string;
  searchParams: DataTableSearchParams;
}

export async function DailyReportDetailTable({ uuid, searchParams }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, DETAIL_PARAM_NAMESPACE);

  // La cabecera (cacheada por request) arranca YA, en paralelo con permisos y preferencias:
  // solo la paginada necesita su fecha.
  const headerPromise = getCachedDailyReportHeader(uuid);

  const [preferences, canUpdate, canDelete, canAssignResources] = await Promise.all([
    getTablePreferences(DETAIL_PREFS_ID),
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'update'),
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'delete'),
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'assign_resources'),
  ]);

  const header = await headerPromise;
  // YYYY-MM-DD sin timezone para evitar desfase de fecha (UTC midnight → día anterior en hora local)
  const reportDate = toReportDateString(header?.date ?? new Date());

  const { data, total } = await getDailyReportDetailPaginated(uuid, tableParams, reportDate);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <DailyReportStatusFilterBar dailyReportId={uuid} serverStatus={firstParam(tableParams.status)} />
        <_DailyReportDetailDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          dailyReportId={uuid}
          reportDate={reportDate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          canAssignResources={canAssignResources}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
