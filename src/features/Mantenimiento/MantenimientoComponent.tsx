import { EquiposConDesviosTabContent } from '@/features/Mantenimiento/EquiposConDesvios';
import { EquipmentsWithDeviationsSkeleton } from '@/features/Mantenimiento/EquiposConDesvios/fallback';
import GomeriaTabContent from '@/features/Mantenimiento/Gomeria/GomeriaTabContent';
import { NuevoPedidoSkeleton, NuevoPedidoTabContent } from '@/features/Mantenimiento/NuevoPedido';
import { WorkshopSectorsSkeleton, WorkshopViewTabContent } from '@/features/Mantenimiento/WorkshopView';
import { SectionManagerServer } from '@/features/TabsManager';
import { AlertTriangle, Building2, CircleDot, ClipboardList, Plus, Warehouse } from 'lucide-react';
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
 * - Supervisión: pipeline visual con 4 pasos (Validar → Aprobar Fecha → Para Taller → Seguimiento)
 * - Taller: pipeline visual con 4 pasos (Por Programar → Confirmados → En Taller → Aprobaciones)
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
        // TAB: SUPERVISIÓN (Pipeline visual; mismo rótulo que el sidebar y el mapa de permisos)
        // ============================================
        {
          value: 'maint_operaciones',
          label: (
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Supervisión
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'maint_operaciones',
          content: (
            <Suspense fallback={<OperacionesPipelineSkeleton />}>
              <OperacionesPipelineContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        // ============================================
        // TAB: VISTA TALLER (acordeones por sector — COD-394)
        // ============================================
        {
          value: 'workshop_view',
          label: (
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Vista Taller
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'workshop_view',
          content: (
            <Suspense fallback={<WorkshopSectorsSkeleton />}>
              <WorkshopViewTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        // ============================================
        // TAB: TALLER (Pipeline visual)
        // ============================================
        {
          value: 'maint_taller',
          label: (
            <span className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Taller
            </span>
          ),
          moduleSlug: 'mantenimiento',
          tabSlug: 'maint_taller',
          content: (
            <Suspense fallback={<TallerPipelineSkeleton />}>
              <TallerPipelineContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
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
