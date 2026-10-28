import type { PdfDownload } from '@/shared/lib/pdf/types';

/** Lo que devuelven las acciones de descarga de HSE: la URL del archivo guardado o un PDF generado en el momento. */
export type HsePdfDelivery = { url: string } | { file: PdfDownload };

/**
 * Entrega el PDF en el navegador: el guardado por el proxy de archivos (`?download=1`) o el generado en el momento
 * (un anulado, con su marca) como descarga local. Solo para el cliente.
 */
export function deliverHsePdf(delivery: HsePdfDelivery): void {
  if ('url' in delivery) {
    window.location.assign(delivery.url);
    return;
  }
  const bytes = Uint8Array.from(atob(delivery.file.base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = delivery.file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
