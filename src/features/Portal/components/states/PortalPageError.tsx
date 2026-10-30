'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState } from '../ui/ErrorState';

const logger = new Logger('Portal/PageError');

/** Error de carga de una pantalla del portal, con reintento. No muestra el detalle técnico al empleado. */
export function PortalPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Registro del error al montarse el límite (sincronización con un sistema externo: el logger).
  useEffect(() => {
    logger.error('Error al cargar una pantalla del portal', { data: { message: error.message, digest: error.digest } });
  }, [error]);

  return (
    <div className="py-6">
      <ErrorState
        headingLevel="h1"
        title="No pudimos cargar esta pantalla"
        description="Puede ser un problema de conexión. Probá de nuevo en unos segundos; si sigue pasando, avisale a Recursos Humanos."
        actions={
          <>
            <Button type="button" className="min-h-11" onClick={reset}>
              Reintentar
            </Button>
            <Link href="/portal" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}>
              Ir al inicio
            </Link>
          </>
        }
      />
    </div>
  );
}
