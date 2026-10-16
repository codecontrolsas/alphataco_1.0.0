'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Timeline, type TimelineItem } from '@/shared/components/common/Timeline';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { UpdateDiagramsById } from '../../actions/mutations.server';
import { DiagramCell } from '../../components/DiagramCell';
import {
  getDiagramCellHistory,
  getReportDiagramTypes,
  type DiagramCellHistoryItem,
  type DiagramReportListItem,
  type ReportDiagramType,
} from '../actions.server';
import { reportEmployeeName } from '../columns';

const COMMENT_MAX_LENGTH = 500;

const editSchema = z.object({
  diagramType: z.string().uuid('Elegí un tipo de novedad'),
  comments: z.string().max(COMMENT_MAX_LENGTH, `El comentario no puede superar ${COMMENT_MAX_LENGTH} caracteres`),
});
type EditValues = z.infer<typeof editSchema>;

/** Claves de React Query que se refrescan al cambiar una novedad (la tabla, sus totales, los facets y el historial). */
export const REPORT_QUERY_KEYS = {
  table: ['diagram-reports-paginated'],
  totals: ['diagram-report-totals'],
  facets: ['datatable-facet', ['diagram-reports-paginated']],
  history: ['diagram-report-history'],
} as const;

// ============================================================================
// HISTORIAL
// ============================================================================

/** Un movimiento del log: alta, cambio de tipo o cambio sin cambio de tipo (por ejemplo, solo el comentario). */
function toTimelineItem(entry: DiagramCellHistoryItem): TimelineItem {
  const meta = `${entry.changedBy ?? 'Sistema'} · ${formatArgentinaDateTime(entry.changedAt)}`;
  if (entry.previousState === 'Nuevo') return { tone: 'ok', title: `Cargada como ${entry.state}`, meta };
  if (entry.previousState === entry.state) {
    return { tone: 'brand', title: `Modificada (sigue como ${entry.state})`, meta };
  }
  return { tone: 'warn', title: `${entry.previousState} → ${entry.state}`, meta };
}

function HistorySection({ item }: { item: DiagramReportListItem }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...REPORT_QUERY_KEYS.history, item.employee.id, item.date],
    queryFn: () => getDiagramCellHistory(item.employee.id, item.date),
    staleTime: 0,
  });

  const items = useMemo(() => (data ?? []).map(toTimelineItem), [data]);

  return (
    <section aria-labelledby="report-history-title" className="space-y-3">
      <h3 id="report-history-title" className="text-sm font-medium">
        Historial de cambios
      </h3>
      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <StateBlock
          variant="error"
          title="No se pudo cargar el historial"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              Reintentar
            </Button>
          }
          className="py-6"
        />
      ) : items.length === 0 ? (
        <StateBlock
          variant="empty"
          title="Sin movimientos registrados"
          description="Las novedades cargadas antes de que existiera el registro de cambios no tienen historial."
          className="py-6"
        />
      ) : (
        <Timeline items={items} />
      )}
    </section>
  );
}

// ============================================================================
// EDICIÓN RÁPIDA
// ============================================================================

