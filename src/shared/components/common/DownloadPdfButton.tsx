'use client';

import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { useMutation } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';

/** Descarga un PDF que arma el servidor en el momento (pedido de cotización, OC, orden de pago, certificación). */
export function DownloadPdfButton({
  load,
  label = 'Descargar PDF',
  size = 'sm',
}: {
  load: () => Promise<ActionResult<PdfDownload>>;
  label?: string;
  size?: ComponentProps<typeof Button>['size'];
}) {
  const download = useMutation({
    mutationFn: async () => unwrapAction(await load()),
    onSuccess: ({ filename, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF'),
  });

  return (
    <Button type="button" size={size} variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
      <FileDown className="mr-1 h-4 w-4" />
      {download.isPending ? 'Generando…' : label}
    </Button>
  );
}
