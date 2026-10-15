import MensureUnitsList from '@/features/Empresa/Clientes/components/meansure_units/MensureUnitsList';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

interface MensureUnitsWrapperProps {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}

/** Pestaña "Unidades de Medida": la tabla trae su propia superficie (no hay Card padre). */
export default function MensureUnitsWrapper({ searchParams, permissions }: MensureUnitsWrapperProps) {
  return <MensureUnitsList searchParams={searchParams} permissions={permissions} />;
}
