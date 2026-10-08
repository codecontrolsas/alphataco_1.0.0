'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { sendErrorReport } from '@/lib/utils/sendErrorReport';
import { StatusScreen } from '@/shared/components/layout/StatusScreen';
import { Copy, Home, Loader2, Mail, RefreshCw } from 'lucide-react';
import posthog from 'posthog-js';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const logger = new Logger('AppError');

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    logger.error('Application Error', { data: { message: error.message, digest: error.digest } });

    const details = `
Error Message: ${error.message}
Error Digest: ${error.digest || 'N/A'}
Stack Trace:
${error.stack || 'No stack trace available'}
Timestamp: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
    `.trim();

    setErrorDetails(details);
  }, [error]);

  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  const copyErrorToClipboard = () => {
    navigator.clipboard.writeText(errorDetails);
    toast.success('Error copiado al portapapeles');
  };

  const sendErrorByEmail = async () => {
    setSending(true);
    try {
      const result = await sendErrorReport({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
        userAgent: navigator.userAgent,
        source: 'Aplicacion',
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

  return (
    <StatusScreen
      as="main"
      className="min-h-dvh pt-[20vh]"
      code="ERROR 500"
      title="Algo salió mal"
      description="Lo sentimos, ha ocurrido un error inesperado. Nuestro equipo ha sido notificado y estamos trabajando para solucionarlo."
      actions={
        <>
          <Button onClick={() => (window.location.href = '/dashboard')}>
            <Home strokeWidth={1.75} aria-hidden />
            Volver al inicio
          </Button>
          <Button variant="secondary" onClick={reset}>
            <RefreshCw strokeWidth={1.75} aria-hidden />
            Intentar nuevamente
          </Button>
        </>
      }
    >
      <div className="space-y-1 border border-danger-border bg-danger-soft px-3 py-2.5">
        <p className="text-label text-danger-text">Detalles del error:</p>
        <p className="text-caption text-foreground/80 break-words">{error.message}</p>
        {error.digest ? (
          <p className="text-caption text-foreground/80">
            ID de error: <code className="data-code">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-label">Información técnica completa:</p>
        <pre className="max-h-48 overflow-auto border border-border bg-panel-2 p-3 font-mono text-caption text-muted-foreground whitespace-pre-wrap break-words">
          {errorDetails}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={copyErrorToClipboard} variant="secondary" size="sm">
          <Copy strokeWidth={1.75} aria-hidden />
          Copiar error
        </Button>
        <Button onClick={sendErrorByEmail} disabled={sending} variant="secondary" size="sm">
          {sending ? (
            <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <Mail strokeWidth={1.75} aria-hidden />
          )}
          {sending ? 'Enviando reporte...' : 'Reportar al equipo'}
        </Button>
      </div>
    </StatusScreen>
  );
}
