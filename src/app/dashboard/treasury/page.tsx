import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import TreasuryComponent from '@/features/Treasury/TreasuryComponent';
import { cookies } from 'next/headers';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value ?? (await getCompanyName())?.company_name;
  if (companyName) {
    return { title: `Tesorería | ${companyName}`, description: `Cuentas, cajas y movimientos de ${companyName}` };
  }
  return { title: 'Tesorería' };
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <TreasuryComponent searchParams={resolvedSearchParams} />;
}
