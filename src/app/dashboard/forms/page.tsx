import { companyPageMetadata } from '@/app/_lib/company-metadata';
import FormulariosComponent from '@/features/Formularios/FormulariosComponent';

export async function generateMetadata() {
  return companyPageMetadata('Formularios', (name) => `Gestión de formularios y checklists de ${name}`);
}

export default async function FormulariosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <FormulariosComponent searchParams={resolvedSearchParams} />;
}