function EditSection({ item, onSaved }: { item: DiagramReportListItem; onSaved: () => void }) {
  const queryClient = useQueryClient();

  const {
    data: types,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['diagram-report-types'],
    queryFn: getReportDiagramTypes,
    staleTime: 5 * 60 * 1000,
  });

  // Si la novedad actual es de un tipo que ya no está activo, igual tiene que figurar para no quedar en blanco.
  const options = useMemo<ReportDiagramType[]>(() => {
    const active = types ?? [];
    if (active.some((type) => type.id === item.diagramType.id)) return active;
    const current = item.diagramType;
    return [
      {
        id: current.id,
        name: `${current.name ?? current.shortDescription} (inactivo)`,
        color: current.color,
        shortDescription: current.shortDescription,
      },
      ...active,
    ];
  }, [types, item.diagramType]);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { diagramType: item.diagramType.id, comments: item.comments ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: EditValues) =>
      UpdateDiagramsById([
        {
          diagramId: item.id,
          diagram_type: values.diagramType,
          comments: values.comments.trim() === '' ? null : values.comments.trim(),
        },
      ]),
    onSuccess: (result) => {
      if (result.count === 0) {
        toast.error('No se actualizó ninguna novedad. Puede que ya no exista.');
        return;
      }
      toast.success('Novedad actualizada');
      void queryClient.invalidateQueries({ queryKey: REPORT_QUERY_KEYS.table });
      void queryClient.invalidateQueries({ queryKey: REPORT_QUERY_KEYS.totals });
      void queryClient.invalidateQueries({ queryKey: REPORT_QUERY_KEYS.facets });
      void queryClient.invalidateQueries({ queryKey: REPORT_QUERY_KEYS.history });
      // El calendario también muestra esta novedad.
      void queryClient.invalidateQueries({ queryKey: ['diagram-search'] });
      onSaved();
    },
    onError: () => {
      toast.error('No se pudo guardar la novedad. Intentá nuevamente.');
    },
  });

  return (
    <section aria-labelledby="report-edit-title" className="space-y-3">
      <h3 id="report-edit-title" className="text-sm font-medium">
        Editar novedad
      </h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="diagramType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de novedad</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isLoading || mutation.isPending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoading ? 'Cargando tipos...' : 'Elegir tipo de novedad'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {options.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <span
                          aria-hidden="true"
                          className="inline-block size-3 shrink-0 rounded-sm"
                          style={{ background: type.color }}
                        />
                        <span>{type.name}</span>
                        <span className="text-muted-foreground text-xs">({type.shortDescription})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isError && (
                  <p role="alert" className="text-danger text-xs">
                    No se pudieron cargar los tipos de novedad.{' '}
                    <button type="button" className="underline" onClick={() => void refetch()}>
                      Reintentar
                    </button>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="comments"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comentario</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    maxLength={COMMENT_MAX_LENGTH}
                    placeholder="Opcional"
                    disabled={mutation.isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={!form.formState.isDirty || mutation.isPending || isLoading}
          >
            {mutation.isPending && <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />}
            Guardar cambios
          </Button>
        </form>
      </Form>
    </section>
  );
}

// ============================================================================
// SHEET
// ============================================================================

interface DiagramReportDetailSheetProps {
  /** Fila elegida; se conserva mientras el Sheet se cierra para no vaciarlo en la animación. */
  item: DiagramReportListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Puede cambiar el tipo y el comentario (mismo permiso que exige `UpdateDiagramsById`). */
  canUpdate: boolean;
}

/** Detalle de una novedad: quién y cuándo, edición rápida (con permiso) e historial de cambios. */
export function DiagramReportDetailSheet({ item, open, onOpenChange, canUpdate }: DiagramReportDetailSheetProps) {
  const { diagramType } = item;
  const longDate = moment.utc(item.date, 'YYYY-MM-DD').locale('es').format('dddd D [de] MMMM [de] YYYY');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate">{reportEmployeeName(item)}</SheetTitle>
          <SheetDescription>
            Legajo <span className="tabular-nums">{item.employee.fileNumber}</span>
            {item.position ? ` · ${item.position.name}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <section aria-label="Novedad" className="flex items-center gap-3">
            <DiagramCell
              size="lg"
              date={item.date}
              diagramType={{
                name: diagramType.name,
                short_description: diagramType.shortDescription,
                color: diagramType.color,
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{diagramType.name ?? diagramType.shortDescription}</p>
              <p className="text-muted-foreground text-xs capitalize">{longDate}</p>
            </div>
          </section>

          {item.comments && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Comentario</p>
              <p className="text-sm break-words whitespace-pre-wrap">{item.comments}</p>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Registrada el <span className="tabular-nums">{formatArgentinaDateTime(item.createdAt)}</span>
          </p>

          <Separator />

          {canUpdate && (
            <>
              {/* `key`: al abrir otra novedad el formulario arranca limpio, sin efectos para resetearlo. */}
              <EditSection key={item.id} item={item} onSaved={() => onOpenChange(false)} />
              <Separator />
            </>
          )}

          <HistorySection key={`${item.employee.id}-${item.date}`} item={item} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
