'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, FileText, Package, Trash2, Upload } from 'lucide-react';
import React from 'react';

import { useDeleteRemito, useUnlinkRemito } from '../hooks/useRemitos';
import { RemitTabProps } from '../types';
import { DocumentUploadArea } from './DocumentUploadArea';
import { DocumentViewer } from './DocumentViewer';

export function RemitTab({ remito, dailyReportRowId, customerName }: RemitTabProps) {
  const [showUpload, setShowUpload] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const deleteRemito = useDeleteRemito(dailyReportRowId);
  const unlinkRemito = useUnlinkRemito(dailyReportRowId);

  const isLinked = remito.is_linked === true;
  const mutation = isLinked ? unlinkRemito : deleteRemito;

  const handleDelete = async () => {
    await mutation.mutateAsync(remito.id);
    setShowDeleteDialog(false);
  };

  const hasDocuments = remito.remito_documents.length > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-muted text-muted-foreground rounded-lg p-2">
                <Package className="size-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  Remito <span className="font-mono tabular-nums">{remito.remit_number}</span>
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={hasDocuments ? 'default' : 'outline'}>
                    <FileText aria-hidden="true" />
                    {remito.remito_documents.length} {remito.remito_documents.length === 1 ? 'documento' : 'documentos'}
                  </Badge>
                  {!hasDocuments && (
                    <Badge variant="warning">Sin documentos</Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={mutation.isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isLinked ? 'Desvincular' : 'Eliminar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {!showUpload && !hasDocuments && (
            <Alert variant="warning">
              <AlertCircle />
              <AlertDescription>Este remito todavía no tiene documentos. Subí el remito escaneado o una foto.</AlertDescription>
            </Alert>
          )}

          {!showUpload ? (
            <Button
              type="button"
              onClick={() => setShowUpload(true)}
              variant="outline"
              className="hover:border-brand w-full border-2 border-dashed transition-colors"
            >
              <Upload className="mr-2 size-4" />
              Subir documento
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                  <Upload className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="text-sm font-semibold">Subir nuevo documento</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                  Cancelar
                </Button>
              </div>
              <DocumentUploadArea remitId={remito.id} dailyReportRowId={dailyReportRowId} customerName={customerName} />
            </div>
          )}
        </CardContent>
      </Card>

      {hasDocuments && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Documentos asociados ({remito.remito_documents.length})</h3>
          </div>
          <div className="grid gap-3">
            {remito.remito_documents.map((doc) => (
              <DocumentViewer
                key={doc.id}
                document={doc}
                dailyReportRowId={dailyReportRowId}
                customerName={customerName}
              />
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isLinked ? '¿Desvincular remito?' : '¿Eliminar remito?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isLinked ? (
                <>
                  ¿Está seguro que desea desvincular el remito <strong>{remito.remit_number}</strong>?
                  <br />
                  <span className="text-xs mt-2 block">
                    Nota: El remito y sus documentos originales permanecerán en el parte diario donde fue creado.
                  </span>
                </>
              ) : (
                <>
                  Se elimina el remito <strong>{remito.remit_number}</strong> con todos sus documentos. Esta acción no
                  se puede deshacer. Si el remito está vinculado a otras líneas, esas copias y sus archivos se
                  conservan.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={mutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {mutation.isPending
                ? isLinked
                  ? 'Desvinculando...'
                  : 'Eliminando...'
                : isLinked
                  ? 'Desvincular'
                  : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
