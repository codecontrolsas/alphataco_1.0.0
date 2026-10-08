import { Button } from '@/components/ui/button';
import { checkPermissionServer } from '@/features/Permissions';
import { getMovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { NewRequestForm } from '@/features/Warehouses/Requests/components/NewRequestForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nuevo pedido | Almacenes' };

export default async function NewMaterialRequestPage() {
  const [canCreate, canViewPrices] = await Promise.all([
    checkPermissionServer('almacenes', 'pedidos', 'create'),
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
  ]);
  if (!canCreate) notFound();
  const lookups = await getMovementFormLookups();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Volver a pedidos">
          <Link href="/dashboard/warehouse?tab=pedidos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Nuevo pedido de materiales</h1>
      </div>
      <NewRequestForm customers={lookups.customers} canViewPrices={canViewPrices} />
    </div>
  );
}
