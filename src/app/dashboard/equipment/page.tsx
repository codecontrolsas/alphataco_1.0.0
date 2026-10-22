import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import EquiposComponent from '@/features/Equipos/EquiposComponent';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value;
  if (companyName) {
    return {
      title: `Equipos | ${companyName}`,
      description: `Página de equipos de ${companyName} con información general, comercial, HR y equipos`,
    };
  } else {
    const actualCompany = await getCompanyName();
    if (actualCompany) {
      return {
        title: `Equipos | ${actualCompany.company_name}`,
        description: `Página de equipos de ${actualCompany.company_name} con información general, comercial, HR y equipos`,
      };
    }
  }
}

export default async function Equipment({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;

  // Las URLs de antes (`?tab=equipos&subtab=others`) quedaron en favoritos y links compartidos.
  // Sin esto caerian en silencio a la primera seccion en vez de a la que apuntaban.
  if (resolvedSearchParams.tab === 'equipos') {
    const { tab: _tab, subtab, ...rest } = resolvedSearchParams;
    const params = new URLSearchParams({ tab: typeof subtab === 'string' ? subtab : 'vehicles' });
    for (const [key, value] of Object.entries(rest)) {
      if (typeof value === 'string') params.set(key, value);
    }
    redirect(`/dashboard/equipment?${params.toString()}`);
  }

  // Obtener permisos en el servidor (sin caché, datos frescos en cada petición)
  const permissions = await getUserPermissionsMapServer();

  return <EquiposComponent searchParams={resolvedSearchParams} permissions={permissions} />;
}
