'use client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Timeline, type TimelineItem } from '@/shared/components/common/Timeline';
import { useQuery } from '@tanstack/react-query';
import { History, Info } from 'lucide-react';
import { DETAIL_QUERY_PREFIX } from '../constants';
import { getDailyReportRowHistory } from '../history.server';
import { HistoryEntryDetails, HistoryEntryMeta, HistoryEntryTitle } from './history/HistoryEntry';
import { getActionTone } from './history/history-helpers';
import { useRestoreFocus } from './hooks/useRestoreFocus';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowId: string | null;
}
// ============================================================================
// SKELETON
// ============================================================================

function HistoryDialogSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando historial">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HistoryDialog({ open, onOpenChange, rowId }: Props) {
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();
  const {
    data: historyData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    // Cuelga del prefijo del detalle: `invalidateDetail()` refresca el historial tras editar la línea.
    queryKey: [DETAIL_QUERY_PREFIX, 'row-history', rowId],
    queryFn: () => getDailyReportRowHistory(rowId!),
    enabled: open && rowId != null,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...(historyData ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const timelineItems: TimelineItem[] = sorted.map((entry) => ({
    tone: getActionTone(entry.action_type ?? 'UNKNOWN'),
    title: <HistoryEntryTitle entry={entry} />,
    meta: <HistoryEntryMeta entry={entry} />,
    children: <HistoryEntryDetails entry={entry} />,
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden="true" />
            Historial de cambios
          </SheetTitle>
          <SheetDescription className="sr-only">
            Cambios registrados sobre esta línea del parte, del más reciente al más antiguo.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <HistoryDialogSkeleton />
          ) : isError ? (
            <StateBlock
              variant="error"
              title="No se pudo cargar el historial"
              description="Intentá de nuevo en unos segundos."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <StateBlock variant="empty" icon={Info} title="No hay registros de cambios para este ítem." />
          ) : (
            <Timeline items={timelineItems} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
