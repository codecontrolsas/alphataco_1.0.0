'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  WIDGET_SIZES,
  WIDGET_SIZE_LABELS,
  sizeIndex,
  type WidgetSection,
  type WidgetSize,
} from '@/features/Dashboard/lib/widget-registry';
import { cn } from '@/lib/utils';
import { CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { StateBlock } from '@/shared/components/common/StateBlock';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LayoutGrid,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { deleteUserBoard, moveUserBoard, resetUserBoards, saveUserBoardLayout } from '../actions/boards.server';
import { DASHBOARD_NAV_BOARDS_QUERY_KEY } from '../hooks/useActiveDashboardBoard';
import { BOARD_PARAM, WIDGET_SPAN_CLASS, type BoardLayout } from '../lib/board-layout';
import { AddWidgetSheet } from './_AddWidgetSheet';
import { BoardNameForm } from './_BoardNameForm';

/** Widget del catálogo visible para el usuario (sin el árbol: solo metadatos). */
export interface CatalogWidget {
  id: string;
  title: string;
  description: string;
  section: WidgetSection;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
}

/** Widget del tablero ya renderizado en el servidor. */
export interface BoardWidgetSlot {
  widgetId: string;
  size: WidgetSize;
  node: ReactNode;
}

interface DashboardBoardProps {
  board: { id: string; name: string; persisted: boolean };
  canMoveUp: boolean;
  canMoveDown: boolean;
  slots: readonly BoardWidgetSlot[];
  catalog: readonly CatalogWidget[];
  /** Selector de tableros (Server Component). */
  selector: ReactNode;
  startEditing: boolean;
}

type ConfirmKind = 'delete' | 'reset' | null;

/** Ancho en pocas letras para la barra de edición (el rótulo completo es `WIDGET_SIZE_LABELS`). */
const WIDGET_SIZE_SHORT_LABELS: Record<WidgetSize, string> = {
  xs: '1/6',
  sm: '1/4',
  md: '1/3',
  lg: '1/2',
  xl: '2/3',
  full: 'Todo',
};

/**
 * Con el mouse o el dedo, el destino es el widget que está bajo el puntero: los widgets tienen
 * anchos distintos y el centro de uno ancho casi nunca cae sobre uno chico (`closestCenter` solo
 * lo dejaba en el lugar vecino). Con teclado no hay puntero y se usa el más cercano.
 */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCenter(args);
};

function boardHref(id: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (id) params.set(BOARD_PARAM, id);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}

/**
 * Tablero del Dashboard: muestra los widgets (árboles del servidor) en una grilla de 12 columnas y,
 * en «Personalizar», permite reordenar arrastrando (o con teclado), cambiar el ancho, quitar y
 * agregar widgets sobre un borrador que se guarda o se descarta de una vez.
 */
