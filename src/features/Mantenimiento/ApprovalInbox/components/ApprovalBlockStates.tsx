import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { ReactNode } from 'react';

interface ApprovalBlockStatesProps {
  /** Todavía no hay datos (ni del servidor ni de la consulta del cliente). */
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  /** Cuándo aparece el vacío: el texto dice qué condición lo produce, no "todo bien". */
  emptyTitle: string;
  emptyDescription: string;
  /** Qué se intentó cargar, para el mensaje de error ("las autorizaciones"). */
  subject: string;
  children: ReactNode;
}

/** Carga, error con reintento y vacío de un bloque de la bandeja. Un error nunca se muestra como vacío. */
export function ApprovalBlockStates({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  subject,
  children,
}: ApprovalBlockStatesProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={`Cargando ${subject}`}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <StateBlock
        variant="error"
        title={`No se pudieron cargar ${subject}`}
        description="Es un problema de conexión o de permisos, no significa que no haya tareas. Probá de nuevo."
        action={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (isEmpty) {
    return <StateBlock variant="empty" title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children}</>;
}
