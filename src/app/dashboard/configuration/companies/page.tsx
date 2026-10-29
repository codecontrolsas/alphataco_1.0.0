import { AllCompaniesSection } from '@/features/Empresa/General/components/AllCompaniesSection';
import { getCompanyLimitStatus, isSingleCompanyInstance } from '@/shared/lib/instance-settings';
import { notFound } from 'next/navigation';

/** Listado de compañías: no existe en una instancia de una sola empresa. */
export default async function AllCompaniesPage() {
  if (isSingleCompanyInstance(await getCompanyLimitStatus())) notFound();
  return <AllCompaniesSection />;
}
