import { companyPageMetadata } from '@/app/_lib/company-metadata';
import ComercialComponent from '@/features/Comercial/ComercialComponent';

export async function generateMetadata() {
  return companyPageMetadata(
    'Comercial',
    (name) => `Página de comercial de ${name} con clientes, áreas, equipos y contratos`
  );
}

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <ComercialComponent searchParams={resolvedSearchParams} />;
}
