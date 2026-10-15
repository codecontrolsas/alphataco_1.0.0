'use client';

import { Button } from '@/components/ui/button';
import { StateBlock } from '@/shared/components/common/StateBlock';

interface QueryErrorStateProps {
  title: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

/** Error de carga de una pestaña de la ficha: se muestra como error (nunca como "vacío") y se puede reintentar. */
export function QueryErrorState({ title, onRetry, isRetrying = false }: QueryErrorStateProps) {
  return (
    <StateBlock
      variant="error"
      title={title}
      description="Revisá tu conexión y volvé a intentar."
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Reintentando...' : 'Reintentar'}
        </Button>
      }
    />
  );
}
