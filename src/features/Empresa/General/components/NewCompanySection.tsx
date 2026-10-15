import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getIndustryTypes, hasAnyCompanyMembership } from '@/features/Empresa/General/actions/company.server';
import CompanyFormFields from '@/features/Empresa/General/components/CompanyFormFields';
import CreateCompanyButton from '@/features/Empresa/General/components/CreateCompanyButton';
import { getProvinces } from '@/shared/actions/countries.server';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Info } from 'lucide-react';
import { connection } from 'next/server';

/**
 * Alta de compañía. Todo lo que toca la base pasa por server actions de la feature: el cartel de
 * "todavía no tenés compañía" sale de `hasAnyCompanyMembership()` (profile de sesión, nunca un id
 * del cliente) y los catálogos de `getProvinces` / `getIndustryTypes`.
 *
 * `connection()` la marca como dinámica: con `cacheComponents` activo, el `Promise.all` arranca
 * los catálogos (consultas a Prisma) ANTES de que se resuelva la lectura de sesión, y el
 * prerender del build fallaba con "used `new Date()` before accessing Request data". La página
 * es de un usuario logueado: no tiene nada que prerenderizar.
 */
export default async function NewCompanySection() {
  await connection();

  const [hasCompany, provinces, industryTypes] = await Promise.all([
    hasAnyCompanyMembership(),
    getProvinces(),
    getIndustryTypes(),
  ]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Registrar compañía" description="Completá los datos de tu nueva compañía" />
      {!hasCompany && (
        <Alert variant={'info'}>
          <AlertTitle className="flex items-center gap-2">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            Parece que no tienes ninguna Compañía registrada.
          </AlertTitle>
          <AlertDescription>Para utilizar la aplicación debes registrar tu compañía</AlertDescription>
        </Alert>
      )}

      <form className="flex flex-col gap-4">
        <CompanyFormFields provinces={provinces} industryTypes={industryTypes} />
        <SectionCard title="Logo">
          <CreateCompanyButton />
        </SectionCard>
      </form>
    </section>
  );
}
