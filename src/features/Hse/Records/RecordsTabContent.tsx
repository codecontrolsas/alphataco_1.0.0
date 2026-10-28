import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Suspense } from 'react';
import { getPublishedTrainingOptions } from '../actions/records.queries';
import { RecordsList } from './RecordsList/RecordsList';
import { NewHseRecordButton } from './components/NewHseRecordButton';

/**
 * Pestaña Actas: los dictados de cada capacitación con su cierre formal. El acta se arma en borrador (capacitadores y
 * asistentes) y al cerrarla queda congelada con su huella y su PDF.
 */
export default async function RecordsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['hse:actas:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['hse:actas:create'] === true;
  const trainings = canCreate ? await getPublishedTrainingOptions() : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm text-pretty">
          Actas de dictado: capacitadores, asistentes y resultados. Al cerrarla, queda congelada con su huella y su PDF.
        </p>
        {canCreate && <NewHseRecordButton trainings={trainings} />}
      </div>
      <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={6} />}>
        <RecordsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
