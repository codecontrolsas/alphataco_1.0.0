import { companyPageMetadata } from '@/app/_lib/company-metadata';
import EquiposComponent from '@/features/Equipos/EquiposComponent';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { redirect } from 'next/navigation';

export async function generateMetadata() {
  return companyPageMetadata(
    'Equipos',
    (name) => `Página de equipos de ${name} con información general, comercial, HR y equipos`
  );
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
