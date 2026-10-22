import { Button } from '@/components/ui/button';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getMovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { NewMovementForm } from '@/features/Warehouses/Movements/components/NewMovementForm';
import { STOCK_MOVEMENT_TYPES, type StockMovementTypeValue } from '@/features/Warehouses/schemas/stock-movement';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nuevo movimiento | Almacenes' };

const isMovementType = (value: string | undefined): value is StockMovementTypeValue =>
  (STOCK_MOVEMENT_TYPES as readonly string[]).includes(value ?? '');

export default async function NewStockMovementPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  // `?type=EXIT` abre directo una salida (lo usa "Prestar herramienta" desde Prestamos).
  const { type } = await searchParams;
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
      <NewMovementForm
        lookups={lookups}
        allowedTypes={allowedTypes}
        canDirectExit={canDirectExit}
        canRequest={canRequest}
        initialType={isMovementType(type) ? type : undefined}
      />
    </div>
  );
}
