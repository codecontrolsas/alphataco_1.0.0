import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Suspense } from 'react';
import { TrainingsList } from './TrainingsList/TrainingsList';
import { NewHseTrainingButton } from './components/NewHseTrainingButton';

/** Pestaña Capacitaciones: listado con filtros y alta (`create`). Material, examen y publicación, desde el detalle. */
export default async function TrainingsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['hse:capacitaciones:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['hse:capacitaciones:create'] === true;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground text-pretty">
          Capacitaciones con material y examen que cada empleado rinde desde el portal. La corrección la hace el
          servidor.
        </p>
        {canCreate && <NewHseTrainingButton />}
      </div>
      <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
        <TrainingsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
