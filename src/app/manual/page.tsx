import { companyPageMetadata } from '@/app/_lib/company-metadata';
import { ManualPage } from '@/features/Ayuda/Manual/ManualPage';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('Manual de uso', (name) => `Manual de uso del sistema de ${name}`)) ?? {
      title: 'Manual de uso',
    }
  );
}

export default async function ManualRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ManualPage searchParams={await searchParams} />;
}
