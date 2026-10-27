'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';

/**
 * Índice del manual en pantallas chicas (debajo de `lg`): botón de menú en el header que abre un
 * panel lateral con el buscador y el índice. El contenido llega armado desde el servidor; al tocar
 * un enlace el panel se cierra solo (la navegación es del lado del cliente y no lo desmonta).
 */
export function ManualMobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir el índice del manual">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,88vw)] gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Índice del manual</SheetTitle>
          <SheetDescription className="sr-only">Buscá una guía o elegila del índice.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" onClick={closeOnLink}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
