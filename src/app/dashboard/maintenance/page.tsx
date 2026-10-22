import { companyPageMetadata } from '@/app/_lib/company-metadata';
import MantenimientoComponent from '@/features/Mantenimiento/MantenimientoComponent';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';

export async function generateMetadata() {
  return companyPageMetadata(
    'Mantenimiento',
    (name) => `Gestión de mantenimiento y solicitudes de reparación de ${name}`
  );
}

export default async function MantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const permissions = await getUserPermissionsMapServer();
  const resolvedSearchParams = await searchParams;

  return (
    <div>
      <MantenimientoComponent searchParams={resolvedSearchParams} permissions={permissions} />
    </div>
  );
}
