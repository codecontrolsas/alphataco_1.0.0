'use client';

import type { ReactNode } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

type SearchSelectDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dentro de un `ResponsiveDialog` que ya es drawer: se abre como drawer anidado de vaul. */
  nested: boolean;
  title: string;
  contentId: string;
  /** Solo en múltiple: cantidad elegida para el botón "Listo (N)". */
  doneCount: number | null;
  children: ReactNode;
};

/** Panel inferior de `SearchSelect` en mobile (< 768px): 85dvh, buscador fijo arriba y footer fijo en múltiple. */
export function SearchSelectDrawer({
  open,
  onOpenChange,
  nested,
  title,
  contentId,
  doneCount,
  children,
}: SearchSelectDrawerProps) {
  const Root = nested ? DrawerPrimitive.NestedRoot : Drawer;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent id={contentId} className="h-[85dvh]">
        <DrawerHeader className="px-4 pt-3 pb-2">
          <DrawerTitle className="truncate text-sm">{title}</DrawerTitle>
          {/* Radix exige una descripción (o `aria-describedby={undefined}`); esta además orienta al lector de pantalla. */}
          <DrawerDescription className="sr-only">
            {doneCount === null ? 'Buscá y tocá una opción para elegirla.' : 'Buscá y tocá las opciones para elegirlas.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="border-border flex min-h-0 flex-1 flex-col border-t">{children}</div>
        {doneCount === null ? null : (
          <DrawerFooter className="border-border border-t">
            <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
              Listo <span className="tabular-nums">({doneCount})</span>
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Root>
  );
}
