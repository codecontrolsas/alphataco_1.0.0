import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { HandHelping } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { LoansList } from './components/LoansList/LoansList';


/** Herramientas prestadas: quien tiene cada una y desde cuando (spec etapa 2 §4.1). */
export default async function LoansTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'prestamos', 'view')) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información." />;

  // Un prestamo nace de una salida de herramienta en Movimientos: el acceso abre esa salida.
  return (
    <div className="space-y-4">
      {canWarehouse(permissions, 'movimientos', 'create') && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-muted-foreground">Un préstamo es la salida de una herramienta con número de serie.</p>
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/warehouse/movements/new?type=EXIT">
              <HandHelping className="mr-2 h-4 w-4" />
              Prestar herramienta
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={8} rowCount={8} />}>
        <LoansList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
