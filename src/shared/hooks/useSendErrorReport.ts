'use client';

import { sendErrorReport } from '@/lib/utils/sendErrorReport';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Envío por correo del error que capturó una pantalla de error (`error.tsx`). `source` rotula de qué
 * sección viene el reporte.
 */
export function useSendErrorReport(error: Error & { digest?: string }, source: string) {
  const [sending, setSending] = useState(false);

  const sendErrorByEmail = async () => {
    setSending(true);
    try {
      const result = await sendErrorReport({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
        userAgent: navigator.userAgent,
        source,
      });

      if (result.success) {
        toast.success('Reporte enviado al equipo de desarrollo');
      } else {
        toast.error('No se pudo enviar el reporte', { description: result.error });
      }
    } catch {
      toast.error('Error al enviar el reporte');
    } finally {
      setSending(false);
    }
  };

  return { sending, sendErrorByEmail };
}
