import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { MovementsList } from './components/MovementsList/MovementsList';
import { MovementsTableSkeleton } from './components/MovementsList/fallback/MovementsTableSkeleton';

export default async function MovementsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'movimientos', 'view')) return <NoPermission />;
  // Quien solo puede ajustar tambien entra al formulario: ahi ve solo el tipo "Ajuste".
  const canRegister =
    canWarehouse(permissions, 'movimientos', 'create') || canWarehouse(permissions, 'movimientos', 'adjust');

  return (
    <div className="space-y-4">
      {canRegister && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/warehouse/movements/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo movimiento
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<MovementsTableSkeleton />}>
        <MovementsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
