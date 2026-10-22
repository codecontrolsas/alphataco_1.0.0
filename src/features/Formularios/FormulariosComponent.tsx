import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { FileText } from 'lucide-react';
import { Suspense } from 'react';
import FormulariosTabContent from './Formularios/FormulariosTabContent';
import { FormsTableSkeleton } from './Formularios/fallback/FormsTableSkeleton';

export default async function FormulariosComponent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Obtener permisos (usará cache pre-cargado en layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <div>
      <SectionManagerServer
        paramName="tab"
        searchParams={searchParams}
        defaultTab="formularios"
        permissions={permissions}
        tabs={[
          {
            value: 'formularios',
            label: (
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Formularios
              </span>
            ),
            moduleSlug: 'formularios',
            tabSlug: 'formularios',
            content: (
              <Suspense fallback={<FormsTableSkeleton />}>
                <FormulariosTabContent
                  searchParams={searchParams as DataTableSearchParams}
                  permissionsMap={permissions}
                />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  );
}
