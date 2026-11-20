'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { getInbox } from '../actions/inbox.server';
import type { InboxData, InboxSection } from '../lib/types';
import { InboxItemRow } from './InboxItemRow';

// Paneles pesados: se bajan recién cuando alguien abre una orden o un historial.
const OrderDetailDialog = dynamic(
  () => import('@/features/Mantenimiento/MaintenanceOrders/components/OrderDetailDialog').then((m) => m.OrderDetailDialog),
  { ssr: false }
);
const ActivityHistoryModal = dynamic(
  () => import('@/features/Mantenimiento/components/ActivityHistoryModal').then((m) => m.ActivityHistoryModal),
  { ssr: false }
);

export const INBOX_QUERY_KEY = ['maintenance', 'inbox'] as const;

interface InboxListProps {
  initialData: InboxData;
  /** `?type=`: categoría (o módulo) que se está viendo completa. */
  type?: string;
  /** El usuario ve algún paso de Taller: solo entonces el vacío ofrece el enlace a Gestión → Taller. */
  canSeeTaller: boolean;
}

function SectionBody({ section, onRetry, children }: { section: InboxSection; onRetry: () => void; children: React.ReactNode }) {
  if (section.error) {
    return (
      <StateBlock
        variant="error"
        title={`No se pudo cargar «${section.label}»`}
        description="Es un problema de conexión o de permisos, no significa que no haya nada pendiente. Probá de nuevo."
        action={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    );
  }
  if (section.items.length === 0) {
    return <StateBlock variant="empty" title={section.emptyTitle} description={section.emptyDescription} />;
  }
  return <>{children}</>;
}

/** Mi bandeja: un bloque por categoría, con carga, vacío y error propios. React Query refresca con los datos del servidor como inicio. */
export function InboxList({ initialData, type, canSeeTaller }: InboxListProps) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: [...INBOX_QUERY_KEY, type ?? 'all'],
    queryFn: () => getInbox(type),
    initialData,
    // Los datos del servidor llegan frescos: no se pide de nuevo al montar. Las acciones la invalidan.
    staleTime: 30_000,
  });
  const [orderId, setOrderId] = useState<string | null>(null);
  const [historyWoId, setHistoryWoId] = useState<string | null>(null);

  const sections = data.groups.flatMap((group) => group.sections);
  const groupErrors = data.groups.filter((group) => group.error);
  const everythingEmpty = groupErrors.length === 0 && sections.every((section) => !section.error && section.items.length === 0);

  return (
    <div className="space-y-4" aria-busy={isFetching}>
      {type ? (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/inbox">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver a toda la bandeja
          </Link>
        </Button>
      ) : null}

      {groupErrors.map((group) => (
        <StateBlock
          key={group.providerId}
          variant="error"
          title={`No se pudo cargar lo de ${group.label}`}
          description="Las demás partes de la bandeja siguen funcionando."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        />
      ))}

      {type && sections.length === 0 && groupErrors.length === 0 ? (
        <SectionCard>
          <StateBlock
            variant="empty"
            title="No hay nada para mostrar con ese filtro"
            description="La categoría que pediste no existe o no tenés acceso a ella."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/inbox">Ver toda la bandeja</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : everythingEmpty && !type ? (
        <SectionCard>
          <StateBlock
            variant="empty"
            title="No tenés nada pendiente"
            description="Cuando algo necesite tu decisión, aparece acá."
            action={
              canSeeTaller ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/maintenance?tab=maint_operaciones&vista=taller">Ir a Gestión → Taller</Link>
                </Button>
              ) : undefined
            }
          />
        </SectionCard>
      ) : (
        sections.map((section) => (
          <SectionErrorBoundary key={section.type} title={`No se pudo mostrar «${section.label}»`}>
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  {section.label}
                  {!section.error && section.total > 0 ? <Badge variant="secondary">{section.total}</Badge> : null}
                </span>
              }
              description={section.description}
            >
              <SectionBody section={section} onRetry={() => void refetch()}>
                <ul className="space-y-3">
                  {section.items.map((item) => (
                    <InboxItemRow key={item.id} item={item} onOpenOrder={setOrderId} onShowHistory={setHistoryWoId} />
                  ))}
                </ul>
                {section.total > section.items.length ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="text-muted-foreground">
                      Mostrando {section.items.length} de {section.total}.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/inbox?type=${section.type}`}>Ver todo</Link>
                    </Button>
                  </div>
                ) : null}
              </SectionBody>
            </SectionCard>
          </SectionErrorBoundary>
        ))
      )}

      <OrderDetailDialog orderId={orderId} open={!!orderId} onClose={() => setOrderId(null)} context="workshop" />
      <ActivityHistoryModal
        open={!!historyWoId}
        onClose={() => setHistoryWoId(null)}
        workOrderId={historyWoId}
        title="Historial de OT"
      />
    </div>
  );
}
