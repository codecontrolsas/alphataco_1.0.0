import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { FormsList } from './FormsList';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function FormulariosTabContent({ searchParams, permissionsMap }: Props) {
  // Las plantillas de checklist viven en tablas del módulo Checklists: sin él no hay nada que configurar.
  const canConfigure =
    permissionsMap['formularios:formularios:update'] === true && (await isModuleEnabled('checklists'));
  return <FormsList searchParams={searchParams} permissionsMap={permissionsMap} canConfigure={canConfigure} />;
}
