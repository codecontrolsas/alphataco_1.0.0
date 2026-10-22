import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { CreateExternalAccessModal } from './components/CreateExternalAccessModal';
import { ExternalApiClientsList } from './list/ExternalApiClientsList';

/**
 * Tab "Accesos Externos" (ticket 671).
 *
 * Lista las credenciales que usan los sistemas externos para consultar la API
 * de solo lectura, y permite crear una nueva.
 */
export async function AccesosExternosTabContent({
  searchParams,
  permissionsMap,
}: {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}) {
  const canCreate = await checkPermissionServer('configuracion', 'accesos-externos', 'create');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Accesos externos</h2>
          <p className="text-sm text-muted-foreground">
            Credenciales que le permiten a un sistema de terceros consultar información de tu empresa. El acceso es
            de solo lectura: no pueden modificar nada.
          </p>
        </div>
        {canCreate && <CreateExternalAccessModal />}
      </div>

      <ExternalApiClientsList searchParams={searchParams} permissionsMap={permissionsMap} />
    </div>
  );
}
