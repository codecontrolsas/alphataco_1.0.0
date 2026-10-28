'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getHseCertificateUrl, getHseRecordPdfUrl } from '../actions/records.server';

const logger = new Logger('Hse/HsePdfDownloadButton');

/**
 * Descarga el PDF del acta o de una constancia: el servidor lo genera si falta, verifica su huella y devuelve la URL
 * del proxy de archivos (con perímetro, sin URL pública).
 */
export function HsePdfDownloadButton({
  kind,
  id,
  label,
  accessibleLabel,
  size = 'default',
  variant = 'outline',
}: {
  kind: 'record' | 'certificate';
  id: string;
  label: string;
  /** Nombre accesible más específico (por ejemplo, de quién es la constancia). */
  accessibleLabel?: string;
  size?: 'default' | 'sm';
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const download = useMutation({
    mutationFn: async () =>
      unwrapAction(kind === 'record' ? await getHseRecordPdfUrl(id) : await getHseCertificateUrl(id)),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => {
      logger.error('Error al descargar el PDF', { data: { error, kind, id } });
      toast.error(error instanceof Error ? error.message : 'No se pudo descargar el PDF');
    },
  });
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={size === 'sm' ? 'min-h-11 sm:min-h-8' : 'min-h-11 sm:min-h-9'}
      disabled={download.isPending}
      aria-busy={download.isPending}
      aria-label={accessibleLabel}
      onClick={() => download.mutate()}
    >
      {download.isPending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Download aria-hidden="true" className="size-4" />
      )}
      {download.isPending ? 'Preparando…' : label}
    </Button>
  );
}
