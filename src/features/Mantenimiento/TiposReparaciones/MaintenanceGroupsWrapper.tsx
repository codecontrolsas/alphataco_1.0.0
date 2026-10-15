import { StateBlock } from '@/shared/components/common/StateBlock';
import MaintenanceGroupsClient from './MaintenanceGroupsClient';
import { fetchMaintenanceGroupsAction, fetchTypesOfRepairAction } from './actions/maintenanceGroupActions';

/** Grupos de mantenimiento. La superficie (tarjeta) la pone quien monta la sección. */
export default async function MaintenanceGroupsWrapper() {
  const [groupsResult, typesResult] = await Promise.all([fetchMaintenanceGroupsAction(), fetchTypesOfRepairAction()]);

  if (groupsResult.forbidden || typesResult.forbidden) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin permiso para ver los grupos de mantenimiento"
        description="Pedile acceso a quien administre los permisos."
      />
    );
  }
  if (groupsResult.error || typesResult.error) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar los grupos de mantenimiento"
        description="Recargá la página; si persiste, avisá al equipo de soporte."
      />
    );
  }

  return <MaintenanceGroupsClient groups={groupsResult.groups} types={typesResult.types} />;
}
