'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Logger } from '@/lib/logger';
import { useSendErrorReport } from '@/shared/hooks/useSendErrorReport';
import { AlertTriangle, Copy, Home, Loader2, Mail, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const logger = new Logger('DashboardError');

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [errorDetails, setErrorDetails] = useState<string>('');
  const { sending, sendErrorByEmail } = useSendErrorReport(error, 'Dashboard');

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

  return (
    <div className="flex min-h-screen items-center justify-center px-7">
      <Card className="w-full  border-orange-200 dark:border-orange-900 shadow-xl">
        <CardHeader className=" border-b border-orange-100 dark:border-orange-900 bg-gradient-to-r from-orange-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-2xl">Error en el Dashboard</CardTitle>
              <CardDescription className="text-base">
                Ha ocurrido un error inesperado en esta sección del dashboard
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Error Message */}
          <div className="rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30 p-4">
            <p className="mb-2 text-sm font-semibold text-orange-900 dark:text-orange-200">Mensaje de error:</p>
            <p className="text-sm text-orange-800 dark:text-orange-300">{error.message}</p>
            {error.digest && (
              <p className="mt-3 text-xs text-orange-700 dark:text-orange-400">
                ID de referencia:{' '}
                <code className="rounded bg-white dark:bg-gray-800 px-2 py-1 font-mono text-orange-900 dark:text-orange-200">
                  {error.digest}
                </code>
              </p>
            )}
          </div>

          {/* Technical Details */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Información técnica completa:</p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
              <pre className="max-h-48 overflow-auto text-xs text-gray-700 dark:text-gray-300">{errorDetails}</pre>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              onClick={copyErrorToClipboard}
              variant="outline"
              className="gap-2 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            >
              <Copy className="h-4 w-4" />
              Copiar error
            </Button>
            <Button
              onClick={sendErrorByEmail}
              disabled={sending}
              variant="outline"
              className="gap-2 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sending ? 'Enviando reporte...' : 'Reportar al equipo'}
            </Button>
          </div>

          {/* Help Text */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-900 dark:text-blue-200">
            <p className="font-semibold">¿Qué puedes hacer?</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-blue-800 dark:text-blue-300">
              <li>Intenta recargar la página usando el botón Intentar nuevamente</li>
              <li>Reporta el error al equipo de desarrollo para que lo resuelvan</li>
              <li>Vuelve al inicio del dashboard y prueba otra sección</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 sm:flex-row">
          <Button onClick={reset} className="flex-1 gap-2 bg-orange-600 hover:bg-orange-700" size="lg">
            <RefreshCw className="h-4 w-4" />
            Intentar nuevamente
          </Button>
          <Button
            onClick={() => (window.location.href = '/dashboard')}
            className="flex-1 gap-2"
            variant="outline"
            size="lg"
          >
            <Home className="h-4 w-4" />
            Volver al inicio
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
