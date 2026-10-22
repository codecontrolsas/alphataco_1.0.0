import { companyPageMetadata } from '@/app/_lib/company-metadata';
import TreasuryComponent from '@/features/Treasury/TreasuryComponent';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('Tesorería', (name) => `Cuentas, cajas y movimientos de ${name}`)) ?? {
      title: 'Tesorería',
    }
  );
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <TreasuryComponent searchParams={resolvedSearchParams} />;
}