export function DashboardBoard({
  board,
  canMoveUp,
  canMoveDown,
  slots,
  catalog,
  selector,
  startEditing,
}: DashboardBoardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const savedLayout: BoardLayout = slots.map(({ widgetId, size }) => ({ widgetId, size }));
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<BoardLayout>(savedLayout);
  const [addOpen, setAddOpen] = useState(startEditing && slots.length === 0);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const nodes = new Map(slots.map((slot) => [slot.widgetId, slot.node]));
  const catalogById = new Map(catalog.map((widget) => [widget.id, widget]));

  const nameSheet = useCatalogSheet<{ id: string; name: string }>({ canCreate: true, canUpdate: true });

  /**
   * Navega al tablero; si la URL no cambia, vuelve a pedir el render del servidor. Siempre se llama
   * tras un cambio en los tableros: refresca la lista que usan el sidebar y la miga de pan.
   */
  const goTo = (href: string) => {
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_NAV_BOARDS_QUERY_KEY });
    if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
    else router.replace(href);
  };

  const startEdit = () => {
    setDraft(savedLayout);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(savedLayout);
    setEditing(false);
    setAddOpen(false);
    if (startEditing) goTo(boardHref(board.id));
  };

  const saveMutation = useMutation({
    mutationFn: (layout: BoardLayout) => saveUserBoardLayout({ boardId: board.id, layout }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const count = result.data.widgets;
      toast.success(`Tablero guardado con ${count} ${count === 1 ? 'widget' : 'widgets'}`);
      setEditing(false);
      setAddOpen(false);
      goTo(boardHref(result.data.id));
    },
    onError: () => toast.error('No se pudo guardar el tablero. Intentá nuevamente.'),
  });

  const moveMutation = useMutation({
    mutationFn: (direction: 'up' | 'down') => moveUserBoard({ boardId: board.id, direction }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      goTo(boardHref(result.data.id));
    },
    onError: () => toast.error('No se pudo mover el tablero. Intentá nuevamente.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUserBoard({ boardId: board.id }),
    onSuccess: (result) => {
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Tablero «${board.name}» eliminado`);
      goTo(boardHref(null));
    },
    onError: () => toast.error('No se pudo eliminar el tablero. Intentá nuevamente.'),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetUserBoards(),
    onSuccess: (result) => {
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Se restablecieron los tableros por defecto (${result.data.removed} propios eliminados)`);
      goTo(boardHref(null));
    },
    onError: () => toast.error('No se pudieron restablecer los tableros. Intentá nuevamente.'),
  });

  const busy = saveMutation.isPending || moveMutation.isPending || deleteMutation.isPending || resetMutation.isPending;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const titleOf = (id: string | number) => catalogById.get(String(id))?.title ?? String(id);
  const positionOf = (id: string | number) => draft.findIndex((item) => item.widgetId === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Moviendo «${titleOf(active.id)}», posición ${positionOf(active.id)} de ${draft.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `«${titleOf(active.id)}» sobre la posición ${positionOf(over.id)} de ${draft.length}.`
        : `«${titleOf(active.id)}» fuera de la grilla.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `«${titleOf(active.id)}» quedó en la posición ${positionOf(over.id)} de ${draft.length}.`
        : `«${titleOf(active.id)}» volvió a su lugar.`,
    onDragCancel: ({ active }) => `Movimiento de «${titleOf(active.id)}» cancelado.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const from = current.findIndex((item) => item.widgetId === active.id);
      const to = current.findIndex((item) => item.widgetId === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const resize = (widgetId: string, delta: 1 | -1) => {
    const widget = catalogById.get(widgetId);
    if (!widget) return;
    setDraft((current) =>
      current.map((item) => {
        if (item.widgetId !== widgetId) return item;
        const next = sizeIndex(item.size) + delta;
        if (next < sizeIndex(widget.minSize) || next > sizeIndex(widget.maxSize)) return item;
        return { ...item, size: WIDGET_SIZES[next] };
      })
    );
  };

  const remove = (widgetId: string) => setDraft((current) => current.filter((item) => item.widgetId !== widgetId));

  const add = (widget: CatalogWidget) =>
    setDraft((current) =>
      current.some((item) => item.widgetId === widget.id)
        ? current
        : [...current, { widgetId: widget.id, size: widget.defaultSize }]
    );

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedLayout);
  const placedIds = new Set(draft.map((item) => item.widgetId));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Barra del tablero: selector + acciones (o, en edición, guardar/cancelar). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 sm:flex-none">{selector}</div>
        {editing ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={() => setAddOpen(true)} disabled={busy}>
              <Plus aria-hidden="true" className="size-4" />
              Agregar widget
            </Button>
            <Button type="button" variant="ghost" onClick={cancelEdit} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => saveMutation.mutate(draft)} disabled={busy || !dirty}>
              {saveMutation.isPending ? 'Guardando…' : 'Guardar tablero'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={startEdit} disabled={busy}>
              <Settings2 aria-hidden="true" className="size-4" />
              Personalizar
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Más acciones de tableros"
                  disabled={busy}
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => nameSheet.openCreate()}>
                  <LayoutGrid aria-hidden="true" className="size-4" />
                  Nuevo tablero
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => nameSheet.openEdit({ id: board.id, name: board.name })}>
                  <Pencil aria-hidden="true" className="size-4" />
                  Renombrar tablero
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveUp} onSelect={() => moveMutation.mutate('up')}>
                  <ArrowUp aria-hidden="true" className="size-4" />
                  Mover antes en la lista
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveDown} onSelect={() => moveMutation.mutate('down')}>
                  <ArrowDown aria-hidden="true" className="size-4" />
                  Mover después en la lista
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  Eliminar tablero
                </DropdownMenuItem>
                {board.persisted ? (
                  <DropdownMenuItem onSelect={() => setConfirm('reset')}>
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Restablecer tableros por defecto
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <p role="status" className={cn('text-muted-foreground text-sm', !editing && 'sr-only')}>
        {editing
          ? `Personalizando «${board.name}»: ${draft.length} ${draft.length === 1 ? 'widget' : 'widgets'}${dirty ? ', con cambios sin guardar' : ''}.`
          : ''}
      </p>

      {/* La grilla decide los anchos por SU ancho (container queries), no por el viewport. */}
      <div className="@container min-w-0">
        {editing ? (
          draft.length === 0 ? (
            <StateBlock
              variant="empty"
              title="El tablero no tiene widgets"
              description={`Hay ${catalog.length} widgets disponibles según tus permisos.`}
              action={
                <Button type="button" onClick={() => setAddOpen(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  Agregar widget
                </Button>
              }
              className="rounded-xl border border-dashed"
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragEnd={handleDragEnd}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable:
                    'Para mover un widget, presioná espacio o Enter sobre su asa, usá las flechas para cambiarlo de lugar y espacio o Enter para soltarlo. Escape cancela.',
                },
              }}
            >
              <SortableContext items={draft.map((item) => item.widgetId)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-12 gap-4">
                  {draft.map((item) => {
                    const widget = catalogById.get(item.widgetId);
                    if (!widget) return null;
                    return (
                      <SortableWidget
                        key={item.widgetId}
                        widget={widget}
                        size={item.size}
                        node={nodes.get(item.widgetId)}
                        onResize={(delta) => resize(item.widgetId, delta)}
                        onRemove={() => remove(item.widgetId)}
                        disabled={busy}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )
        ) : slots.length === 0 ? (
          <StateBlock
            variant="empty"
            title="El tablero no tiene widgets"
            description={`Hay ${catalog.length} widgets disponibles según tus permisos.`}
            action={
              <Button
                type="button"
                onClick={() => {
                  startEdit();
                  setAddOpen(true);
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                Agregar widget
              </Button>
            }
            className="rounded-xl border border-dashed"
          />
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {slots.map((slot) => (
              <div key={slot.widgetId} className={cn(WIDGET_SPAN_CLASS[slot.size], 'min-w-0')}>
                {slot.node}
              </div>
            ))}
          </div>
        )}
      </div>

      <AddWidgetSheet open={addOpen} onOpenChange={setAddOpen} catalog={catalog} placedIds={placedIds} onAdd={add} />

      <CatalogFormSheet
        sheet={nameSheet}
        getKey={(item) => item.id}
        title={{ create: 'Nuevo tablero', edit: 'Renombrar tablero' }}
        description={{ create: 'Se crea vacío; después se le agregan widgets.' }}
      >
        {({ item }) => (
          <BoardNameForm
            board={item}
            onSaved={(id, mode) => goTo(boardHref(id, mode === 'create' ? { personalizar: '1' } : undefined))}
          />
        )}
      </CatalogFormSheet>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (!open && !busy ? setConfirm(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'reset' ? '¿Restablecer los tableros por defecto?' : `¿Eliminar el tablero «${board.name}»?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'reset'
                ? 'Se borran todos tus tableros y su personalización. Vuelven los tableros por defecto con lo que tenés habilitado.'
                : 'Se borra el tablero y su personalización. Los datos de los widgets no se modifican.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (confirm === 'reset') resetMutation.mutate();
                else deleteMutation.mutate();
              }}
            >
              {busy ? 'Procesando…' : confirm === 'reset' ? 'Restablecer tableros' : 'Eliminar tablero'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface SortableWidgetProps {
  widget: CatalogWidget;
  size: WidgetSize;
  node: ReactNode | undefined;
  onResize: (delta: 1 | -1) => void;
  onRemove: () => void;
  disabled: boolean;
}

/** Widget en modo edición: asa para arrastrar, control de ancho y quitar; el contenido queda inerte. */
function SortableWidget({ widget, size, node, onResize, onRemove, disabled }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled,
  });
  const index = sizeIndex(size);
  const canShrink = index > sizeIndex(widget.minSize);
  const canGrow = index < sizeIndex(widget.maxSize);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(WIDGET_SPAN_CLASS[size], 'min-w-0', isDragging && 'relative z-10')}
    >
      <div
        className={cn(
          'bg-card flex h-full flex-col rounded-xl border-2 border-dashed',
          isDragging ? 'border-brand shadow-lg' : 'border-border'
        )}
      >
        <div className="@container flex flex-col gap-1 border-b px-2 py-1.5">
          {/* En un widget angosto (1/6, 1/4) el título baja a su propia línea en vez de cortarse. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Mover «${widget.title}»`}
              className="text-muted-foreground hover:bg-accent focus-visible:ring-ring flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-2 active:cursor-grabbing"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
            <span
              className="order-last line-clamp-2 w-full min-w-0 px-1 text-sm leading-tight font-medium @3xs:order-none @3xs:w-auto @3xs:flex-1 @3xs:px-0"
              title={widget.title}
            >
              {widget.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-9 shrink-0 @3xs:ml-0"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Quitar «${widget.title}» del tablero`}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div className="@container flex items-center gap-1" role="group" aria-label={`Ancho de «${widget.title}»`}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onResize(-1)}
              disabled={disabled || !canShrink}
              aria-label={`Achicar «${widget.title}»`}
            >
              <Minus aria-hidden="true" className="size-3.5" />
            </Button>
            {/* Rótulo corto para que entre en los widgets angostos; el completo queda para lectores y al pasar el mouse. */}
            <span
              className="text-muted-foreground min-w-0 flex-1 truncate text-center text-xs tabular-nums"
              title={WIDGET_SIZE_LABELS[size]}
              aria-live="polite"
            >
              <span aria-hidden="true" className="@3xs:hidden">
                {WIDGET_SIZE_SHORT_LABELS[size]}
              </span>
              <span className="sr-only @3xs:not-sr-only">{WIDGET_SIZE_LABELS[size]}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onResize(1)}
              disabled={disabled || !canGrow}
              aria-label={`Agrandar «${widget.title}»`}
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </div>
        {/* Vista previa inerte y recortada: se puede arrastrar sin interactuar con el contenido. */}
        <div
          inert
          className="pointer-events-none relative max-h-72 min-h-24 overflow-hidden p-2 opacity-80 select-none"
        >
          {node ?? (
            <div className="text-muted-foreground flex h-24 flex-col items-center justify-center gap-1 text-center text-xs">
              <span className="text-foreground text-sm font-medium">{widget.title}</span>
              <span>{widget.description}</span>
              <span>Se muestra al guardar el tablero.</span>
            </div>
          )}
          <div
            aria-hidden="true"
            className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t"
          />
        </div>
      </div>
    </li>
  );
}
