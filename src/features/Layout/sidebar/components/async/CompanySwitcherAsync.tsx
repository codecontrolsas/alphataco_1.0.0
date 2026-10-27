import { fetchCurrentCompany, fetchUserCompanies } from '@/shared/actions/company.actions';
import { companyLimitLabel, getCompanyLimitStatus } from '@/shared/lib/instance-settings';
import { CompanySwitcher } from '../CompanySwitcher';

/**
 * Async Server Component — carga datos de empresas y renderiza el selector del header.
 * Se envuelve en Suspense desde `AppSidebar` para streaming independiente.
 */
export async function CompanySwitcherAsync() {
  const [currentCompany, { sharedCompanies, allCompanies }, companyLimit] = await Promise.all([
    fetchCurrentCompany(),
    fetchUserCompanies(),
    getCompanyLimitStatus(),
  ]);

  return (
    <CompanySwitcher
      sharedCompanies={sharedCompanies}
      allCompanies={allCompanies}
      currentCompany={currentCompany ?? []}
      canCreateCompany={!companyLimit.reached}
      companyLimitText={companyLimitLabel(companyLimit.max)}
    />
  );
}
