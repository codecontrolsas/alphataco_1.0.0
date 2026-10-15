import { getPurchaseRequestDetail } from '@/features/Purchases/actions/request-queries.server';
import { EditPurchaseRequestPage } from '@/features/Purchases/Requests/PurchaseRequestFormPage';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Editar solicitud | Compras' };

export default async function EditPurchaseRequestRoute({ params }: { params: Promise<{ id: string }> }) {
  const request = await getPurchaseRequestDetail((await params).id);
  if (!request || !request.can.edit) notFound();
  return <EditPurchaseRequestPage request={request} />;
}
