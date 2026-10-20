import { Skeleton } from '@/components/ui/skeleton';
import SectoresTab from '@/features/Empresa/General/components/mantenimiento/SectoresTab';
import { EquiposConDesviosTabContent } from '@/features/Mantenimiento/EquiposConDesvios';
import { EquipmentsWithDeviationsSkeleton } from '@/features/Mantenimiento/EquiposConDesvios/fallback';
import GomeriaTabContent from '@/features/Mantenimiento/Gomeria/GomeriaTabContent';
import { NuevoPedidoSkeleton, NuevoPedidoTabContent } from '@/features/Mantenimiento/NuevoPedido';
import { WorkshopSectorsSkeleton, WorkshopViewTabContent } from '@/features/Mantenimiento/WorkshopView';
import { SectionManagerServer, ViewManagerServer } from '@/features/TabsManager';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { AlertTriangle, Building2, CircleDot, ClipboardList, Plus } from 'lucide-react';
import { Suspense } from 'react';
import { GomeriaSkeleton } from './Gomeria/fallback/GomeriaSkeleton';
import { OperacionesPipelineContent } from './Pipeline/OperacionesPipeline/OperacionesPipelineContent';
import { OperacionesPipelineSkeleton } from './Pipeline/OperacionesPipeline/fallback/OperacionesPipelineSkeleton';
import { TallerPipelineContent } from './Pipeline/TallerPipeline/TallerPipelineContent';
import { TallerPipelineSkeleton } from './Pipeline/TallerPipeline/fallback/TallerPipelineSkeleton';

interface MantenimientoComponentProps {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}

/**
 * Componente principal del módulo Mantenimiento.
 *
 * Estructura de tabs raíz:
 * - Gestión: selector de vista Supervisión (Por validar | Seguimiento) / Taller (Programación pendiente |
 *   Para ingreso | En mantenimiento | Aprobaciones), según permisos
 * - Sectores: tablero por sector y administración de los sectores del taller
 * - Nuevo Pedido: formulario de nuevo pedido de mantenimiento
 * - Equipos con Desvíos: tabla de equipos con desvíos pendientes
 * - Configuración: tipos de reparación y grupos
 */
export default async function MantenimientoComponent({ searchParams, permissions }: MantenimientoComponentProps) {
  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="maint_operaciones"
      permissions={permissions}
      tabs={[
        // ============================================
        // TAB: GESTIÓN (Supervisión + Taller, cada una con sus pestañas; el selector de vista muestra
        // solo las que el usuario puede ver). Mismo `tabSlug` que Supervisión: el permiso no cambia.
        // ============================================
        {
          value: 'maint_operaciones',
          aliases: ['maint_taller'],
          label: (
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Gestión
            </span>
          ),
          moduleSlug: 'mantenimiento',
          visibleWhenAny: [
            { moduleSlug: 'mantenimiento', tabSlug: 'maint_operaciones' },
            { moduleSlug: 'mantenimiento', tabSlug: 'maint_taller' },
          ],
          content: (
            <ViewManagerServer
              paramName="vista"
              searchParams={searchParams}
              // Un enlace viejo `?tab=maint_taller` abre la vista de Taller.
              defaultView={searchParams.tab === 'maint_taller' ? 'taller' : 'supervision'}
              permissions={permissions}
              layout="menu"
              ariaLabel="Vista de gestión"
              views={[
                {
                  value: 'supervision',
                  label: 'Supervisión',
                  description: 'Solicitudes por validar y seguimiento de equipos',
                  moduleSlug: 'mantenimiento',
                  tabSlug: 'maint_operaciones',
                  content: (
                    <Suspense fallback={<OperacionesPipelineSkeleton />}>
                      <OperacionesPipelineContent searchParams={searchParams} permissions={permissions} />
                    </Suspense>
                  ),
                },
                {
                  value: 'taller',
                  label: 'Taller',
                  description: 'Programación, ingreso, mantenimiento y aprobaciones',
                  moduleSlug: 'mantenimiento',
                  tabSlug: 'maint_taller',
                  content: (
                    <Suspense fallback={<TallerPipelineSkeleton />}>
                      <TallerPipelineContent searchParams={searchParams} permissions={permissions} />
                    </Suspense>
                  ),
                },
              ]}
            />
          ),
        },
        // ============================================
        // TAB: SECTORES (tablero por sector + alta y edición de los sectores del taller)
        // ============================================
        {
          value: 'workshop_view',
          label: (
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Sectores
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'workshop_view',
          content: (
            <ViewManagerServer
              paramName="vista"
              searchParams={searchParams}
              defaultView="tablero"
              permissions={permissions}
              layout="menu"
              ariaLabel="Vista de sectores"
              views={[
                {
                  value: 'tablero',
                  label: 'Tablero',
                  description: 'Carga de trabajo y órdenes de cada sector',
                  content: (
                    <Suspense fallback={<WorkshopSectorsSkeleton />}>
                      <WorkshopViewTabContent searchParams={searchParams} />
                    </Suspense>
                  ),
                },
                {
                  value: 'administrar',
                  label: 'Administrar sectores',
                  description: 'Alta, edición y baja de los sectores de taller',
                  moduleSlug: 'configuracion',
                  tabSlug: 'sectores_taller',
                  content: (
                    <CatalogTableSurface id="sectores-taller" title="Sectores de taller">
                      <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
                        <SectoresTab />
                      </Suspense>
                    </CatalogTableSurface>
                  ),
                },
              ]}
            />
          ),
        },
        // ============================================
        // TAB: NUEVO PEDIDO (movido desde subtab de Operaciones)
        // ============================================
        {
          value: 'nuevo_pedido',
          label: (
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Pedido
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'nuevo_pedido',
          content: (
            <Suspense fallback={<NuevoPedidoSkeleton />}>
              <NuevoPedidoTabContent />
            </Suspense>
          ),
        },
        // ============================================
        // TAB: EQUIPOS CON DESVÍOS (movido desde subtab de Operaciones)
        // ============================================
        {
          value: 'equipments_with_deviations',
          label: (
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Equipos con Desvíos
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'equipments_with_deviations',
          content: (
            <Suspense fallback={<EquipmentsWithDeviationsSkeleton />}>
              <EquiposConDesviosTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        // ============================================
        // TAB: GOMERÍA
        // ============================================
        {
          value: 'gomeria',
          label: (
            <span className="flex items-center gap-2">
              <CircleDot className="h-4 w-4" /> Gomería
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'gomeria',
          content: (
            <Suspense fallback={<GomeriaSkeleton />}>
              <GomeriaTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        // ============================================
        // TAB: CONFIGURACIÓN
        // ============================================
      ]}
    />
  );
}
