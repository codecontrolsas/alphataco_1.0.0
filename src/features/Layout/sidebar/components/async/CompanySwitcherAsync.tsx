import { fetchCurrentCompany, fetchUserCompanies } from '@/shared/actions/company.actions';
import { companyLimitLabel, getCompanyLimitStatus, isSingleCompanyInstance } from '@/shared/lib/instance-settings';
import { CompanyIdentity } from '../CompanyIdentity';
import { CompanySwitcher } from '../CompanySwitcher';

/**
 * Async Server Component — carga datos de empresas y renderiza el selector del header.
 * Se envuelve en Suspense desde `AppSidebar` para streaming independiente.
 *
 * Límite de empresas de la instancia (`max_companies`):
 * - 1: instancia de una sola empresa. Solo la identidad de la empresa, sin selector, sin alta ni texto del plan.
 * - N > 1: selector si el usuario tiene más de una empresa o si todavía se puede crear otra (el botón «Agregar
 *   compañía» vive en el desplegable y desaparece al llegar a N). Con una sola empresa y sin lugar, solo la identidad.
 */
export async function CompanySwitcherAsync() {
  const [currentCompany, { sharedCompanies, allCompanies }, companyLimit] = await Promise.all([
    fetchCurrentCompany(),
    fetchUserCompanies(),
    getCompanyLimitStatus(),
  ]);

  const userCompanies = sharedCompanies.length + allCompanies.length;
  const canCreateCompany = !companyLimit.reached;
  const active = currentCompany?.[0] ?? allCompanies[0] ?? sharedCompanies[0] ?? null;

  if (isSingleCompanyInstance(companyLimit) || (userCompanies <= 1 && !canCreateCompany)) {
    return <CompanyIdentity name={active?.company_name ?? null} logo={active?.company_logo ?? null} />;
  }

  return (
    <CompanySwitcher
      sharedCompanies={sharedCompanies}
      allCompanies={allCompanies}
      currentCompany={currentCompany ?? []}
      canCreateCompany={canCreateCompany}
      companyLimitText={companyLimitLabel(companyLimit.max)}
    />
  );
}
