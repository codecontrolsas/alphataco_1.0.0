'use client';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { usePermissions } from '@/features/Permissions';
import { VisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import MaintenanceGroupForm from './MaintenanceGroupForm';
import MaintenanceGroupsTable from './MaintenanceGroupsTable';
import { fetchMaintenanceGroupsActionType, fetchTypesOfRepairActionType } from './actions/maintenanceGroupActions';

interface MaintenanceGroupsClientProps {
  groups: fetchMaintenanceGroupsActionType['groups'];
  savedVisibility: VisibilityState;
  savedFilter: string[];
  types: fetchTypesOfRepairActionType['types'];
}

export default function MaintenanceGroupsClient({
  groups,
  savedVisibility,
  savedFilter,
  types,
}: MaintenanceGroupsClientProps) {
  const [selectedGroup, setSelectedGroup] = useState<fetchMaintenanceGroupsActionType['groups'][number] | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const { hasPermission } = usePermissions();

  // Verificar permisos
  const canCreate = hasPermission('equipos', 'maintenance_groups', 'create');
  const canUpdate = hasPermission('equipos', 'maintenance_groups', 'update');
  const canCreateOrUpdate = canCreate || canUpdate;

  return (
    <div>
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        {canCreateOrUpdate && (
          <>
            <ResizablePanel defaultSize={30}>
              <MaintenanceGroupForm group={selectedGroup} mode={mode} setMode={setMode} types={types} />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel defaultSize={canCreateOrUpdate ? 70 : 100}>
          <MaintenanceGroupsTable
            savedFilter={savedFilter}
            savedVisibility={savedVisibility}
            groups={groups}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            setMode={setMode}
            types={types}
            mode={mode}
            canEdit={canUpdate}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      {/* {error && <div className="text-red-500 mt-2">Error: {error}</div>} */}
    </div>
  );
}
