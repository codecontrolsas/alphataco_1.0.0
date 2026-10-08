'use client';

import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Un `p-*`/`px-*`/`pt-*`… del consumidor significa que arma su propio espaciado: ahí header y footer no se
// estiran hasta el borde con margen negativo (`js-hoist-regexp`). Mismo criterio que `dialog.tsx`.
const PADDING_OVERRIDE = /(?:^|\s|:)!?p[xytrblse]?-/;

function Sheet({ open, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  // Force remount of the Radix Root when transitioning from open -> closed.
  // This guarantees overlay/portal cleanup without unmounting the wrapper itself,
  // so any internal SheetTrigger remains visible while the sheet is closed.
  const [generation, setGeneration] = React.useState(0);
  const prevOpenRef = React.useRef<boolean | undefined>(open);

  React.useEffect(() => {
    if (prevOpenRef.current === true && open === false) {
      setGeneration((g) => g + 1);
    }
    prevOpenRef.current = open;
  }, [open]);

  return <SheetPrimitive.Root key={generation} data-slot="sheet" open={open} {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 duration-(--duration-panel) data-[state=closed]:duration-150',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  const overlayPadding = className && PADDING_OVERRIDE.test(className) ? 'custom' : 'default';

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-overlay-padding={overlayPadding}
        className={cn(
          // Slide de 240ms de entrada y 150ms de salida (DISENO §2.4; antes 500/300).
          'group/sheet-content bg-popover text-popover-foreground border-border-strong shadow-overlay data-[state=open]:animate-in data-[state=closed]:animate-out ease-out-quick fixed z-50 flex flex-col gap-4 p-5 data-[state=closed]:duration-150 data-[state=open]:duration-(--duration-panel)',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground absolute top-2 right-2">
              <XIcon className="size-4" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        // Antes sumaba `p-4` al `p-6` del content; ahora llega al borde con hairline salvo padding propio del content.
        'border-border flex flex-col gap-1.5 border-b px-5 py-3 pr-12',
        'group-data-[overlay-padding=default]/sheet-content:-mx-5 group-data-[overlay-padding=default]/sheet-content:-mt-5',
        className
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'border-border bg-panel-2 mt-auto flex flex-col gap-2 border-t px-5 py-3 empty:hidden',
        'group-data-[overlay-padding=default]/sheet-content:-mx-5 group-data-[overlay-padding=default]/sheet-content:-mb-5',
        className
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground text-section font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
