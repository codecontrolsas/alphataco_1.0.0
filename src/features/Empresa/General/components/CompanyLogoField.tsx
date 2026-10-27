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
import { deleteCompanyLogo } from '@/features/Empresa/General/actions/company.server';
import { COMPANIES_QUERY_KEY } from '@/features/Empresa/General/hooks/useCompanyData';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ImageUp, Loader2, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { LOGO_ACCEPT, LOGO_HINT, validateLogoFile } from '../lib/company-form';

interface CompanyLogoFieldProps {
  /** Logo guardado (URL de `/api/files`). Ausente en el alta. */
  currentLogoUrl?: string | null;
  /** Empresa del logo guardado: habilita "Quitar logo". Ausente en el alta. */
  companyId?: string;
}

/**
 * Logo de la empresa (alta y edición): vista previa, validación de tipo y tamaño antes de enviar,
 * y "Quitar logo" con confirmación para el que ya está guardado.
 *
 * El archivo elegido queda en el `<input type="file" name="logo">` y viaja con el `FormData` del
 * formulario al guardar. Quitar el logo guardado es inmediato (no espera al "Guardar"): borra el
 * archivo del storage y la referencia de la empresa.
 */
export function CompanyLogoField({ currentLogoUrl, companyId }: CompanyLogoFieldProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  // Tras quitarlo, el logo guardado deja de mostrarse aunque la página todavía no se haya refrescado.
  const [removed, setRemoved] = useState(false);

  const savedLogo = removed ? null : currentLogoUrl || null;
  const shownUrl = preview?.url ?? savedLogo;

  const replacePreview = (next: { url: string; name: string } | null) => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(next);
  };

  const clearSelection = () => {
    if (inputRef.current) inputRef.current.value = '';
    replacePreview(null);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      clearSelection();
      return;
    }
    const invalid = validateLogoFile(file);
    if (invalid) {
      setError(invalid);
      clearSelection();
      return;
    }
    setError(null);
    replacePreview({ url: URL.createObjectURL(file), name: file.name });
  };

  const handleRemove = async () => {
    if (!companyId) return;
    setIsRemoving(true);
    const result = await deleteCompanyLogo(companyId);
    setIsRemoving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    setRemoved(true);
    toast.success('Logo quitado');
    await queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          'bg-muted flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border',
          !shownUrl && 'border-dashed'
        )}
      >
        {shownUrl ? (
          // URL de objeto local o de `/api/files`: `next/image` no aporta acá y no sirve los blobs.
          <img
            src={shownUrl}
            alt={preview ? `Vista previa de ${preview.name}` : 'Logo actual de la empresa'}
            className="size-full object-contain p-2"
          />
        ) : (
          <Building2 aria-hidden="true" className="text-muted-foreground size-8" />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium">
          {preview ? 'Logo nuevo (se guarda al confirmar los cambios)' : savedLogo ? 'Logo actual' : 'Sin logo'}
        </p>
        {preview ? <p className="text-muted-foreground truncate text-xs">{preview.name}</p> : null}
        <p id={hintId} className="text-muted-foreground text-xs">
          {LOGO_HINT}
        </p>

        <input
          ref={inputRef}
          id="logo"
          name="logo"
          type="file"
          accept={LOGO_ACCEPT}
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          >
            <ImageUp aria-hidden="true" />
            {shownUrl ? 'Cambiar logo' : 'Elegir logo'}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              <Undo2 aria-hidden="true" />
              Descartar selección
            </Button>
          ) : null}
          {!preview && savedLogo && companyId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 aria-hidden="true" />
              Quitar logo
            </Button>
          ) : null}
        </div>

        <p id={errorId} role="alert" className="text-danger text-sm empty:hidden">
          {error}
        </p>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !isRemoving && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el logo de la empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la imagen guardada y la empresa vuelve a mostrarse con el ícono genérico. Podés subir otro logo
              cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Se cierra recién cuando el servidor confirma (o queda abierto con el error).
                event.preventDefault();
                void handleRemove();
              }}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {isRemoving ? 'Quitando…' : 'Quitar logo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
