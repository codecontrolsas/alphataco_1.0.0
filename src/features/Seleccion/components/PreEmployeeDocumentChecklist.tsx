'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, CircleAlert, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  deletePreEmployeeDocument,
  getPreEmployeeDocumentChecklist,
  getPreEmployeeDocumentUrl,
  uploadPreEmployeeDocument,
  type PreEmployeeChecklistItem,
} from '../actions/pre-employee-documents.server';

const logger = new Logger('PreLegajos/DocumentChecklist');

interface PreEmployeeDocumentChecklistProps {
  preEmployeeId: string;
  /** Solo lectura cuando el candidato esta rechazado o ya fue convertido. */
  readOnly?: boolean;
}

/**
 * Checklist de documentos del candidato: los tipos habilitados para candidato y
 * el archivo cargado de cada uno. No hay alertas ni vencimientos automáticos —
 * ese motor es exclusivo de los empleados reales.
 */
export function PreEmployeeDocumentChecklist({ preEmployeeId, readOnly = false }: PreEmployeeDocumentChecklistProps) {
  const queryClient = useQueryClient();
  const [uploadTarget, setUploadTarget] = useState<PreEmployeeChecklistItem | null>(null);
  // Eliminar borra la fila y el archivo del storage: se confirma antes.
  const [deleteTarget, setDeleteTarget] = useState<PreEmployeeChecklistItem | null>(null);

  const {
    data: checklist = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['pre-employee-documents', preEmployeeId],
    queryFn: () => getPreEmployeeDocumentChecklist(preEmployeeId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pre-employee-documents', preEmployeeId] });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deletePreEmployeeDocument(documentId),
    onSuccess: () => {
      toast.success('Documento eliminado');
      invalidate();
    },
    onError: (error) => {
      logger.error('Error al eliminar el documento', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el documento');
    },
  });

  const handleView = async (documentPath: string) => {
    try {
      const url = await getPreEmployeeDocumentUrl(documentPath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      logger.error('Error al abrir el documento', { data: { error } });
      toast.error('No se pudo abrir el documento');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-2 w-full" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  // Sin esto, una consulta fallida se leería como "no hay tipos habilitados".
  if (isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>No se pudo cargar el checklist de documentos</AlertTitle>
        <AlertDescription>
          <p>Revisá tu conexión e intentá de nuevo.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (checklist.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay tipos de documento habilitados para candidatos. Se habilitan desde Documentación → Tipos de documentos,
        con la opción &quot;Puede cargarse desde un candidato&quot;.
      </p>
    );
  }

  // El avance cuenta sólo los obligatorios: son los que condicionan pasar a pre ingreso.
  const mandatory = checklist.filter((item) => item.documentType.mandatory);
  const uploadedCount = mandatory.filter((item) => item.document).length;
  const progress = mandatory.length ? Math.round((uploadedCount / mandatory.length) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Progreso de carga */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Obligatorios cargados</span>
          <span className="font-mono font-semibold tabular-nums">
            {uploadedCount} / {mandatory.length}
          </span>
        </div>
        <Progress value={progress} />
      </div>

      {/* Listado */}
      <div className="divide-y rounded-lg border">
        {checklist.map((item) => (
          <div key={item.documentType.id} className="flex items-center justify-between gap-4 p-3">
            <div className="flex items-start gap-3 min-w-0">
              {item.document ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{item.documentType.name}</span>
                  {item.documentType.mandatory && <Badge variant="secondary">Obligatorio</Badge>}
                </div>
                {item.document ? (
                  <p className="text-sm text-muted-foreground">
                    Cargado el {formatArgentinaDay(item.document.uploaded_at)}
                    {item.document.validity ? ` · Vence el ${formatArgentinaDay(item.document.validity)}` : ''}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Pendiente de carga</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* type="button": el checklist se renderiza dentro del <form> del detalle y sin
                  esto cada click submitearía el formulario del candidato */}
              {item.document && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleView(item.document!.document_path)}
                  aria-label={`Ver ${item.documentType.name}`}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ver</span>
                </Button>
              )}

              {!readOnly && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadTarget(item)}
                    aria-label={`${item.document ? 'Reemplazar' : 'Subir'} ${item.documentType.name}`}
                  >
                    {item.document ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{item.document ? 'Reemplazar' : 'Subir'}</span>
                  </Button>

                  {item.document && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Eliminar ${item.documentType.name}`}
                    >
                      <Trash2 className="text-danger-subtle-foreground h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteTarget?.documentType.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el archivo cargado y no se puede deshacer. Después se puede volver a subir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget?.document) deleteMutation.mutate(deleteTarget.document.id);
                setDeleteTarget(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {uploadTarget && (
        <UploadDocumentDialog
          preEmployeeId={preEmployeeId}
          item={uploadTarget}
          open={!!uploadTarget}
          onOpenChange={(open) => !open && setUploadTarget(null)}
          onUploaded={invalidate}
        />
      )}
    </div>
  );
}

// ─── Dialog de subida ─────────────────────────────────────────────────────────

interface UploadDocumentDialogProps {
  preEmployeeId: string;
  item: PreEmployeeChecklistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

function UploadDocumentDialog({ preEmployeeId, item, open, onOpenChange, onUploaded }: UploadDocumentDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validity, setValidity] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      toast.error('Seleccioná un archivo');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('preEmployeeId', preEmployeeId);
      formData.append('documentTypeId', item.documentType.id);
      if (validity) formData.append('validity', validity);

      const result = await uploadPreEmployeeDocument(formData);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success('Documento cargado');
      setFile(null);
      setValidity('');
      onOpenChange(false);
      onUploaded();
    } catch (error) {
      logger.error('Error al subir el documento', { data: { error } });
      toast.error('No se pudo subir el documento');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.documentType.name}</DialogTitle>
          <DialogDescription>
            {item.document ? 'Reemplazá el archivo cargado.' : 'Subí el documento del postulante.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-file">Archivo *</Label>
            <Input
              id="document-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {item.documentType.explired && (
            <div className="space-y-2">
              <Label htmlFor="document-validity">Fecha de vencimiento</Label>
              <Input
                id="document-validity"
                type="date"
                value={validity}
                onChange={(event) => setValidity(event.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleUpload} disabled={isUploading || !file}>
            {isUploading ? 'Subiendo...' : 'Subir documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
