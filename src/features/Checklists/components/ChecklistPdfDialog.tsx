'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, type ComponentProps, type ReactNode } from 'react';

// Importación dinámica del PDFViewer
const PDFViewer = dynamic(() => import('@react-pdf/renderer').then((mod) => mod.PDFViewer), {
  ssr: false,
});

// El layout se carga con `import()` dinámico; el tipo viene de un `import type`, que TypeScript borra
// en el build y no arrastra el PDF al bundle inicial.
type NormalizedChecklistPDFLayoutComponent =
  (typeof import('@/features/Checklists/pdf/layouts/NormalizedChecklistPDFLayout'))['NormalizedChecklistPDFLayout'];

/** Datos de la plantilla (y, si hay respuestas, del llenado) que recibe el layout del PDF. */
export type ChecklistPdfLayoutProps = ComponentProps<NormalizedChecklistPDFLayoutComponent>;

/** Nombre de archivo de la descarga: plantilla saneada y las partes que identifican el llenado. */
export function checklistPdfFileName(templateName: string, ...parts: string[]) {
  const sanitizedName = templateName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').replace(/\s+/g, '_');
  return `Checklist_${sanitizedName}_${parts.join('_')}.pdf`;
}

interface ChecklistPdfDialogProps {
  /** Contenido del botón que abre la vista previa. */
  trigger: ReactNode;
  description: ReactNode;
  layoutProps: ChecklistPdfLayoutProps;
  /** Se evalúa al descargar (el nombre lleva la fecha de ese momento si el llenado no trae una). */
  fileName: () => string;
}

/** Vista previa del PDF de un checklist (vacío o con respuestas) y su descarga. */
export function ChecklistPdfDialog({ trigger, description, layoutProps, fileName }: ChecklistPdfDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [PDFComponent, setPDFComponent] = useState<NormalizedChecklistPDFLayoutComponent | null>(null);

  // Cargar el componente PDF cuando se abre el diálogo
  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    if (open && !PDFComponent) {
      const { NormalizedChecklistPDFLayout } = await import(
        '@/features/Checklists/pdf/layouts/NormalizedChecklistPDFLayout'
      );
      setPDFComponent(() => NormalizedChecklistPDFLayout);
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // Importar dinámicamente el componente del PDF
      const { NormalizedChecklistPDFLayout } = await import(
        '@/features/Checklists/pdf/layouts/NormalizedChecklistPDFLayout'
      );

      const blob = await pdf(<NormalizedChecklistPDFLayout {...layoutProps} />).toBlob();
      const url = URL.createObjectURL(blob);

      // Crear un enlace temporal y hacer clic para descargar
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Liberar la URL del objeto
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error al generar PDF', { data: { error } });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-2xl">{layoutProps.templateName}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-6">
          {PDFComponent && (
            <PDFViewer width="100%" height="100%">
              <PDFComponent {...layoutProps} />
            </PDFViewer>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cerrar
          </Button>
          <Button onClick={handleDownload} disabled={isGenerating}>
            <Download className="mr-2 h-4 w-4" />
            {isGenerating ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
