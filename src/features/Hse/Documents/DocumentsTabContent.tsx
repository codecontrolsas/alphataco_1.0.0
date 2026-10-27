import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Suspense } from 'react';
import { DocumentsList } from './DocumentsList/DocumentsList';
import { NewHseDocumentButton } from './components/NewHseDocumentButton';

/** Pestaña Documentos HSE: listado con filtros y alta (`create`). Publicar y versionar se hacen desde el detalle. */
export default async function DocumentsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['hse:documentos-hse:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['hse:documentos-hse:create'] === true;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground text-pretty">
          Normas y procedimientos que cada empleado lee y acepta desde el portal.
        </p>
        {canCreate && <NewHseDocumentButton />}
      </div>
      <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={6} />}>
        <DocumentsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
