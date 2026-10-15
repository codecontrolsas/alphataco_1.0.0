'use client';

import { Badge } from '@/components/ui/badge';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import type { ReactNode } from 'react';
import type {
  PendingTasksData,
  ReturnedOrdersData,
  ReturnedTasksData,
  ValidationOrdersData,
} from '../actions/actionsServer';
import { usePendingTasks, useReturnedOrders, useReturnedTasks, useValidationOrders } from '../hooks/useApprovalInbox';
import { ApprovalBlockStates } from './ApprovalBlockStates';
import { ApprovalCategoryMetrics } from './ApprovalCategoryMetrics';
import { AuthorizationList } from './AuthorizationList';
import { ReassignmentList } from './ReassignmentList';
import { ReturnedOrdersList } from './ReturnedOrdersList';
import { _ValidationOrdersDataTable } from './_ValidationOrdersDataTable';

interface ApprovalInboxClientProps {
  /** Los iniciales son `undefined` cuando falló su carga en el servidor: el cliente lo reintenta y muestra el error. */
  initialValidationOrders?: ValidationOrdersData;
  initialPendingTasks?: PendingTasksData;
  initialReturnedTasks?: ReturnedTasksData;
  initialReturnedOrders?: ReturnedOrdersData;
  sectors: Array<{ id: string; name: string }>;
}

function BlockTitle({ children, count }: { children: ReactNode; count: number | null }) {
  return (
    <span className="flex items-center gap-2">
      {children}
      {count !== null && count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
    </span>
  );
}

/**
 * Bandeja de Aprobaciones en una sola pantalla: cuatro categorías con su contador y un bloque por cada una.
 * Cada bloque tiene su propia carga, vacío y error, y un error de render en uno no tumba a los demás.
 */
export function ApprovalInboxClient({
  initialValidationOrders,
  initialPendingTasks,
  initialReturnedTasks,
  initialReturnedOrders,
  sectors,
}: ApprovalInboxClientProps) {
  const validation = useValidationOrders(initialValidationOrders);
  const pending = usePendingTasks(initialPendingTasks);
  const returned = useReturnedTasks(initialReturnedTasks);
  const returnedOrders = useReturnedOrders(initialReturnedOrders);

  // `undefined` = sin datos (cargando o con error): la métrica muestra "—" y no un 0 inventado.
  const pendingCount = pending.data?.length ?? null;
  const returnedCount = returned.data?.length ?? null;
  const validationCount = validation.data?.length ?? null;
  const returnedOrdersCount = returnedOrders.data?.length ?? null;

  return (
    <div className="space-y-4">
      <ApprovalCategoryMetrics
        authorizations={pendingCount}
        reassignments={returnedCount}
        validations={validationCount}
        returnedOrders={returnedOrdersCount}
      />

      <SectionErrorBoundary title="No se pudieron mostrar las autorizaciones">
        <SectionCard
          title={<BlockTitle count={pendingCount}>Autorizaciones</BlockTitle>}
          description="Tareas que un operario agregó y requieren aprobación antes de ejecutarse."
        >
          <ApprovalBlockStates
            subject="las autorizaciones"
            isLoading={pending.data === undefined && !pending.isError}
            isError={pending.data === undefined && pending.isError}
            onRetry={() => void pending.refetch()}
            isEmpty={pendingCount === 0}
            emptyTitle="No hay tareas para autorizar."
            emptyDescription="Aparecen cuando un operario agrega una tarea de un tipo de reparación que requiere autorización."
          >
            <AuthorizationList tasks={pending.data ?? []} />
          </ApprovalBlockStates>
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="No se pudieron mostrar las reasignaciones">
        <SectionCard
          title={<BlockTitle count={returnedCount}>Reasignaciones</BlockTitle>}
          description="Tareas que un sector devolvió porque no le corresponden: elegí el sector que las resuelve."
        >
          <ApprovalBlockStates
            subject="las reasignaciones"
            isLoading={returned.data === undefined && !returned.isError}
            isError={returned.data === undefined && returned.isError}
            onRetry={() => void returned.refetch()}
            isEmpty={returnedCount === 0}
            emptyTitle="No hay tareas devueltas para reasignar."
            emptyDescription="Aparecen cuando un operario devuelve una tarea al jefe de taller."
          >
            <ReassignmentList tasks={returned.data ?? []} sectors={sectors} />
          </ApprovalBlockStates>
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="No se pudo mostrar la validación de cierre">
        <SectionCard
          title={<BlockTitle count={validationCount}>Validación de cierre</BlockTitle>}
          description="Órdenes con todas sus OTs cerradas que esperan tu revisión."
        >
          <ApprovalBlockStates
            subject="las órdenes a validar"
            isLoading={validation.data === undefined && !validation.isError}
            isError={validation.data === undefined && validation.isError}
            onRetry={() => void validation.refetch()}
            isEmpty={validationCount === 0}
            emptyTitle="No hay órdenes pendientes de validación."
            emptyDescription="Aparecen cuando todas las OTs de una orden quedan cerradas."
          >
            <_ValidationOrdersDataTable validationOrders={validation.data ?? []} />
          </ApprovalBlockStates>
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="No se pudieron mostrar las órdenes devueltas">
        <SectionCard
          title={<BlockTitle count={returnedOrdersCount}>Órdenes devueltas</BlockTitle>}
          description="Órdenes que devolviste al taller y siguen abiertas. Es informativa: no suma al contador del paso."
        >
          <ApprovalBlockStates
            subject="las órdenes devueltas"
            isLoading={returnedOrders.data === undefined && !returnedOrders.isError}
            isError={returnedOrders.data === undefined && returnedOrders.isError}
            onRetry={() => void returnedOrders.refetch()}
            isEmpty={returnedOrdersCount === 0}
            emptyTitle="No hay órdenes devueltas al taller."
            emptyDescription="Aparecen cuando devolvés una orden al taller o rechazás sus ítems, hasta que el taller la vuelve a cerrar."
          >
            <ReturnedOrdersList orders={returnedOrders.data ?? []} />
          </ApprovalBlockStates>
        </SectionCard>
      </SectionErrorBoundary>
    </div>
  );
}
