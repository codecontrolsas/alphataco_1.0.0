import { Skeleton } from '@/components/ui/skeleton';
import TiposDocumentosTabContent from '@/features/Documentacion/TiposDocumentos/TiposDocumentosTabContent';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import { Suspense } from 'react';
import EquipmentsTabContent from './Equipos/EquipmentsTabContent';
import GeneralTabContent from './General/GeneralTabContent';
import RrhhTabContent from './RRHH/RrhhTabContent';
import TallerSectionContent from './Taller/TallerSectionContent';

/**
 * Módulo Configuración (antes "Empresa").
 *
 * Concentra todo lo que se configura una vez y se usa en el resto del sistema. Tres de sus
 * secciones llegaron desde otros módulos, donde estaban mezcladas con el trabajo del día a día:
 *
 * - **Mantenimiento** junta cuatro pantallas que estaban en dos lugares distintos: talleres y
 *   sectores eran una subtab de General, y tipos de reparación y grupos eran la tab
 *   Configuración del módulo Mantenimiento. Configurar un taller y configurar las reparaciones
 *   que hace ese taller es lo mismo, así que van en una sola vista.
 * - **Documentos** (tipos de documento) era la tab Tipos de Documentos del módulo Documentación.
 * - **General** sumó los KPIs, que estaban en Dashboard > Estadísticas: definir qué se mide es
 *   configuración; el Dashboard sólo lo muestra.
 *
 * Los `tabId` de las tres viajaron sin cambiar, así que los permisos ya asignados siguen
 * valiendo (ver la migración del rename).
 */
export default async function EmpresaComponent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Obtener permisos (usará cache pre-cargado en layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="general"
      permissions={permissions}
      tabs={[
        {
          value: 'general',
          label: 'Organización',
          description: 'Datos de la empresa, fiscales, estructura (organigrama, sectores y centros de costo), usuarios e indicadores',
          moduleSlug: 'configuracion',
          tabSlug: 'general',
          content: <GeneralTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'rrhh',
          label: 'Personal',
          description: 'Tipos de diagrama y de novedad, convenios, contratos, puestos, aptitudes y artículos',
          moduleSlug: 'configuracion',
          tabSlug: 'rrhh',
          content: <RrhhTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'vehicles',
          label: 'Flota',
          description: 'Catálogos de equipos y vehículos',
          moduleSlug: 'configuracion',
          tabSlug: 'vehicles',
          content: <EquipmentsTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'mantenimiento',
          label: 'Taller',
          description: 'Talleres, sectores, tipos de reparación y grupos de mantenimiento',
          moduleSlug: 'configuracion',
          tabSlug: 'mantenimiento',
          content: <TallerSectionContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'documentos',
          label: 'Tipos de documento',
          description: 'Documentos que se exigen a empleados, equipos y empresa',
          moduleSlug: 'configuracion',
          tabSlug: 'documentos',
          content: (
            <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
              <TiposDocumentosTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
