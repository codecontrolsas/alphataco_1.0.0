import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { CertificationPermissions } from '../lib/permissions';
import { CertificationsAttentionSection } from './CertificationsAttentionSection';
import _CertificationsDataTable from './_CertificationsDataTable';
import { getCertificationAttention, getCertificationsPaginated } from './actions.server';
import { CERTIFICATIONS_TABLE_ID } from './constants';

const logger = new Logger('Comercial/Certificaciones/list');

async function loadPermissions(): Promise<CertificationPermissions & { canView: boolean }> {
  const [canView, canCreate, canUpdate, canApprove, canDelete, canViewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'certificaciones', 'view'),
    checkPermissionServer('comercial', 'certificaciones', 'create'),
    checkPermissionServer('comercial', 'certificaciones', 'update'),
    checkPermissionServer('comercial', 'certificaciones', 'approve'),
    checkPermissionServer('comercial', 'certificaciones', 'delete'),
    checkPermissionServer('comercial', 'certificaciones', 'view_prices'),
  ]);
  return { canView, canCreate, canUpdate, canApprove, canDelete, canViewPrices };
}

export async function CertificationsList({ searchParams }: { searchParams: DataTableSearchParams }) {
  // Solo los params de esta tabla (quita el prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, CERTIFICATIONS_TABLE_ID);

  const { canView, ...permissions } = await loadPermissions();
  if (!canView) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver las certificaciones"
        description="Pedile acceso a un administrador."
      />
    );
  }

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getCertificationAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  try {
    // Facets lazy: no se cargan en SSR
    const [{ data, total }, preferences] = await Promise.all([
      getCertificationsPaginated(tableParams),
      getTablePreferences(CERTIFICATIONS_TABLE_ID),
    ]);

    return (
      // Sin Card propia: CertificacionesTabContent ya envuelve la tab en una Card (evita Card anidada).
      <_CertificationsDataTable
        data={data}
        totalRows={total}
        searchParams={tableParams}
        tableId={CERTIFICATIONS_TABLE_ID}
        permissions={permissions}
        topSlot={<CertificationsAttentionSection attention={attention} serverStatus={serverStatus} />}
        initialColumnVisibility={preferences.columnVisibility ?? {}}
        initialFilterVisibility={preferences.filterVisibility ?? {}}
      />
    );
  } catch (error) {
    logger.error('No se pudo armar el listado de certificaciones', { data: { error } });
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar las certificaciones"
        description="Actualizá la página para intentar de nuevo."
      />
    );
  }
}
