import { Card, CardContent } from '@/components/ui/card';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';
import { DocumentAuditSection } from './components/audit/DocumentAuditSection';
import { MonthlyCyclesSection } from './components/cycles/MonthlyCyclesSection';
import { DocumentInboxClient } from './components/inbox/DocumentInboxClient';
import { CustomerMatrixSection } from './components/matrix/CustomerMatrixSection';
import { ExpiryCalendarSection, PendingDocumentsSection } from './components/pending/PendingSections';
import { AssignmentPlannerSection } from './components/planner/AssignmentPlannerSection';
import { CustomerMatrixSkeleton, PlannerSkeleton } from './fallback/CustomerComplianceSkeletons';

/** Listas de documentos de las que salen los pendientes y el calendario. */
const DOCUMENT_LISTS = [
  { moduleSlug: 'documentacion', tabSlug: 'docs-empleados-permanentes' },
  { moduleSlug: 'documentacion', tabSlug: 'docs-empleados-mensuales' },
  { moduleSlug: 'documentacion', tabSlug: 'docs-equipos-permanentes' },
  { moduleSlug: 'documentacion', tabSlug: 'docs-equipos-mensuales' },
] as const;

/** Quien ve la documentación de personal o de equipos ve esta sección (cada vista muestra solo lo que puede ver). */
const VISIBLE_WHEN_ANY = [
  { moduleSlug: 'documentacion', tabSlug: 'documentos-de-empleados' },
  { moduleSlug: 'documentacion', tabSlug: 'documentos-de-equipos' },
] as const;

/**
 * Cumplimiento por cliente: la documentación de cada persona y equipo evaluada contra lo que pide cada cliente
 * (matriz de hoy), el simulador de asignación para un período, la bandeja de pendientes y el calendario de vencimientos.
 */
export default async function CumplimientoClientesTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  const customerParam = typeof searchParams.cliente === 'string' ? searchParams.cliente : null;

  return (
    <ViewManagerServer<'documentacion'>
      paramName="subtab"
      searchParams={searchParams}
      defaultView="pendientes"
      permissions={permissions}
      ariaLabel="Cumplimiento por cliente"
      views={[
        {
          value: 'pendientes',
          label: 'Pendientes',
          description:
            'Lo que hay que resolver, de lo más urgente a lo menos: vencido, rechazado, falta cargar y por vencer. Cada uno con su acción al lado.',
          visibleWhenAny: [...DOCUMENT_LISTS],
          content: (
            <Suspense fallback={<CustomerMatrixSkeleton />}>
              <PendingDocumentsSection />
            </Suspense>
          ),
        },
        {
          value: 'calendario',
          label: 'Calendario de vencimientos',
          description: 'Qué documentos vencen cada día de los próximos 90 días. Tocá un día para ver cuáles.',
          visibleWhenAny: [...DOCUMENT_LISTS],
          content: (
            <Suspense fallback={<PlannerSkeleton />}>
              <ExpiryCalendarSection />
            </Suspense>
          ),
        },
        {
          value: 'matriz',
          label: 'Matriz por cliente',
          description:
            'Hoy, cada persona y equipo contra cada cliente al que está afectado: si cumple, qué vence pronto o qué le falta.',
          visibleWhenAny: [...VISIBLE_WHEN_ANY],
          content: (
            <Suspense fallback={<CustomerMatrixSkeleton />}>
              <CustomerMatrixSection initialCustomerId={customerParam} />
            </Suspense>
          ),
        },
        {
          value: 'simulador',
          label: 'Simular asignación',
          description:
            'Elegí un cliente, el período del trabajo y a quién querés llevar: te dice quién cumple todo el período, qué vence en el medio y con quién reemplazarlo. No modifica nada.',
          visibleWhenAny: [...VISIBLE_WHEN_ANY],
          content: (
            <Suspense fallback={<PlannerSkeleton />}>
              <AssignmentPlannerSection initialCustomerId={customerParam} />
            </Suspense>
          ),
        },
        {
          value: 'bandeja',
          label: 'Bandeja de entrada',
          description:
            'Carga masiva con IA y lo que suben estudios y consultoras por link externo: lo que no se pudo validar solo queda acá, con el motivo, para revisarlo.',
          visibleWhenAny: [
            { moduleSlug: 'documentacion', tabSlug: 'docs-empleados-permanentes' },
            { moduleSlug: 'documentacion', tabSlug: 'docs-equipos-permanentes' },
          ],
          content: (
            <Card>
              <CardContent>
                <DocumentInboxClient />
              </CardContent>
            </Card>
          ),
        },
        {
          value: 'ciclos',
          label: 'Ciclos mensuales',
          description:
            'F.931, aportes sindicales, planes de pago y recibos de cada mes: lo declarado, la boleta y el pago tienen que coincidir. Los rechazos de clientes quedan marcados hasta corregirlos.',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empresa-mensuales',
          content: <MonthlyCyclesSection />,
        },
        {
          value: 'auditoria',
          label: 'Auditoría',
          description:
            'Quién cargó, reemplazó, aprobó, rechazó o dio de baja cada documento, y cuándo. Incluye las cargas con IA y por link externo.',
          visibleWhenAny: [...VISIBLE_WHEN_ANY],
          content: (
            <Suspense fallback={<PlannerSkeleton />}>
              <DocumentAuditSection />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
