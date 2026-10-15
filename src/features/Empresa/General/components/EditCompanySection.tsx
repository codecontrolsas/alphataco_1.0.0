import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getCompanyForEdit,
  getIndustryTypes,
  hasAnyCompanyMembership,
} from '@/features/Empresa/General/actions/company.server';
import CompanyFormFields from '@/features/Empresa/General/components/CompanyFormFields';
import EditCompanyButton from '@/features/Empresa/General/components/EditCompanyButton';
import { getProvinces } from '@/shared/actions/countries.server';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Info } from 'lucide-react';

interface EditCompanySectionProps {
  /** Empresa a editar: llega por la ruta, o sea del caller. `getCompanyForEdit` valida el acceso. */
  companyId: string;
}

/**
 * Edición de compañía.
 *
 * El `companyId` viene de la URL (`/dashboard/configuration/companies/[id]`): sin RLS, la validación de perímetro
 * es responsabilidad de `getCompanyForEdit`, que exige pertenencia + owner o permiso
 * `empresa.general.update` — el mismo criterio que `updateCompany`. Si no hay acceso no se
 * renderiza el formulario (antes la página traía la empresa filtrando por `owner_id` y, cuando no
 * coincidía, mostraba igual un formulario vacío contra ese id).
 */
export default async function EditCompanySection({ companyId }: EditCompanySectionProps) {
  const [company, hasCompany, provinces, industryTypes] = await Promise.all([
    getCompanyForEdit(companyId),
    hasAnyCompanyMembership(),
    getProvinces(),
    getIndustryTypes(),
  ]);

  if (!company) {
    return (
      <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para editar esta compañía." />
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Editar compañía" description="Editá los datos que desees modificar" />
      {!hasCompany && (
        <Alert variant={'info'}>
          <AlertTitle className="flex items-center gap-2">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            Editar Compañía registrada.
          </AlertTitle>
          <AlertDescription>Aquí podras editar tu compañía</AlertDescription>
        </Alert>
      )}

      <form className="flex flex-col gap-4">
        <CompanyFormFields provinces={provinces} industryTypes={industryTypes} company={company} />
        <SectionCard title="Logo">
          <EditCompanyButton companyId={company.id} />
        </SectionCard>
      </form>
    </section>
  );
}
