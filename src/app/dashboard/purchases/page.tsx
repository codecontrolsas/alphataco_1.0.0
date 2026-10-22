import { companyPageMetadata } from '@/app/_lib/company-metadata';
import PurchasesComponent from '@/features/Purchases/PurchasesComponent';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('Compras', (name) => `Proveedores y solicitudes de compra de ${name}`)) ?? {
      title: 'Compras',
    }
  );
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <PurchasesComponent searchParams={resolvedSearchParams} />;
}
