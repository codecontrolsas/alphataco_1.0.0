import { companyPageMetadata } from '@/app/_lib/company-metadata';
import HseComponent from '@/features/Hse/HseComponent';
import { requireModulePage } from '@/features/Modules/server/modules.server';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('HSE', (name) => `Documentos HSE y cumplimiento de ${name}`)) ?? {
      title: 'HSE',
    }
  );
}

export default async function HsePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulePage('hse');
  const resolvedSearchParams = await searchParams;
  return <HseComponent searchParams={resolvedSearchParams} />;
}
