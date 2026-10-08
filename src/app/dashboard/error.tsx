'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { sendErrorReport } from '@/lib/utils/sendErrorReport';
import { StatusScreen } from '@/shared/components/layout/StatusScreen';
import { Copy, Home, Loader2, Mail, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const logger = new Logger('DashboardError');

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    logger.error('Dashboard Error', { data: { message: error.message, digest: error.digest } });

    const details = `
=== ERROR EN DASHBOARD ===
Error Message: ${error.message}
Error Digest: ${error.digest || 'N/A'}
Timestamp: ${new Date().toISOString()}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

Stack Trace:
${error.stack || 'No stack trace available'}
    `.trim();

    setErrorDetails(details);
  }, [error]);

  const copyErrorToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails);
      toast.success('Error copiado al portapapeles', {
        description: 'Puedes pegarlo en un email o mensaje',
      });
    } catch {
      toast.error('No se pudo copiar el error');
    }
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
        source: 'Dashboard',
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
      className="pt-12"
      code="ERROR 500"
      title="Error en el Dashboard"
      description="Ha ocurrido un error inesperado en esta sección del dashboard"
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
        <p className="text-label text-danger-text">Mensaje de error:</p>
        <p className="text-caption text-foreground/80 break-words">{error.message}</p>
        {error.digest ? (
          <p className="text-caption text-foreground/80">
            ID de referencia: <code className="data-code">{error.digest}</code>
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

      <div className="border border-info-border bg-info-soft px-3 py-2.5">
        <p className="text-label text-info-text">¿Qué puedes hacer?</p>
        <ul className="mt-2 list-disc space-y-1 ps-4 text-caption text-foreground/80">
          <li>Intenta recargar la página usando el botón Intentar nuevamente</li>
          <li>Reporta el error al equipo de desarrollo para que lo resuelvan</li>
          <li>Vuelve al inicio del dashboard y prueba otra sección</li>
        </ul>
      </div>
    </StatusScreen>
  );
}
