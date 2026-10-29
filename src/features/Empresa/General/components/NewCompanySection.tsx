import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { getIndustryTypes, hasAnyCompanyMembership } from '@/features/Empresa/General/actions/company.server';
import CompanyFormFields from '@/features/Empresa/General/components/CompanyFormFields';
import { CompanyLogoField } from '@/features/Empresa/General/components/CompanyLogoField';
import CreateCompanyButton from '@/features/Empresa/General/components/CreateCompanyButton';
import { getProvinces } from '@/shared/actions/countries.server';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import {
  companyLimitReachedText,
  getCompanyLimitStatus,
  isSingleCompanyInstance,
} from '@/shared/lib/instance-settings';
import { Building2, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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

  const [hasCompany, provinces, industryTypes, companyLimit] = await Promise.all([
    hasAnyCompanyMembership(),
    getProvinces(),
    getIndustryTypes(),
    getCompanyLimitStatus(),
  ]);

  // Instancia de una sola empresa que ya la tiene: el alta no existe (ni un cartel que hable de «otras empresas»).
  // Sin ninguna empresa todavía, el proxy manda acá para crear la primera y el formulario sí se muestra. Al usuario
  // sin acceso a la empresa (el proxy lo manda acá) solo se le dice que pida que lo inviten.
  const singleCompany = isSingleCompanyInstance(companyLimit);
  if (singleCompany && companyLimit.count >= 1) {
    if (hasCompany) notFound();
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeader title="Sin acceso a la empresa" />
        <SectionCard>
          <StateBlock
            variant="empty"
            icon={Building2}
            title="Tu usuario todavía no tiene acceso"
            description="Pedile a un administrador de la empresa que te invite desde Configuración › Usuarios y accesos."
          />
        </SectionCard>
      </section>
    );
  }

  // Límite de empresas de la instancia (ticket 807): sin lugar no se ofrece el formulario. El proxy manda acá
  // a quien no tiene empresa; si la instancia ya está completa, lo que necesita es que lo inviten.
  if (companyLimit.reached) {
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeader title="Registrar compañía" />
        <SectionCard>
          <StateBlock
            variant="empty"
            icon={Building2}
            title="No se pueden registrar más compañías"
            description={
              hasCompany
                ? `${companyLimitReachedText(companyLimit.max)}. Para sumar otra, contactá al administrador del sistema.`
                : `${companyLimitReachedText(companyLimit.max)}. Pedile a un administrador de la empresa que te invite desde Configuración › Usuarios y accesos.`
            }
            action={
              hasCompany ? (
                <Link href="/dashboard/configuration" className={buttonVariants({ variant: 'outline' })}>
                  Ir a Configuración
                </Link>
              ) : undefined
            }
          />
        </SectionCard>
      </section>
    );
  }

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

      <form className="flex flex-col gap-4" noValidate>
        <CompanyFormFields provinces={provinces} industryTypes={industryTypes} singleCompany={singleCompany} />
        <SectionCard title="Logo" description="Opcional. Se muestra en el menú, en los reportes y en los documentos">
          <CompanyLogoField />
        </SectionCard>
        <div className="flex justify-end">
          <CreateCompanyButton />
        </div>
      </form>
    </section>
  );
}
