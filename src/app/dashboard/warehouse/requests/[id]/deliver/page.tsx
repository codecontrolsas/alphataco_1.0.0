import { Button } from '@/components/ui/button';
import { getMovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { getMaterialRequestDetail } from '@/features/Warehouses/actions/requests.server';
import { DeliverRequestForm } from '@/features/Warehouses/Requests/components/DeliverRequestForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Entregar pedido | Almacenes' };

export default async function DeliverMaterialRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, lookups] = await Promise.all([getMaterialRequestDetail(id), getMovementFormLookups()]);
  // `can.deliver` ya combina el permiso `update` con el estado del pedido.
  if (!request || !request.can.deliver) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Volver al pedido">
          <Link href={`/dashboard/warehouse/requests/${request.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">
          Entregar <span className="font-mono">{request.number}</span>
        </h1>
      </div>
      {/* La key remonta el form cuando cambia lo pendiente: `useForm` toma los valores iniciales
          una sola vez y, al volver a esta pagina tras otra entrega, mostraria los anteriores. */}
      <DeliverRequestForm
        key={request.lines.map((l) => l.pending).join('|')}
        request={request}
        warehouses={lookups.warehouses}
      />
    </div>
  );
}
