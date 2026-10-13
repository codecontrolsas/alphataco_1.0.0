import { Suspense } from 'react';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

import { PreEmployeeList } from './components/PreEmployeeList/PreEmployeeList';
import { PreEmployeeTableSkeleton } from './components/PreEmployeeList/fallback/PreEmployeeTableSkeleton';

// ============================================================================
// TYPES
// ============================================================================

interface CandidatosTabContentProps {
  searchParams: DataTableSearchParams;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

/** El botón "Nuevo candidato" vive en la cabecera de la sección (`SeleccionComponent`). */
export default async function CandidatosTabContent({ searchParams }: CandidatosTabContentProps) {
  const canView = await checkPermissionServer('seleccion', 'candidatos', 'view');

  if (!canView) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No tenés permiso para ver esta información.</div>
    );
  }

  return (
    <Suspense fallback={<PreEmployeeTableSkeleton />}>
      <PreEmployeeList searchParams={searchParams} />
    </Suspense>
  );
}
