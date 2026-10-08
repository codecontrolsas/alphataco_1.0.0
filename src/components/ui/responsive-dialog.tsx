'use client';

import { ArrowLeft, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import {
  ResponsiveDialogContext,
  type ResponsiveDialogContextValue,
  type ResponsiveDialogSurface,
} from '@/components/ui/responsive-dialog-context';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl';
type SheetSize = 'md' | 'lg';

type ResponsiveDialogBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Siempre presente: es el nombre accesible del overlay (va `sr-only` con `hideTitle`). */
  title: string;
  description?: React.ReactNode;
  /** Body con scroll propio; header y footer quedan fijos. */
  children: React.ReactNode;
  /** Barra fija de acciones. Sin `footer` no se agrega ningún botón: el cierre está en el header. */
  footer?: React.ReactNode;
  /** < 768px: bottom sheet (`drawer`) o pantalla completa (`fullscreen`). Default `drawer`. */
  mobile?: 'drawer' | 'fullscreen';
  /** `false` mientras hay un envío en curso: bloquea Esc, clic afuera, arrastre y el botón cerrar. Default `true`. */
  dismissible?: boolean;
  /** Visores (foto, PDF) donde el contenido hace de título: el título queda solo para lectores de pantalla. */
  hideTitle?: boolean;
  /** Clases del contenedor. Se desaconseja `max-w-*`: el ancho lo fija `size`. */
  className?: string;
};

// `layout="sheet"` solo ofrece `md` y `lg` (plan §3.1): la unión lo impide en tipos.
type ResponsiveDialogLayoutProps =
  | { layout?: 'dialog'; size?: DialogSize }
  | { layout: 'sheet'; size?: SheetSize };

export type ResponsiveDialogProps = ResponsiveDialogBaseProps & ResponsiveDialogLayoutProps;

// Clases escritas completas (Tailwind v4 solo emite literales). `sm:` para pisar el `sm:max-w-2xl` de DialogContent.
const DIALOG_SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[800px]',
  xl: 'sm:max-w-[min(1100px,92vw)]',
};

const SHEET_SIZE_CLASS: Record<SheetSize, string> = {
  md: 'sm:max-w-[480px]',
  lg: 'sm:max-w-[640px]',
};

// Valores de contexto estables por superficie: el Provider no re-renderiza a sus consumidores en cada render.
const SURFACE_CONTEXT: Record<ResponsiveDialogSurface, ResponsiveDialogContextValue> = {
  dialog: { surface: 'dialog' },
  sheet: { surface: 'sheet' },
  drawer: { surface: 'drawer' },
  fullscreen: { surface: 'fullscreen' },
};

// Campos que reciben el foco inicial en desktop (`js-hoist-regexp`: el selector se arma una vez).
const FIRST_FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled])';

const HEADER_CLASS = 'border-border flex h-12 shrink-0 items-center gap-3 border-b px-5';
const TITLE_CLASS = 'text-section min-w-0 flex-1 truncate font-semibold';
const DESCRIPTION_CLASS = 'text-caption text-muted-foreground shrink-0 px-5 pt-3';
const BODY_CLASS = '@container/dialog min-h-0 flex-1 overflow-y-auto overscroll-contain p-5';
// Mobile: apilado a ancho completo en el orden del DOM (Cancelar arriba, la acción principal abajo, al alcance del
// pulgar) y con safe area. Desde 768px, en fila a la derecha.
const FOOTER_CLASS =
  'border-border bg-panel-2 flex shrink-0 flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:*:w-full md:flex-row md:justify-end md:pb-3';

type CloseButtonProps = { disabled: boolean; onClose: () => void; className?: string };

function CloseButton({ disabled, onClose, className }: CloseButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Cerrar"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClose}
      className={cn('text-muted-foreground shrink-0', className)}
    >
      <XIcon strokeWidth={1.75} aria-hidden="true" />
    </Button>
  );
}

/** Lleva el foco al elemento con `[data-autofocus]` o, en desktop, al primer campo del body. */
function focusInitialField(event: Event, preferFirstField: boolean) {
  const content = event.currentTarget;
  if (!(content instanceof HTMLElement)) return;
  const explicit = content.querySelector<HTMLElement>('[data-autofocus]');
  const target =
    explicit ??
    (preferFirstField
      ? content.querySelector<HTMLElement>(`[data-slot="responsive-dialog-body"] :is(${FIRST_FIELD_SELECTOR})`)
      : null);
  if (!target) return; // sin campos: Radix enfoca el primer foco posible (el botón cerrar del header)
  event.preventDefault();
  target.focus();
}

