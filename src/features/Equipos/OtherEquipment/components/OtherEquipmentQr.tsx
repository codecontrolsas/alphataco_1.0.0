'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { useAppOrigin } from '@/shared/hooks/useAppOrigin';
import { toPng } from 'html-to-image';
import { Copy, Download, Info, Printer } from 'lucide-react';
import { useRef } from 'react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';

const logger = new Logger('OtherEquipmentQr');

interface OtherEquipmentQrProps {
  equipmentId: string;
  equipmentLabel: string;
}

export function OtherEquipmentQr({ equipmentId, equipmentLabel }: OtherEquipmentQrProps) {
  const URLQR = useAppOrigin();
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const qrUrl = `${URLQR}/maintenance?equipment=${equipmentId}`;

  const downloadQR = async () => {
    if (!qrCodeRef.current) return;

    try {
      const dataUrl = await toPng(qrCodeRef.current);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qr-code-${equipmentLabel}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      logger.error('Error al generar imagen del QR', { data: { error } });
      toast.error('Error al descargar el código QR');
    }
  };

  const printQR = () => {
    if (!qrCodeRef.current) return;

    const qrCodeElement = qrCodeRef.current;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.write('<html><head><title>Imprimir QR</title></head><body>');
      iframeDoc.write(qrCodeElement.innerHTML);
      iframeDoc.write('</body></html>');
      iframeDoc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }

    document.body.removeChild(iframe);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(qrUrl);
    toast.success('URL copiada al portapapeles');
  };

  return (
    <div className="flex w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col items-center space-y-4">
          <div ref={qrCodeRef}>
            <QRCode id="other-equipment-qr-code" value={qrUrl} size={300} level="H" />
          </div>
          <div className="flex space-x-2">
            <Button onClick={downloadQR} size="sm">
              <Download className="w-4 h-4 mr-2" />
              Descargar
            </Button>
            <Button onClick={printQR} size="sm">
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button size="sm" onClick={copyUrl}>
              <Copy className="w-4 h-4 mr-2" />
              Copiar url
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Información del QR</h3>
          <p className="text-sm text-gray-600">
            Este código QR contiene un enlace único a la información de este equipo. Al escanearlo, se puede acceder
            rápidamente a:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
            <li>Especificaciones técnicas del equipo</li>
            <li>Historial de mantenimiento y reparaciones</li>
            <li>Registrar mantenimientos y reparaciones futuras</li>
            <li>Documentación y certificados</li>
          </ul>
          <div className="bg-green-50 p-4 rounded-md flex items-start space-x-3">
            <Info className="w-5 h-5 text-green-500 mt-0.5" />
            <p className="text-sm text-green-700">
              Asegurate de escanear este código QR con la cámara de tu dispositivo o con una aplicación de lectura de QR
              como Google Lens o QR Code Reader.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
