import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';

import CumplimientoClientesTabContent from './CumplimientoClientes/CumplimientoClientesTabContent';
import DocumentosEmpleadosTabContent from './DocumentosEmpleados/DocumentosEmpleadosTabContent';
import DocumentosEmpresaTabContent from './DocumentosEmpresa/DocumentosEmpresaTabContent';
import DocumentosEquiposTabContent from './DocumentosEquipos/DocumentosEquiposTabContent';

/**
 * Documentación: secciones (sidebar → `?tab=`) — personal, equipos y empresa, cada una con sus vistas
 * Permanentes / Mensuales (`?subtab=`), y Cumplimiento por cliente (matriz y simulador). Los valores de URL son los de siempre (mails de
 * vencimientos, Dashboard, fichas y manual); los `aliases` de cada vista cubren los nombres cortos.
 * Los tipos de documento se administran en Configuración.
 */
export default async function DocumentacionComponent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="documentos-de-empleados"
      permissions={permissions}
      tabs={[
        {
          value: 'documentos-de-empleados',
          label: 'De personal',
          description: 'Documentación de cada persona de la empresa, con su estado y vencimiento.',
          moduleSlug: 'documentacion',
          tabSlug: 'documentos-de-empleados',
          content: <DocumentosEmpleadosTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'documentos-de-equipos',
          label: 'De equipos',
          description: 'Documentación de vehículos y equipamiento, con su estado y vencimiento.',
          moduleSlug: 'documentacion',
          tabSlug: 'documentos-de-equipos',
          content: <DocumentosEquiposTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'documentos-de-empresa',
          label: 'De la empresa',
          description: 'Documentación propia de la empresa, con su estado y vencimiento.',
          moduleSlug: 'documentacion',
          tabSlug: 'documentos-de-empresa',
          content: <DocumentosEmpresaTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'cumplimiento-por-cliente',
          label: 'Cumplimiento',
          description:
            'Pendientes por urgencia, calendario de vencimientos y si cada persona y equipo cumple lo que pide cada cliente.',
          visibleWhenAny: [
            { moduleSlug: 'documentacion', tabSlug: 'documentos-de-empleados' },
            { moduleSlug: 'documentacion', tabSlug: 'documentos-de-equipos' },
            { moduleSlug: 'documentacion', tabSlug: 'documentos-de-empresa' },
          ],
          content: <CumplimientoClientesTabContent searchParams={searchParams} permissions={permissions} />,
        },
      ]}
    />
  );
}
