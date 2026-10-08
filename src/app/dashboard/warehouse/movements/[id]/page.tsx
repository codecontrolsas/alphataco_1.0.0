import { Button } from '@/components/ui/button';
import { getStockMovementDetail } from '@/features/Warehouses/actions/movements.server';
import { MovementDetail } from '@/features/Warehouses/Movements/components/MovementDetail';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getMovement = cache(getStockMovementDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const movement = await getMovement((await params).id);
  return { title: movement ? `${movement.number} | Almacenes` : 'Movimiento | Almacenes' };
}

export default async function StockMovementPage({ params }: { params: Promise<{ id: string }> }) {
  const movement = await getMovement((await params).id);
  if (!movement) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/warehouse?tab=movimientos">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Movimientos
        </Link>
      </Button>
      <MovementDetail movement={movement} />
    </div>
  );
}
