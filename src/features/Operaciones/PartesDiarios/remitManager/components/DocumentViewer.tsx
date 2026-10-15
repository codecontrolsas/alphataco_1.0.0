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
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { Download, Eye, FileText, FileType, ImageIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteDocument, useDocumentUrl, useDownloadDocument } from '../hooks/useDocuments';
import { DocumentViewerProps } from '../types';

export function DocumentViewer({ document, dailyReportRowId }: DocumentViewerProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteDocument = useDeleteDocument(dailyReportRowId);
  const downloadDocument = useDownloadDocument();
  const { data: documentUrl } = useDocumentUrl(document.document_path);

  const handleDelete = async () => {
    await deleteDocument.mutateAsync(document.id);
    setConfirmDelete(false);
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

  const extension = document.document_name.split('.').pop()?.toLowerCase() ?? '';
  const FileIcon = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
    ? ImageIcon
    : extension === 'pdf'
      ? FileType
      : FileText;

  return (
    <div className="bg-card hover:border-brand/50 flex items-center gap-4 rounded-xl border p-4 transition-colors">
      <div className="relative shrink-0">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-lg">
          <FileIcon className="size-5" aria-hidden="true" />
        </div>
        <span className="bg-secondary text-secondary-foreground absolute -top-1 -right-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase">
          {extension || 'archivo'}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.document_name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Subido el{' '}
          <span className="font-mono tabular-nums">
            {document.created_at ? formatArgentinaDay(document.created_at) : '-'}
          </span>
        </p>
      </div>

      <div className="flex gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleView}
          disabled={!documentUrl}
          aria-label={`Ver ${document.document_name}`}
          title="Ver documento"
        >
          <Eye className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDownload}
          disabled={downloadDocument.isPending}
          aria-label={`Descargar ${document.document_name}`}
          title="Descargar"
        >
          <Download className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteDocument.isPending}
          className="text-danger-subtle-foreground hover:text-danger-subtle-foreground"
          aria-label={`Eliminar ${document.document_name}`}
          title="Eliminar"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita <strong>{document.document_name}</strong> de este remito. Si el mismo archivo está vinculado a
              otra línea, ahí se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDocument.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteDocument.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleteDocument.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
