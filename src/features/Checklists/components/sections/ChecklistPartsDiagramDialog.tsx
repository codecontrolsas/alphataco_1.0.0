'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';

type PartsDiagram = { src: string; title: string; alt: string };

type ChecklistPartsDiagramDialogProps = {
  partsDiagram: PartsDiagram | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Diagrama de nomenclatura de partes del formulario en papel: material de consulta
 * ocasional, por eso va en un diálogo y no ocupando espacio entre los items.
 */
export function ChecklistPartsDiagramDialog({ partsDiagram, open, onOpenChange }: ChecklistPartsDiagramDialogProps) {
  if (!partsDiagram) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{partsDiagram.title}</DialogTitle>
          <DialogDescription>Referencia del formulario RO 06-1. No forma parte de la inspección.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border bg-white p-3 dark:bg-neutral-900">
          {/* La imagen es tinta negra sobre fondo transparente: en modo
              oscuro se invierte para que las líneas queden blancas */}
          <Image
            src={partsDiagram.src}
            alt={partsDiagram.alt}
            width={1421}
            height={755}
            sizes="(max-width: 1024px) 100vw, 960px"
            className="h-auto w-full dark:invert"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
