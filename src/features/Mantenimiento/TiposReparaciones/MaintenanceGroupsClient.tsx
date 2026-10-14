'use client';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { usePermissions } from '@/features/Permissions';
import { useState } from 'react';
import MaintenanceGroupForm from './MaintenanceGroupForm';
import MaintenanceGroupsTable from './MaintenanceGroupsTable';
import { fetchMaintenanceGroupsActionType, fetchTypesOfRepairActionType } from './actions/maintenanceGroupActions';

interface MaintenanceGroupsClientProps {
  groups: fetchMaintenanceGroupsActionType['groups'];
  types: fetchTypesOfRepairActionType['types'];
}

export default function MaintenanceGroupsClient({ groups, types }: MaintenanceGroupsClientProps) {
  const [selectedGroup, setSelectedGroup] = useState<fetchMaintenanceGroupsActionType['groups'][number] | null>(null);
  const { hasPermission } = usePermissions();

  // Verificar permisos
  const canCreate = hasPermission('configuracion', 'maintenance_groups', 'create');
  const canUpdate = hasPermission('configuracion', 'maintenance_groups', 'update');
  const canCreateOrUpdate = canCreate || canUpdate;

  return (
    <div>
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        {canCreateOrUpdate && (
          <>
            <ResizablePanel defaultSize={30}>
              <MaintenanceGroupForm group={selectedGroup} types={types} onDone={() => setSelectedGroup(null)} />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel defaultSize={canCreateOrUpdate ? 70 : 100}>
          <MaintenanceGroupsTable groups={groups} types={types} onEdit={setSelectedGroup} canEdit={canUpdate} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
