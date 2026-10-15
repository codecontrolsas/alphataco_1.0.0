'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { ContractDocument } from '../../actions/services.server';

interface ContractDocumentPreviewDialogProps {
  document: ContractDocument | null;
  onClose: () => void;
  onDownload: (doc: ContractDocument) => void;
}

/** Vista previa de un documento de contrato en un diálogo: PDF e imágenes en línea; el resto se descarga. */
export function ContractDocumentPreviewDialog({ document, onClose, onDownload }: ContractDocumentPreviewDialogProps) {
  return (
    <Dialog open={!!document} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-words">Vista previa: {document?.name}</DialogTitle>
          <DialogDescription>
            {document?.description ? `Descripción: ${document.description}` : 'Sin descripción'}
          </DialogDescription>
        </DialogHeader>
        {document && (
          <div className="flex h-[65vh] items-center justify-center overflow-hidden rounded-lg bg-muted">
            {document.type === 'pdf' && document.url ? (
              <embed src={document.url} type="application/pdf" className="h-full w-full" />
            ) : document.type === 'image' && document.url ? (
              <img
                src={document.url}
                alt={`Vista previa de ${document.name}`}
                className="mx-auto max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="text-center">
                {document.type === 'spreadsheet' ? (
                  <FileSpreadsheet aria-hidden="true" className="mx-auto h-12 w-12 text-ok-subtle-foreground" />
                ) : (
                  <FileText aria-hidden="true" className="mx-auto h-12 w-12 text-muted-foreground" />
                )}
                <p className="mt-2">Vista previa no disponible</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onDownload(document)}>
                  <Download className="mr-1 h-3 w-3" /> Descargar archivo
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
