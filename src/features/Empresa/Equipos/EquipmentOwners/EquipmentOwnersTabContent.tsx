import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import EquipmentOwnerList from './EquipmentOwnerList';

// ============================================================================
// SERVER COMPONENT — entry point de la tab Titulares
// Mismo patrón que EquipmentTypeList: Server async → fetch data → Client DataTable
// ============================================================================

interface EquipmentOwnersTabContentProps {
  searchParams: DataTableSearchParams;
}

export default async function EquipmentOwnersTabContent({ searchParams }: EquipmentOwnersTabContentProps) {
  const permissionsMap = await getUserPermissionsMapServer();

  return <EquipmentOwnerList searchParams={searchParams} permissions={permissionsMap} />;
}
