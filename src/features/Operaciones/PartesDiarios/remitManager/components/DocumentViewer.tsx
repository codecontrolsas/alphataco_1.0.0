'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import { Download, Eye, FileText, FileType, ImageIcon, Trash2 } from 'lucide-react';
import { useDeleteDocument, useDocumentUrl, useDownloadDocument } from '../hooks/useDocuments';
import { DocumentViewerProps } from '../types';

export function DocumentViewer({ document, dailyReportRowId }: DocumentViewerProps) {
  const deleteDocument = useDeleteDocument(dailyReportRowId);
  const downloadDocument = useDownloadDocument();
  const { data: documentUrl } = useDocumentUrl(document.document_path);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteDocument.mutateAsync(document.id);
    } catch {
      // El error ya se informa con toast en el hook.
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleDownload = async () => {
    await downloadDocument.mutateAsync({
      documentPath: document.document_path,
      documentName: document.document_name,
    });
  };

  const handleView = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  const getFileIcon = () => {
    const ext = document.document_name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      return <ImageIcon className="h-5 w-5 text-primary" />;
    }
    if (ext === 'pdf') {
      return <FileType className="h-5 w-5 text-red-600" />;
    }
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  const getFileType = () => {
    const ext = document.document_name.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  };

  return (
    <Card className="group hover:shadow-md hover:border-primary/50 transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              {getFileIcon()}
            </div>
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold px-1.5 py-0.5 rounded">
              {getFileType()}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
              {document.document_name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Subido el{' '}
              {document.created_at
                ? new Date(document.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '-'}
            </p>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleView}
              aria-label="Ver documento"
              className="hover:bg-primary/10 hover:text-primary"
              title="Ver documento"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleDownload}
              aria-label="Descargar"
              disabled={downloadDocument.isPending}
              className="hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/20"
              title="Descargar"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label="Eliminar"
              disabled={deleteDocument.isPending}
              className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
              title="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará {document.document_name}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDocument.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteDocument.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
