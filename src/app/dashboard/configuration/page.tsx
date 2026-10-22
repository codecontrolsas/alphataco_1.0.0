import { companyPageMetadata } from '@/app/_lib/company-metadata';
import EmpresaComponent from '@/features/Empresa/EmpresaComponent';

export async function generateMetadata() {
  return companyPageMetadata(
    'Configuración',
    (name) => `Configuración de ${name}: organización, personal, flota, taller y tipos de documento`
  );
}

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <EmpresaComponent searchParams={resolvedSearchParams} />;
}
