import { Button } from '@/components/ui/button';
import { checkPermissionServer } from '@/features/Permissions';
import { getMovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { NewMovementForm } from '@/features/Warehouses/Movements/components/NewMovementForm';
import type { StockMovementTypeValue } from '@/features/Warehouses/schemas/stock-movement';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nuevo movimiento | Almacenes' };

export default async function NewStockMovementPage() {
  const [canCreate, canAdjust, canDirectExit, canRequest] = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'create'),
    checkPermissionServer('almacenes', 'movimientos', 'adjust'),
    checkPermissionServer('almacenes', 'movimientos', 'direct_exit'),
    checkPermissionServer('almacenes', 'pedidos', 'create'),
  ]);
  if (!canCreate && !canAdjust) notFound();

  const allowedTypes: StockMovementTypeValue[] = [
    ...(canCreate ? (['ENTRY', 'EXIT', 'TRANSFER'] as const) : []),
    ...(canAdjust ? (['ADJUSTMENT'] as const) : []),
  ];
  const lookups = await getMovementFormLookups();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Volver a movimientos">
          <Link href="/dashboard/warehouse?tab=movimientos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Nuevo movimiento</h1>
      </div>
      <NewMovementForm lookups={lookups} allowedTypes={allowedTypes} canDirectExit={canDirectExit} canRequest={canRequest} />
    </div>
  );
}
