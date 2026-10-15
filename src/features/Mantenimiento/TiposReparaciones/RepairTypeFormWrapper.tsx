import { StateBlock } from '@/shared/components/common/StateBlock';
import { RepairTypesView } from './RepairTypesView';
import { fetchRepairTypesForConfig } from './actions/actions';
import type { RepairTypeRow } from './repair-type-columns';

/** Tipos de reparación. La superficie (tarjeta) la pone quien monta la sección. */
async function RepairTypeFormWrapper() {
  const { types, forbidden, error } = await fetchRepairTypesForConfig();

  if (forbidden) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin permiso para ver los tipos de reparación"
        description="Pedile acceso a quien administre los permisos."
      />
    );
  }
  if (error) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar los tipos de reparación"
        description="Recargá la página; si persiste, avisá al equipo de soporte."
      />
    );
  }

  return <RepairTypesView types_of_repairs={types as RepairTypeRow[]} />;
}

export default RepairTypeFormWrapper;
