import { companyPageMetadata } from '@/app/_lib/company-metadata';
import WarehousesComponent from '@/features/Warehouses/WarehousesComponent';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('Almacenes', (name) => `Inventario y depósitos de ${name}`)) ?? { title: 'Almacenes' }
  );
}

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <WarehousesComponent searchParams={resolvedSearchParams} />;
}
