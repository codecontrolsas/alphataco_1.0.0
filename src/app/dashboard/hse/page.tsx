import { companyPageMetadata } from '@/app/_lib/company-metadata';
import HseComponent from '@/features/Hse/HseComponent';
import { assertHseEnabled } from '@/features/Hse/lib/feature-gate';

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
  await assertHseEnabled();
  const resolvedSearchParams = await searchParams;
  return <HseComponent searchParams={resolvedSearchParams} />;
}
