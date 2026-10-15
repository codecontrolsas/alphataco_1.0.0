'use client';
import { Button } from '@/components/ui/button';
import { getDocumentDownloadUrls } from '@/features/Documentacion/shared/actions/document-files.server';
import { DownloadIcon } from '@radix-ui/react-icons';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

/** Descarga el archivo de un documento por la URL que resuelve el servidor. */
function DownloadButton({ path, fileName }: { path: string; fileName: string }) {
  const handleDownload = async (path: string, fileName: string) => {
    toast.promise(
      async () => {
        const [signed] = await getDocumentDownloadUrls([path]);
        if (!signed) throw new Error('No se pudo generar el enlace de descarga');

        const response = await fetch(signed.url);
        if (!response.ok) throw new Error('No se pudo descargar el documento');
        const blob = await response.blob();

        // Extrae la extensión del archivo del path
        const extension = path.split('.').pop();
        saveAs(new Blob([blob], { type: 'application/octet-stream' }), `${fileName}.${extension}`);
      },
      {
        loading: 'Descargando documento...',
        success: 'Documento descargado',
        error: (error: Error) => error.message,
      }
    );
  };

  return (
    <Button onClick={() => handleDownload(path, fileName)}>
      <DownloadIcon className="size-5 mr-2" />
      Descargar
    </Button>
  );
}

export default DownloadButton;
