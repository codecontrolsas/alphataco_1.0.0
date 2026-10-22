import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { NewPurchaseRequestPage } from '@/features/Purchases/Requests/PurchaseRequestFormPage';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nueva solicitud | Compras' };

export default async function NewPurchaseRequestRoute({
  searchParams,
}: {
  searchParams: Promise<{ fromMaterialRequest?: string }>;
}) {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) notFound();
  const { fromMaterialRequest } = await searchParams;
  return <NewPurchaseRequestPage fromMaterialRequest={fromMaterialRequest} />;
}
