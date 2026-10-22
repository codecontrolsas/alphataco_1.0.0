'use client';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { CatalogCreateButton, CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import MaintenanceGroupForm from './MaintenanceGroupForm';
import MaintenanceGroupsTable from './MaintenanceGroupsTable';
import { fetchMaintenanceGroupsActionType, fetchTypesOfRepairActionType } from './actions/maintenanceGroupActions';

type Group = fetchMaintenanceGroupsActionType['groups'][number];

interface MaintenanceGroupsClientProps {
  groups: fetchMaintenanceGroupsActionType['groups'];
  types: fetchTypesOfRepairActionType['types'];
}

/** Grupos de mantenimiento: tabla a ancho completo; alta y edición en un Sheet. */
export default function MaintenanceGroupsClient({ groups, types }: MaintenanceGroupsClientProps) {
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission('configuracion', 'maintenance_groups', 'create');
  const canUpdate = hasPermission('configuracion', 'maintenance_groups', 'update');

  const sheet = useCatalogSheet<Group>({ canCreate, canUpdate });

  return (
    <>
      <MaintenanceGroupsTable
        groups={groups}
        types={types}
        onEdit={sheet.openEdit}
        canEdit={canUpdate}
        toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo grupo" />}
      />
      <CatalogFormSheet
        sheet={sheet}
        getKey={(group) => group.id}
        title={{ create: 'Nuevo grupo de reparación', edit: 'Editar grupo de reparación' }}
        size="lg"
      >
        {({ item, close }) => <MaintenanceGroupForm group={item} types={types} onDone={close} />}
      </CatalogFormSheet>
    </>
  );
}
