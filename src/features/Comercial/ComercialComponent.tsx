import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import { Store } from 'lucide-react';
import ComerceTabContent from './Comerce/ComerceTabContent';

export default async function ComercialComponent({
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
        defaultTab="comerce"
        permissions={permissions}
        tabs={[
          {
            value: 'comerce',
            label: (
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                Comercial
              </span>
            ),
            moduleSlug: 'comercial',
            tabSlug: 'comerce',
            // Las secciones traen su propio título; sin esto se repetiría un h1 "Comercial".
            hideTitle: true,
            content: <ComerceTabContent searchParams={searchParams} permissions={permissions} />,
          },
        ]}
      />
    </div>
  );
}
