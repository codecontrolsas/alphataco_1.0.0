'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';

const logger = new Logger('ConfirmDialog');

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Acción + objeto: "Eliminar la unidad «m³»" (nunca "¿Estás seguro?"). */
  title: string;
  /** Qué se pierde y si es irreversible. */
  description?: React.ReactNode;
  /** Verbo + objeto: "Eliminar unidad". */
  confirmLabel: string;
  /** Default "Cancelar". */
  cancelLabel?: string;
  /** Botón `danger`, ícono de advertencia y foco inicial en Cancelar. */
  destructive?: boolean;
  /** Gerundio que se muestra mientras la acción corre: "Eliminando…". Default "Procesando…". */
  pendingLabel?: string;
  /**
   * Si devuelve una promesa, el diálogo la espera: no se cierra ni acepta otro clic hasta que termine. Si lanza,
   * queda abierto con el error adentro. Si el consumidor atrapa el error (y hace su `toast.error`), cierra como hoy.
   */
  onConfirm: () => void | Promise<unknown>;
  /** Pending manejado afuera (por ejemplo, un `useMutation` del consumidor). Se suma al pending interno. */
  busy?: boolean;
};

const ERROR_MESSAGE = 'No se pudo completar la acción. Volvé a intentar.';

/**
 * Confirmación sí/no sobre `AlertDialog`. Para confirmar desde un handler sin estado propio, usar `useConfirm()`.
 * Lo que pide datos (motivo, fecha, form) no es una confirmación: va en `ResponsiveDialog size="sm"`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  pendingLabel = 'Procesando…',
  onConfirm,
  busy = false,
}: ConfirmDialogProps) {
  const [isPending, startTransition] = React.useTransition();
  const [hasError, setHasError] = React.useState(false);
  // Corta el segundo clic o Enter en el mismo tick, antes de que `isPending` llegue al render.
  const inFlightRef = React.useRef(false);
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);
  // Elemento enfocado al abrir: Radix devuelve el foco al trigger, y `useConfirm()` no tiene trigger.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  // Cada apertura arranca sin el error de la anterior (ajuste en render, sin useEffect).
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setHasError(false);
  }

  const pending = isPending || busy;

  const handleOpenChange = (next: boolean) => {
    if (!next && (pending || inFlightRef.current)) return;
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setHasError(false);
    startTransition(async () => {
      try {
        await onConfirm();
        inFlightRef.current = false;
        onOpenChange(false);
      } catch (error) {
        inFlightRef.current = false;
        logger.error('La acción confirmada falló', { data: { error, title } });
        setHasError(true);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        data-slot="confirm-dialog"
        aria-busy={pending || undefined}
        onOpenAutoFocus={(event) => {
          // FocusScope todavía no movió el foco: `activeElement` es lo que lo tenía antes de abrir.
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          // Radix enfoca Cancelar por default (correcto si es destructivo); si no, el foco va a la acción.
          if (!destructive && confirmButtonRef.current) {
            event.preventDefault();
            confirmButtonRef.current.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          returnFocusRef.current = null;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending || inFlightRef.current) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-start gap-2">
            {destructive ? (
              <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            ) : null}
            <span className="min-w-0">{title}</span>
          </AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-body text-muted-foreground">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {hasError ? (
          <p role="alert" className="text-body text-danger-text">
            {ERROR_MESSAGE}
          </p>
        ) : null}

        {/* Mobile: apilado a ancho completo con la acción abajo (orden del DOM); desde `sm`, en fila a la derecha. */}
        <AlertDialogFooter className="border-border bg-panel-2 -mx-5 -mb-5 flex-col border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
          <AlertDialogCancel type="button" disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          {/* Botón propio y no `AlertDialogAction`: Action cierra al hacer clic, antes de que la acción termine. */}
          <Button
            ref={confirmButtonRef}
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            // `aria-disabled` y no `disabled`: un botón deshabilitado pierde el foco y lo saca del diálogo.
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden="true" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'busy'> & {
  /** Opcional: si está, el diálogo espera a que termine y `confirm()` resuelve `true` solo si no lanzó. */
  onConfirm?: () => void | Promise<unknown>;
};

type ConfirmState = { options: ConfirmOptions; open: boolean };

const noop = () => {};

/**
 * Confirmación imperativa sin provider global (decisión 7.2): el estado vive en el componente que la usa.
 *
 * ```tsx
 * const [confirm, confirmDialog] = useConfirm();
 * const ok = await confirm({ title, confirmLabel: 'Eliminar unidad', destructive: true, onConfirm: () => deleteUnit(id) });
 * // …y en el JSX: {confirmDialog}
 * ```
 *
 * `ok === true`: se confirmó y `onConfirm` terminó sin lanzar. `ok === false`: se canceló (Cancelar, Esc).
 * `confirm` es estable entre renders.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const confirm = React.useCallback(
    (options: ConfirmOptions) => {
      // Un confirm pendiente que se reemplaza por otro cuenta como cancelado.
      settle(false);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setState({ options, open: true });
      });
    },
    [settle]
  );

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    settle(false); // no-op si ya se resolvió `true` al confirmar
    // Se conservan las opciones mientras corre la animación de salida.
    setState((current) => (current ? { ...current, open: false } : current));
  };

  const runAction = state?.options.onConfirm ?? noop;

  const handleConfirm = async () => {
    await runAction();
    settle(true);
  };

  const dialog = state ? (
    <ConfirmDialog
      {...state.options}
      open={state.open}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
    />
  ) : null;

  return [confirm, dialog];
}