/**
 * Overlay que es `Dialog` (o `Sheet` lateral) en desktop y `Drawer` (o pantalla completa) por debajo de 768px.
 *
 * - El modo se decide por viewport al **abrir** y queda fijo mientras está abierto: rotar la tablet no desmonta el
 *   form a mitad de la carga.
 * - Doble envío: el primitivo no conoce el submit. Pasá `dismissible={false}` mientras `isSubmitting` y deshabilitá
 *   el botón primario del `footer` (regla `forms.md`).
 * - Form adentro: si el `<form>` vive en `children`, el submit del `footer` lleva `type="submit"` y `form="<id>"`.
 * - Nunca encadenar modales: no se abre otro overlay desde este; los datos secundarios van en el mismo form.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  layout = 'dialog',
  size = 'md',
  mobile = 'drawer',
  dismissible = true,
  hideTitle = false,
  className,
}: ResponsiveDialogProps) {
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);

  // Modo fijado al abrir, ajustado durante el render (sin useEffect: `rerender-derived-state-no-effect`).
  const [isMobile, setIsMobile] = React.useState(isMobileViewport);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIsMobile(isMobileViewport);
  }

  const surface: ResponsiveDialogSurface = isMobile ? mobile : layout;

  const requestClose = () => {
    if (dismissible) onOpenChange(false);
  };

  // Ningún camino de Radix/vaul (Esc, overlay, arrastre) cierra mientras no es descartable.
  const handleOpenChange = (next: boolean) => {
    if (!next && !dismissible) return;
    onOpenChange(next);
  };

  const preventWhenLocked = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };

  const header = hideTitle ? null : (
    <div data-slot="responsive-dialog-header" className={HEADER_CLASS}>
      {surface === 'fullscreen' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dismissible}
          onClick={requestClose}
          className="-ml-2 shrink-0"
        >
          <ArrowLeft strokeWidth={1.75} aria-hidden="true" />
          Volver
        </Button>
      ) : null}
      <TitleFor surface={surface} className={TITLE_CLASS} title={title}>
        {title}
      </TitleFor>
      {surface === 'fullscreen' ? null : <CloseButton disabled={!dismissible} onClose={requestClose} />}
    </div>
  );

  const body = (
    <>
      {hideTitle ? (
        <>
          <TitleFor surface={surface} className="sr-only">
            {title}
          </TitleFor>
          <CloseButton
            disabled={!dismissible}
            onClose={requestClose}
            className="bg-popover/80 absolute top-2 right-2 z-10"
          />
        </>
      ) : null}
      {description ? (
        <DescriptionFor surface={surface} className={DESCRIPTION_CLASS}>
          {description}
        </DescriptionFor>
      ) : null}
      <div data-slot="responsive-dialog-body" className={BODY_CLASS}>
        {children}
      </div>
      {footer ? (
        <div data-slot="responsive-dialog-footer" className={FOOTER_CLASS}>
          {footer}
        </div>
      ) : null}
    </>
  );

  const content = (
    <ResponsiveDialogContext.Provider value={SURFACE_CONTEXT[surface]}>
      {header}
      {body}
    </ResponsiveDialogContext.Provider>
  );

  // Sin descripción, `aria-describedby` explícito en undefined evita el warning de Radix sin inventar texto.
  const describedBy = description ? {} : { 'aria-describedby': undefined };

  if (surface === 'drawer') {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} dismissible={dismissible}>
        <DrawerContent
          data-slot="responsive-dialog"
          data-surface={surface}
          className={cn('max-h-[92dvh]', className)}
          {...describedBy}
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  if (surface === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          data-slot="responsive-dialog"
          data-surface={surface}
          side="right"
          showCloseButton={false}
          onEscapeKeyDown={preventWhenLocked}
          onPointerDownOutside={preventWhenLocked}
          onInteractOutside={preventWhenLocked}
          onOpenAutoFocus={(event) => focusInitialField(event, true)}
          className={cn('w-full gap-0 p-0', SHEET_SIZE_CLASS[size === 'lg' ? 'lg' : 'md'], className)}
          {...describedBy}
        >
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  const isFullscreen = surface === 'fullscreen';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-slot="responsive-dialog"
        data-surface={surface}
        showCloseButton={false}
        onEscapeKeyDown={preventWhenLocked}
        onPointerDownOutside={preventWhenLocked}
        onInteractOutside={preventWhenLocked}
        // En pantalla completa (mobile) no se enfoca un campo de entrada: abriría el teclado sin pedirlo.
        onOpenAutoFocus={(event) => focusInitialField(event, !isFullscreen)}
        className={cn(
          'flex flex-col gap-0 p-0',
          isFullscreen
            ? 'top-0 left-0 h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 border-0 sm:max-w-none'
            : cn('max-h-[85dvh]', DIALOG_SIZE_CLASS[size]),
          className
        )}
        {...describedBy}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

// Título y descripción del primitivo correcto para cada superficie: Radix y vaul conectan `aria-labelledby` y
// `aria-describedby` solo con el suyo. Componentes de módulo (`rerender-no-inline-components`).
type SlotTextProps = { surface: ResponsiveDialogSurface; className?: string; title?: string; children: React.ReactNode };

function TitleFor({ surface, className, title, children }: SlotTextProps) {
  if (surface === 'drawer') return <DrawerTitle className={className} title={title}>{children}</DrawerTitle>;
  if (surface === 'sheet') return <SheetTitle className={className} title={title}>{children}</SheetTitle>;
  return <DialogTitle className={className} title={title}>{children}</DialogTitle>;
}

function DescriptionFor({ surface, className, children }: SlotTextProps) {
  if (surface === 'drawer') return <DrawerDescription className={className}>{children}</DrawerDescription>;
  if (surface === 'sheet') return <SheetDescription className={className}>{children}</SheetDescription>;
  return <DialogDescription className={className}>{children}</DialogDescription>;
}
