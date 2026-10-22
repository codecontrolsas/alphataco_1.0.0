'use client';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import moment from 'moment';
import dynamic from 'next/dynamic';

// Importación dinámica del PDFViewer
const PDFViewer = dynamic(() => import('@react-pdf/renderer').then((mod) => mod.PDFViewer), { ssr: false });

interface PdfDocumentPreviewProps {
  /** Documento `react-pdf` ya armado: se muestra en el visor y es lo que se descarga. */
  document: Parameters<typeof pdf>[0];
  title?: string;
  description?: string;
  /** Dominio y fecha del llenado: arman el nombre del archivo descargado. */
  dominio?: string;
  fecha?: string;
  className?: string;
}

/** Vista previa de un PDF de formulario con el encabezado del diálogo y el botón de descarga. */
export function PdfDocumentPreview({
  document: pdfContent,
  title,
  description,
  dominio,
  fecha,
  className,
}: PdfDocumentPreviewProps) {
  const handleDownload = async () => {
    const blob = await pdf(pdfContent).toBlob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    // Generar nombre personalizado
    const fileName =
      `${title}_${dominio || ''}-(${fecha && moment(fecha).isValid() ? moment(fecha).format('DD-MM-YYYY') : ''}).pdf`.replace(
        /\s+/g,
        '_'
      );
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('w-full h-full', className)}>
      <div className=" pr-8 flex items-center justify-between">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Descargar PDF
        </Button>
      </div>
      <PDFViewer style={{ width: '100%', height: '100%', border: 'none' }}>{pdfContent}</PDFViewer>
    </div>
  );
}
