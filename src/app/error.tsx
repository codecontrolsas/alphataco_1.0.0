'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Logger } from '@/lib/logger';
import { useSendErrorReport } from '@/shared/hooks/useSendErrorReport';
import { AlertTriangle, Copy, Loader2, Mail, RefreshCw } from 'lucide-react';
import posthog from 'posthog-js';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const logger = new Logger('AppError');

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [errorDetails, setErrorDetails] = useState<string>('');
  const { sending, sendErrorByEmail } = useSendErrorReport(error, 'Aplicacion');

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-4">
      <Card className="w-full max-w-2xl shadow-lg dark:border-gray-800">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <CardTitle className="text-2xl">Algo salió mal</CardTitle>
          </div>
          <CardDescription>
            Lo sentimos, ha ocurrido un error inesperado. Nuestro equipo ha sido notificado y estamos trabajando para
            solucionarlo.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-2 text-sm font-semibold">Detalles del error:</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            {error.digest && (
              <p className="mt-2 text-xs text-muted-foreground">
                ID de error: <code className="rounded bg-background px-1 py-0.5">{error.digest}</code>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm font-semibold">Información técnica completa:</p>
            <pre className="max-h-40 overflow-auto text-xs text-muted-foreground">{errorDetails}</pre>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={copyErrorToClipboard} variant="outline" className="flex-1 gap-2">
              <Copy className="h-4 w-4" />
              Copiar error
            </Button>
            <Button onClick={sendErrorByEmail} disabled={sending} variant="outline" className="flex-1 gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sending ? 'Enviando reporte...' : 'Reportar al equipo'}
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset} className="flex-1 gap-2" variant="default">
            <RefreshCw className="h-4 w-4" />
            Intentar nuevamente
          </Button>
          <Button onClick={() => (window.location.href = '/dashboard')} className="flex-1" variant="outline">
            Volver al inicio
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
