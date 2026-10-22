import { companyPageMetadata } from '@/app/_lib/company-metadata';
import DashboardComponent from '@/features/Dashboard/DashboardComponent';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <DashboardComponent searchParams={resolvedSearchParams} />;
}

// Generate metadata for the page
export async function generateMetadata() {
  return companyPageMetadata('Dashboard', (name) => `Dashboard principal de ${name} con métricas y estadísticas clave`);
}
