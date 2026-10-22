import { companyPageMetadata } from '@/app/_lib/company-metadata';
import AyudaComponent from '@/features/Ayuda/AyudaComponent';

export async function generateMetadata() {
  return (await companyPageMetadata('Ayuda', (name) => `Centro de ayuda de ${name}`)) ?? { title: 'Ayuda' };
}

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <AyudaComponent searchParams={resolvedSearchParams} />;
}
