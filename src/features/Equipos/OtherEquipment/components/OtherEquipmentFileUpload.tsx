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
import {
  removeOtherEquipmentFile,
  uploadOtherEquipmentFile,
} from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { Logger } from '@/lib/logger';
import { useMutation } from '@tanstack/react-query';
import { FileText, ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { getFileNameFromUrl, isImageUrl } from '../lib/equipment-files';

const logger = new Logger('OtherEquipmentFileUpload');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Mismas extensiones que acepta el servidor (sin SVG ni GIF)
const PICTURES_ACCEPT = '.jpg,.jpeg,.png,.webp';
const BLUEPRINTS_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.dwg,.dxf';

// ─── Props ────────────────────────────────────────────────────────────────────

interface OtherEquipmentFileUploadProps {
  equipmentId: string;
  type: 'pictures' | 'blueprints';
  /** URLs actuales de los archivos (ya subidos) */
  files: string[];
  /** Máximo de archivos permitidos. Sin límite si no se pasa. */
  maxFiles?: number;
  readOnly?: boolean;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OtherEquipmentFileUpload({
  equipmentId,
  type,
  files: initialFiles,
  maxFiles,
  readOnly = false,
}: OtherEquipmentFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado local de archivos para reflejar cambios inmediatamente en la UI
  const [localFiles, setLocalFiles] = useState<string[]>(initialFiles);

  // URL del archivo que el usuario quiere eliminar (para el AlertDialog)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // URL que se está previsualizando en grande (solo para imágenes)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isPictures = type === 'pictures';
  const label = isPictures ? 'foto' : 'plano';
  const labelPlural = isPictures ? 'fotos' : 'planos';

  const reachedMax = maxFiles !== undefined && localFiles.length >= maxFiles;

  // ─── Mutation: agregar archivo ────────────────────────────────────────────

  // La subida, el path del storage y la actualización del array viven en la server action
  // el cliente sólo manda el archivo y recibe el array final de la base.
  const addMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.set('equipmentId', equipmentId);
      formData.set('kind', type);
      formData.set('file', file);
      return uploadOtherEquipmentFile(formData);
    },
    onSuccess: ({ files }) => {
      setLocalFiles(files);
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} agregada correctamente`);
    },
    onError: (error: unknown) => {
      logger.error(`Error al agregar ${label}`, { data: { error, equipmentId, type } });
      toast.error(error instanceof Error ? error.message : 'Error al subir el archivo. Intenta de nuevo.');
    },
  });

  // ─── Mutation: eliminar archivo ───────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (urlToRemove: string) => removeOtherEquipmentFile({ equipmentId, kind: type, url: urlToRemove }),
    onSuccess: ({ files }) => {
      setLocalFiles(files);
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminada correctamente`);
      setFileToDelete(null);
    },
    onError: (error: unknown) => {
      logger.error(`Error al eliminar ${label}`, { data: { error, equipmentId, type } });
      toast.error(error instanceof Error ? error.message : 'Error al eliminar el archivo. Intenta de nuevo.');
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('El archivo no puede superar los 10MB');
      return;
    }

    if (reachedMax) {
      toast.error(`No puedes agregar más de ${maxFiles} ${labelPlural}`);
      return;
    }

    addMutation.mutate(file);
  };

  const handleAddClick = () => {
    if (reachedMax) {
      toast.error(`No puedes agregar más de ${maxFiles} ${labelPlural}`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleDeleteConfirm = () => {
    if (fileToDelete) {
      deleteMutation.mutate(fileToDelete);
    }
  };

  const isLoading = addMutation.isPending || deleteMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={isPictures ? PICTURES_ACCEPT : BLUEPRINTS_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        disabled={isLoading || readOnly}
      />

      {/* Grid de archivos */}
      {localFiles.length > 0 ? (
        <div
          className={`grid gap-3 ${
            isPictures ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {localFiles.map((url) => {
            const isImage = isImageUrl(url);
            const fileName = getFileNameFromUrl(url);

            return (
              <div key={url} className="relative group">
                <Card className="overflow-hidden">
                  {isImage ? (
                    /* Preview de imagen */
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in"
                      onClick={() => setPreviewUrl(url)}
                      aria-label={`Ver ${fileName}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={fileName}
                        className="w-full h-32 object-cover transition-opacity group-hover:opacity-80"
                      />
                    </button>
                  ) : (
                    /* Icono + nombre para documentos */
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-2 p-4 h-24 hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <span className="text-xs text-center text-muted-foreground line-clamp-2 break-all">
                        {fileName}
                      </span>
                    </a>
                  )}
                </Card>

                {/* Botón eliminar */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setFileToDelete(url)}
                    disabled={isLoading}
                    className="absolute top-1 right-1 z-10 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Eliminar ${fileName}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Card de agregar (dentro del grid) */}
          {!readOnly && !reachedMax && (
            <button type="button" onClick={handleAddClick} disabled={isLoading} className="relative">
              <Card className="h-full min-h-[6rem] border-dashed flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-4">
                  {addMutation.isPending ? (
                    <span className="text-xs text-muted-foreground">Subiendo...</span>
                  ) : (
                    <>
                      <Plus className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Agregar {label}</span>
                    </>
                  )}
                </CardContent>
              </Card>
            </button>
          )}
        </div>
      ) : (
        /* Estado vacío */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
            {isPictures ? (
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            ) : (
              <FileText className="h-10 w-10 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground text-center">No hay {labelPlural} cargados</p>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={handleAddClick} disabled={isLoading}>
                <Plus className="h-4 w-4 mr-2" />
                {addMutation.isPending ? 'Subiendo...' : `Agregar ${label}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contador de archivos */}
      {localFiles.length > 0 && !readOnly && !reachedMax && (
        <p className="text-xs text-muted-foreground">
          {maxFiles !== undefined
            ? `${localFiles.length} de ${maxFiles} ${labelPlural}`
            : `${localFiles.length} ${labelPlural} cargados`}
        </p>
      )}

      {/* Indicador de límite alcanzado */}
      {reachedMax && !readOnly && (
        <p className="text-xs text-muted-foreground">
          Límite de {maxFiles} {labelPlural} alcanzado
        </p>
      )}

      {/* Modal de preview de imagen */}
      {previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa de imagen"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition-colors"
            onClick={() => setPreviewUrl(null)}
            aria-label="Cerrar vista previa"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Vista previa"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* AlertDialog de confirmación de eliminación */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {isPictures ? 'esta foto' : 'este plano'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el archivo permanentemente. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
