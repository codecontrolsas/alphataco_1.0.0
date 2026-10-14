import { Card } from '@/components/ui/card';
import { fetchMaintenanceGroupsAction, fetchTypesOfRepairAction } from './actions/maintenanceGroupActions';
import MaintenanceGroupsClient from './MaintenanceGroupsClient';

export default async function MaintenanceGroupsWrapper() {
  const [{ groups }, { types }] = await Promise.all([fetchMaintenanceGroupsAction(), fetchTypesOfRepairAction()]);

  return (
    <Card className="p-6">
      <MaintenanceGroupsClient groups={groups} types={types} />
    </Card>
  );
}
