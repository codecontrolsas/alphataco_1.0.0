import { cn } from '@/lib/utils';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import Link from 'next/link';
import { Suspense } from 'react';
import { TimesList } from '../Times/TimesList/TimesList';
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
  const view = searchParams.vista === 'tiempos' ? 'times' : 'list';
  const tabs = [
    { key: 'list', label: 'Capacitaciones', href: '/dashboard/hse?tab=capacitaciones' },
    { key: 'times', label: 'Tiempos de estudio y examen', href: '/dashboard/hse?tab=capacitaciones&vista=tiempos' },
  ] as const;
  return (
    <div className="space-y-4">
      <nav aria-label="Vista de capacitaciones" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={view === tab.key ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium outline-none focus-visible:ring-2 sm:min-h-9',
              view === tab.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {view === 'times' ? (
        <>
          <p className="text-sm text-muted-foreground text-pretty">
            Cuánto estudió cada empleado el material (de la primera apertura a «Ya lo leí», hasta 4 h por material) y
            cuánto tardó en el examen. «Sin medición» significa que no hay registro, no que fue cero: las aperturas se
            registran desde que se habilitó este reporte.
          </p>
          <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={6} />}>
            <TimesList searchParams={searchParams} />
          </Suspense>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
