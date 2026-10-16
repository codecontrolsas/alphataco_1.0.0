'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import moment from 'moment';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DiagramCalendarRow, DiagramFilterCatalog } from '../../actions/diagram-search-actions';
import { CreateDiagrams, UpdateDiagramsById } from '../../actions/mutations.server';
import { DiagramCell } from '../../components/DiagramCell';
import { formatDayLong, formatEmployeeLabel } from '../utils/calendar-filters';

const MAX_COMMENT_LENGTH = 500;

/** Una acción que no tocó ninguna fila (otro usuario se adelantó) es un error, no un "listo". */
async function requireAffected(operation: Promise<{ count: number }>, message: string) {
  const result = await operation;
  if (result.count === 0) throw new Error(message);
}

interface QuickEditSheetProps {
  /** Empleado de la casilla; `null` con el panel cerrado. */
  row: DiagramCalendarRow | null;
  /** `YYYY-MM-DD` de la casilla. */
  dayKey: string | null;
  onClose: () => void;
  diagramTypes: DiagramFilterCatalog['diagramTypes'] | undefined;
  isLoadingTypes: boolean;
  /** El catálogo falló: se muestra un error con "Reintentar" en vez de quedarse cargando. */
  isTypesError: boolean;
  onRetryTypes: () => void;
}

/**
 * Edición rápida de un día: cambia la novedad (y el comentario) de la casilla o la crea si estaba vacía, con las
 * mismas acciones y límites que la carga individual (`UpdateDiagramsById` / `CreateDiagrams`). Se remonta por
 * empleado y día (ver `key` en el padre), así el refresco periódico no pisa lo que se está escribiendo.
 */
export function QuickEditSheet({
  row,
  dayKey,
  onClose,
  diagramTypes,
  isLoadingTypes,
  isTypesError,
  onRetryTypes,
}: QuickEditSheetProps) {
  const entry = row && dayKey ? row.days[dayKey] : undefined;
  const [typeId, setTypeId] = useState(entry?.typeId ?? '');
  const [comment, setComment] = useState(entry?.comments ?? '');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row || !dayKey) return;
      const trimmed = comment.trim();
      if (entry) {
        // Solo se manda el comentario si cambió: omitirlo conserva el que otra persona haya dejado.
        const commentChanged = trimmed !== (entry.comments ?? '');
        await requireAffected(
          UpdateDiagramsById([
            { diagramId: entry.id, diagram_type: typeId, ...(commentChanged ? { comments: trimmed || null } : {}) },
          ]),
          'No se encontró la novedad: puede que ya no exista. Se actualizó el calendario.'
        );
        return;
      }
      const day = moment.utc(dayKey, 'YYYY-MM-DD');
      await requireAffected(
        CreateDiagrams([
          {
            employee_id: row.id,
            diagram_type: typeId,
            day: day.date(),
            month: day.month() + 1,
            year: day.year(),
            ...(trimmed ? { comments: trimmed } : {}),
          },
        ]),
        'Ese día ya tiene una novedad cargada por otra persona. Se actualizó el calendario.'
      );
    },
    onSuccess: () => {
      toast.success(entry ? 'Novedad actualizada' : 'Novedad cargada');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error && error.message ? error.message : 'No se pudo guardar la novedad.');
    },
    // Con éxito o error se refresca el calendario y las vistas que muestran novedades.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['diagram-search'] });
      void queryClient.invalidateQueries({ queryKey: ['diagram-reports-paginated'] });
      void queryClient.invalidateQueries({ queryKey: ['diagram-report-totals'] });
      void queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    },
  });

  // Solo novedades activas; si la del día quedó inactiva se conserva para que no se pierda al abrir el panel.
  const options = useMemo(
    () => diagramTypes?.filter((type) => type.is_active || type.id === entry?.typeId),
    [diagramTypes, entry?.typeId]
  );
  const selectedType = diagramTypes?.find((type) => type.id === typeId) ?? null;
  const unchanged = entry ? typeId === entry.typeId && comment.trim() === (entry.comments ?? '') : false;
  const canSave = Boolean(typeId) && !unchanged && !mutation.isPending;

  return (
    <Sheet open={Boolean(row && dayKey)} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{entry ? 'Editar novedad' : 'Cargar novedad'}</SheetTitle>
          <SheetDescription>
            {row && dayKey ? `${formatEmployeeLabel(row)} · ${formatDayLong(dayKey)}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="quick-edit-type">Novedad</Label>
            {isTypesError && !diagramTypes ? (
              <StateBlock
                variant="error"
                className="rounded-md border"
                title="No se pudieron cargar las novedades"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={onRetryTypes}>
                    Reintentar
                  </Button>
                }
              />
            ) : isLoadingTypes || !options ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={typeId} onValueChange={setTypeId} disabled={mutation.isPending}>
                <SelectTrigger id="quick-edit-type" className="w-full">
                  <SelectValue placeholder="Elegir novedad" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-sm"
                          style={{ background: type.color }}
                        />
                        {type.name || type.short_description}
                        {!type.is_active && <span className="text-muted-foreground text-xs">(inactiva)</span>}
                        <span className="text-muted-foreground text-xs">({type.short_description})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {dayKey && selectedType && (
              <div className="flex items-center gap-2 pt-1">
                <TooltipProvider>
                  <DiagramCell diagramType={selectedType} date={dayKey} size="lg" />
                </TooltipProvider>
                <span className="text-muted-foreground text-sm">
                  {selectedType.name || selectedType.short_description}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-edit-comment">Comentario (opcional)</Label>
            <Textarea
              id="quick-edit-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={MAX_COMMENT_LENGTH}
              rows={3}
              disabled={mutation.isPending}
            />
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {comment.length}/{MAX_COMMENT_LENGTH}
            </p>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={!canSave}>
            {mutation.isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
