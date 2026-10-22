import { companyPageMetadata } from '@/app/_lib/company-metadata';
import SeleccionComponent from '@/features/Seleccion/SeleccionComponent';

export async function generateMetadata() {
  return (
    (await companyPageMetadata('Selección', (name) => `Selección de personal de ${name}`)) ?? { title: 'Selección' }
  );
}

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <SeleccionComponent searchParams={resolvedSearchParams} />;
}
