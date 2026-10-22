import { companyPageMetadata } from '@/app/_lib/company-metadata';
import OperacionesComponent from '@/features/Operaciones/OperacionesComponent';

export async function generateMetadata() {
  return companyPageMetadata('Operaciones', (name) => `Gestión de operaciones y partes diarios de ${name}`);
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <OperacionesComponent searchParams={resolvedSearchParams} />;
}
