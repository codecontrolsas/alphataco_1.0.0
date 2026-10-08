'use client';

import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Un `p-*`/`px-*`/`pt-*`… del consumidor (los visores y las listas usan `p-0`) significa que arma su propio
// espaciado: ahí header y footer no se estiran hasta el borde con margen negativo (`js-hoist-regexp`).
const PADDING_OVERRIDE = /(?:^|\s|:)!?p[xytrblse]?-/;

function Dialog({ open, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  // Force remount of the Radix Root when transitioning from open -> closed.
  // This guarantees overlay/portal cleanup without unmounting the wrapper itself,
  // so any internal DialogTrigger remains visible while the dialog is closed.
  const [generation, setGeneration] = React.useState(0);
  const prevOpenRef = React.useRef<boolean | undefined>(open);

  React.useEffect(() => {
    if (prevOpenRef.current === true && open === false) {
      setGeneration((g) => g + 1);
    }
    prevOpenRef.current = open;
  }, [open]);

  return <DialogPrimitive.Root key={generation} data-slot="dialog" open={open} {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 duration-(--duration-panel) data-[state=closed]:duration-150',
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const overlayPadding = className && PADDING_OVERRIDE.test(className) ? 'custom' : 'default';

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-overlay-padding={overlayPadding}
        className={cn(
          'group/dialog-content bg-popover text-popover-foreground border-border-strong shadow-overlay fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border p-5 outline-none sm:max-w-2xl',
          // Entrada: opacidad + 8px hacia arriba en 240ms; salida más corta (DISENO §4.7).
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2 ease-out-quick duration-(--duration-panel) data-[state=closed]:duration-150',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground absolute top-2 right-2">
              <XIcon />
              <span className="sr-only">Cerrar</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        // Llega al borde del dialog con margen negativo (hairline de la spec) salvo que el content tenga padding propio.
        'border-border flex flex-col gap-1.5 border-b px-5 py-3 pr-12 text-left',
        'group-data-[overlay-padding=default]/dialog-content:-mx-5 group-data-[overlay-padding=default]/dialog-content:-mt-5',
        className
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'border-border bg-panel-2 flex flex-col-reverse gap-2 border-t px-5 py-3 empty:hidden sm:flex-row sm:justify-end',
        'group-data-[overlay-padding=default]/dialog-content:-mx-5 group-data-[overlay-padding=default]/dialog-content:-mb-5',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="secondary">
            Cerrar
          </Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-section font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
