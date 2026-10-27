import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Suspense } from 'react';
import { ComplianceList } from './ComplianceList/ComplianceList';

/** Pestaña Cumplimiento: quién aceptó, quién tiene pendiente y quién rechazó cada documento publicado. */
export default async function ComplianceTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['hse:cumplimiento:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-pretty">
        Una fila por empleado y documento vigente. Las respuestas a versiones anteriores quedan en el detalle de cada
        documento.
      </p>
      <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={8} />}>
        <ComplianceList searchParams={searchParams} tableId="hse-compliance" />
      </Suspense>
    </div>
  );
}
