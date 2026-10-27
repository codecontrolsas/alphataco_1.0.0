import { Suspense } from 'react';

import { PermissionGuardServer } from '@/features/Permissions/components/PermissionGuardServer';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { type ViewDefinition } from '@/features/TabsManager/types';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

import { EmpresaList } from './EmpresaList/EmpresaList';
import { EquiposList } from './EquiposList/EquiposList';
import { PersonasList } from './PersonasList/PersonasList';
import { _CreateDocumentTypeButton } from './components/_CreateDocumentTypeButton';
import { TiposDocumentosSkeleton } from './fallback/TiposDocumentosSkeleton';

// ============================================
// TIPOS
// ============================================

interface TiposDocumentosTabContentProps {
  searchParams: DataTableSearchParams;
  showOnlyPersonas?: boolean;
  showOnlyEquipos?: boolean;
  showOnlyEmpresa?: boolean;
  permissions: Record<string, boolean>;
}

// ============================================
// COMPONENTE
// ============================================

export default async function TiposDocumentosTabContent({
  searchParams,
  showOnlyPersonas = false,
  showOnlyEquipos = false,
  showOnlyEmpresa = false,
  permissions,
}: TiposDocumentosTabContentProps) {
  const allTabs: ViewDefinition<'configuracion'>[] = [];

  if (!showOnlyEquipos && !showOnlyEmpresa) {
    allTabs.push({
      value: 'Personas',
      label: 'Personal',
      description: 'Tipos de documento que se exigen al personal',
      moduleSlug: 'configuracion' as const,
      tabSlug: 'tipos-docs-personas' as const,
      content: (
        <Suspense fallback={<TiposDocumentosSkeleton />}>
          <PersonasList searchParams={searchParams} permissionsMap={permissions} />
        </Suspense>
      ),
    });
  }

  if (!showOnlyPersonas && !showOnlyEmpresa) {
    allTabs.push({
      value: 'Equipos',
      label: 'Equipos',
      description: 'Tipos de documento que se exigen a los equipos',
      moduleSlug: 'configuracion' as const,
      tabSlug: 'tipos-docs-equipos' as const,
      content: (
        <Suspense fallback={<TiposDocumentosSkeleton />}>
          <EquiposList searchParams={searchParams} permissionsMap={permissions} />
        </Suspense>
      ),
    });
  }

  if (!showOnlyPersonas && !showOnlyEquipos) {
    allTabs.push({
      value: 'Empresa',
      label: 'Empresa',
      description: 'Tipos de documento de la empresa',
      moduleSlug: 'configuracion' as const,
      tabSlug: 'tipos-docs-empresa' as const,
      content: (
        <Suspense fallback={<TiposDocumentosSkeleton />}>
          <EmpresaList searchParams={searchParams} />
        </Suspense>
      ),
    });
  }

  const defaultTab = showOnlyPersonas
    ? 'Personas'
    : showOnlyEquipos
      ? 'Equipos'
      : showOnlyEmpresa
        ? 'Empresa'
        : 'Personas';

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView={defaultTab}
      preserveParams={['tab']}
      layout="tabs"
      ariaLabel="Tipos de documento"
      permissions={permissions}
      actions={
        <PermissionGuardServer module="configuracion" tab="documentos" action="create">
          <_CreateDocumentTypeButton />
        </PermissionGuardServer>
      }
      views={allTabs}
    />
  );
}
