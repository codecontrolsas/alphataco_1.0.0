import { Button } from '@/components/ui/button';
import { getMaterialRequestDetail } from '@/features/Warehouses/actions/requests.server';
import { RequestDetail } from '@/features/Warehouses/Requests/components/RequestDetail';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getRequest = cache(getMaterialRequestDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const request = await getRequest((await params).id);
  return { title: request ? `${request.number} | Almacenes` : 'Pedido | Almacenes' };
}

export default async function MaterialRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const request = await getRequest((await params).id);
  if (!request) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/warehouse?tab=pedidos">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Pedidos
        </Link>
      </Button>
      <RequestDetail request={request} />
    </div>
  );
}
