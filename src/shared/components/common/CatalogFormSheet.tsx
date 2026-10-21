'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

/**
 * Catálogo ABM: tabla a ancho completo + botón "Nuevo X" + formulario en un Sheet (alta y edición).
 *
 * ## Cómo migrar un catálogo (guía basada en `Empresa/Equipos/EquipmentBrands`)
 *
 * 1. En el `_XxxDataTable.tsx` (cliente) sacá `CatalogSplitLayout` / `ResizablePanelGroup` y creá el estado del Sheet:
 *    ```tsx
 *    const setStore = useXxxStore((s) => s.setXxx);          // store de edición que ya existe
 *    const sheet = useCatalogSheet<XxxListItem>({
 *      canCreate, canUpdate,                                  // los mismos permisos que ya calculás
 *      onOpenEdit: setStore,                                  // el form sigue leyendo el store
 *      onOpenCreate: () => setStore(null),
 *      onClosed: () => setStore(null),
 *    });
 *    ```
 *    La columna "Editar" llama `sheet.openEdit(row)` (en vez de `setStore(row)`).
 * 2. La tabla va sola, a ancho completo, dentro de `<CatalogTableSurface>`, con el alta en la barra de la tabla:
 *    `<DataTable toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo X" />} … />`
 *    y, al lado, el formulario en el Sheet (se monta solo con `open`; sin create/update no se renderiza nada):
 *    ```tsx
 *    <CatalogFormSheet sheet={sheet} getKey={(r) => r.id} title={{ create: 'Nuevo X', edit: 'Editar X' }} size="md">
 *      {() => <XxxForm />}
 *    </CatalogFormSheet>
 *    ```
 * 3. En el formulario: quitá el `<h2>` de título (lo pone el Sheet) y llamá `const closeSheet = useCatalogSheetClose()`
 *    dentro del reset/éxito que ya existía (SOLO en éxito, nunca en error) y en "Cancelar".
 *    Con `toast.promise`, marcá `const setBusy = useCatalogSheetBusy()`: `setBusy(true)` al empezar y `setBusy(false)` en
 *    error (en éxito `close()` ya lo limpia); mientras está busy, Esc y click afuera no cierran. El botón Cancelar
 *    se muestra siempre (ya no hay panel fijo). No cambies guardado, validaciones ni permisos.
 *    Si el form se resetea desde un `useEffect` ligado al store, dejalo: el Sheet monta el form con `key`
 *    distinta por registro/alta, así que arranca limpio.
 *    `size`: `md` (pocos campos), `lg` (formularios con secciones), `xl` (formularios anchos o con tablas internas).
 */

// ============================================================================
// TYPES
// ============================================================================

export type CatalogSheetMode = 'create' | 'edit';

export interface CatalogSheetState<T> {
  open: boolean;
  mode: CatalogSheetMode;
  item: T | null;
  /** Se incrementa en cada alta: fuerza un form limpio aunque el anterior fuera también un alta. */
  nonce: number;
}

export interface UseCatalogSheetOptions<T> {
  canCreate: boolean;
  canUpdate: boolean;
  onOpenCreate?: () => void;
  onOpenEdit?: (item: T) => void;
  onClosed?: () => void;
}

export interface CatalogSheetApi<T> {
  state: CatalogSheetState<T>;
  openCreate(): void;
  openEdit(item: T): void;
  close(): void;
  /** `canCreate || canUpdate`: sin esto no hay formulario que mostrar. */
  hasForm: boolean;
  canCreate: boolean;
  /** Ref del botón "Nuevo": recibe el foco al cerrar si quien abrió el Sheet (ej. "Editar" de una fila) ya no está en el DOM. */
  createButtonRef: RefObject<HTMLButtonElement | null>;
  /** Elemento enfocado al abrir (para devolverle el foco al cerrar). */
  openerRef: RefObject<HTMLElement | null>;
}

