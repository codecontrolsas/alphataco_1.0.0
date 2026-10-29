'use client';

import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';

/** Recarga la página actual (la pantalla de pausa conserva la URL a la que se quería entrar). */
export function RetryButton({ className }: { className?: string }) {
  return (
    <Button type="button" variant="outline" className={className} onClick={() => window.location.reload()}>
      <RotateCw aria-hidden="true" />
      Reintentar
    </Button>
  );
}
