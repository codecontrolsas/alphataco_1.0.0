import WarehousesComponent from '@/features/Warehouses/WarehousesComponent';
import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import { cookies } from 'next/headers';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value ?? (await getCompanyName())?.company_name;
  if (companyName) {
    return { title: `Almacenes | ${companyName}`, description: `Inventario y depósitos de ${companyName}` };
  }
  return { title: 'Almacenes' };
}

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <WarehousesComponent searchParams={resolvedSearchParams} />;
}