export interface CatalogFormSheetProps<T> {
  sheet: CatalogSheetApi<T>;
  getKey: (item: T) => string | number;
  title: { create: string; edit: string };
  description?: { create?: string; edit?: string };
  size?: 'md' | 'lg' | 'xl';
  children: (ctx: {
    mode: CatalogSheetMode;
    item: T | null;
    close(): void;
    /** Mientras `busy` es true, Esc y el click afuera no cierran (guardado en curso). */
    setBusy(busy: boolean): void;
  }) => ReactNode;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCatalogSheet<T>({
  canCreate,
  canUpdate,
  onOpenCreate,
  onOpenEdit,
  onClosed,
}: UseCatalogSheetOptions<T>): CatalogSheetApi<T> {
  const [state, setState] = useState<CatalogSheetState<T>>({ open: false, mode: 'create', item: null, nonce: 0 });
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const rememberOpener = () => {
    openerRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const openCreate = useCallback(() => {
    if (!canCreate) return;
    rememberOpener();
    onOpenCreate?.();
    setState((prev) => ({ open: true, mode: 'create', item: null, nonce: prev.nonce + 1 }));
  }, [canCreate, onOpenCreate]);

  const openEdit = useCallback(
    (item: T) => {
      if (!canUpdate) return;
      rememberOpener();
      onOpenEdit?.(item);
      setState((prev) => ({ open: true, mode: 'edit', item, nonce: prev.nonce }));
    },
    [canUpdate, onOpenEdit]
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    onClosed?.();
  }, [onClosed]);

  return useMemo(
    () => ({
      state,
      openCreate,
      openEdit,
      close,
      hasForm: canCreate || canUpdate,
      canCreate,
      createButtonRef,
      openerRef,
    }),
    [state, openCreate, openEdit, close, canCreate, canUpdate]
  );
}

// ============================================================================
// CONTEXT
// ============================================================================

interface CatalogSheetContextValue {
  close(): void;
  setBusy(busy: boolean): void;
  /** true mientras hay un guardado en curso (el cuerpo del Sheet queda inerte). */
  isBusy: boolean;
}

const CatalogSheetContext = createContext<CatalogSheetContextValue | null>(null);

/** Cierra el Sheet del catálogo desde el formulario (éxito / cancelar). No-op fuera de un `CatalogFormSheet`. */
export function useCatalogSheetClose(): () => void {
  return useContext(CatalogSheetContext)?.close ?? noop;
}

/** Marca el guardado en curso: con `true`, Esc y click afuera no cierran el Sheet. No-op fuera de un `CatalogFormSheet`. */
export function useCatalogSheetBusy(): (busy: boolean) => void {
  return useContext(CatalogSheetContext)?.setBusy ?? noop;
}

/** true si el componente se renderiza dentro del cuerpo de un `CatalogFormSheet` (para mostrar pasos en el mismo panel en vez de abrir un Dialog). */
export function useIsInCatalogSheet(): boolean {
  return useContext(CatalogSheetContext) !== null;
}

function noop() {}

// ============================================================================
// COMPONENTS
// ============================================================================

const SIZE_CLASSES: Record<NonNullable<CatalogFormSheetProps<unknown>['size']>, string> = {
  md: 'w-full sm:max-w-md',
  lg: 'w-full sm:max-w-lg',
  xl: 'w-full sm:max-w-xl',
};

export function CatalogFormSheet<T>({
  sheet,
  getKey,
  title,
  description,
  size = 'md',
  children,
}: CatalogFormSheetProps<T>) {
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const { close: sheetClose } = sheet;
  const setBusy = useCallback((busy: boolean) => {
    busyRef.current = busy;
    setIsBusy(busy);
  }, []);
  const close = useCallback(() => {
    busyRef.current = false;
    setIsBusy(false);
    sheetClose();
  }, [sheetClose]);
  const contextValue = useMemo(() => ({ close, setBusy, isBusy }), [close, setBusy, isBusy]);

  if (!sheet.hasForm) return null;

  const { open, mode, item, nonce } = sheet.state;
  const canRender = mode === 'create' || item !== null;
  const formKey = mode === 'edit' && item !== null ? `edit-${getKey(item)}` : `create-${nonce}`;
  const descriptionText = description?.[mode];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busyRef.current) close();
      }}
    >
      <SheetContent
        side="right"
        className={cn('gap-0 p-0', SIZE_CLASSES[size])}
        onCloseAutoFocus={(event) => {
          const opener = sheet.openerRef.current;
          if (opener && opener.isConnected) return;
          const createButton = sheet.createButtonRef.current;
          if (createButton) {
            event.preventDefault();
            createButton.focus();
          }
        }}
      >
        <SheetHeader className="px-4 pt-6 pb-4 sm:px-6">
          <SheetTitle>{title[mode]}</SheetTitle>
          {descriptionText ? (
            <SheetDescription>{descriptionText}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title[mode]}</SheetDescription>
          )}
        </SheetHeader>
        {/* `relative`: ancla de paneles superpuestos (ej. DependencyValidationModal en modo inline) que manejan su propio Escape. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Con un guardado en curso el cuerpo queda inerte: un segundo click en "Crear/Guardar" no manda otra alta. */}
          <div
            className={cn('flex-1 overflow-y-auto px-4 pb-6 sm:px-6', isBusy && 'pointer-events-none')}
            inert={isBusy}
            aria-busy={isBusy}
          >
            {open && canRender ? (
              <CatalogSheetContext.Provider value={contextValue}>
                <div key={formKey}>{children({ mode, item, close, setBusy })}</div>
              </CatalogSheetContext.Provider>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CatalogCreateButton({
  sheet,
  label,
}: {
  sheet: {
    openCreate(): void;
    hasForm: boolean;
    canCreate?: boolean;
    createButtonRef?: RefObject<HTMLButtonElement | null>;
  };
  label: string;
}) {
  if (!sheet.hasForm || !sheet.canCreate) return null;
  return (
    <Button ref={sheet.createButtonRef} type="button" variant="brand" className="min-h-10" onClick={sheet.openCreate}>
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

/**
 * Superficie propia de la tabla (el contenido ya no va en Card con header gris).
 * `title`/`description` (opcionales) dibujan un encabezado chico sobre la tabla, útil para sub-bloques de vistas
 * fusionadas; `id` sirve de ancla.
 */
export function CatalogTableSurface({
  children,
  className,
  title,
  description,
  id,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={cn('bg-card border-border/60 min-w-0 rounded-xl border p-3 sm:p-4', className)}>
      {title || description ? (
        <div className="mb-3 min-w-0">
          {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
