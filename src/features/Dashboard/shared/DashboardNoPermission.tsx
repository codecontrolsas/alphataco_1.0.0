import { StateBlock } from '@/shared/components/common/StateBlock';

/** Bloque que reemplaza una sección del Dashboard cuando el usuario no tiene `view`. */
export function DashboardNoPermission() {
  return (
    <StateBlock
      variant="noperm"
      title="No tenés permiso para ver esta información"
      description="Pedile a un administrador que te habilite el acceso a esta sección del Dashboard."
    />
  );
}
