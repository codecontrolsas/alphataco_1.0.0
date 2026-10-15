import EmpresaComponent from '@/features/Empresa/EmpresaComponent';
import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import { cookies } from 'next/headers';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value;
  if (companyName) {
    return {
      title: `Configuración | ${companyName}`,
      description: `Configuración de ${companyName}: organización, personal, flota, taller y tipos de documento`,
    };
  } else {
    const actualCompany = await getCompanyName();
    if (actualCompany) {
      return {
        title: `Configuración | ${actualCompany.company_name}`,
        description: `Configuración de ${actualCompany.company_name}: organización, personal, flota, taller y tipos de documento`,
      };
    }
  }
}

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <EmpresaComponent searchParams={resolvedSearchParams} />;
}
