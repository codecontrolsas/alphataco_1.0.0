'use client';

import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/shared/components/layout/StatusScreen';
import posthog from 'posthog-js';
import { useEffect } from 'react';
import { fontVariables } from './fonts';
import './globals.css';

/**
 * Global Error Boundary para capturar errores no manejados en el root layout.
 * Según la documentación de PostHog para Next.js error tracking.
 *
 * Reemplaza al root layout, así que importa `globals.css` y las fuentes por su cuenta. Sin
 * `ThemeProvider`: siempre en tema claro (pantalla de último recurso). Se usa `<a href>` y no
 * `Link` porque sin el árbol del router conviene una navegación completa.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Enviar error a PostHog
    posthog.captureException(error, {
      $exception_type: 'Global Error',
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="es" className={fontVariables}>
      <body>
        <StatusScreen
          as="main"
          className="min-h-dvh pt-[20vh]"
          code={error.digest ? `ERROR 500 · ref ${error.digest}` : 'ERROR 500'}
          title="Algo salió mal"
          description="Lo sentimos, ha ocurrido un error inesperado. Nuestro equipo ha sido notificado y estamos trabajando para solucionarlo."
          actions={
            <>
              <Button asChild>
                <a href="/dashboard">Volver al inicio</a>
              </Button>
              <Button variant="secondary" onClick={reset}>
                Intentar nuevamente
              </Button>
            </>
          }
        />
      </body>
    </html>
  );
}
