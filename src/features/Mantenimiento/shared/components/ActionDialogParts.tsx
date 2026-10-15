import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ResourceCell, toResourceCellResource } from './ResourceCell';
import type { WithMaintenanceResource } from '../maintenance-resource';

interface ActionDialogResourceProps {
  row: WithMaintenanceResource;
  /** Subtipo del recurso, si la fila lo trae. */
  subtitle?: string | null;
  /** Condición actual del recurso (texto: el estado nunca va solo por color). */
  condition?: string | null;
  /** Dato extra a la derecha (N° de orden, supervisor, etc.). */
  aside?: ReactNode;
  className?: string;
}

/** Resumen del equipo arriba de cada diálogo de acción: patente/serie, N° interno y condición. */
export function ActionDialogResource({ row, subtitle, condition, aside, className }: ActionDialogResourceProps) {
  return (
    <div className={cn('bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <ResourceCell resource={toResourceCellResource(row, subtitle)} />
        {condition ? (
          <span className="text-muted-foreground text-xs">
            Condición actual: <span className="text-foreground font-medium capitalize">{condition}</span>
          </span>
        ) : null}
      </div>
      {aside ? <div className="text-sm">{aside}</div> : null}
    </div>
  );
}

interface ImpactNoticeProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Cuadro "Esta acción actualizará el equipo:" — ícono + texto, con tokens de advertencia. */
export function ImpactNotice({ title, children, className }: ImpactNoticeProps) {
  return (
    <div
      role="note"
      className={cn('bg-warn-subtle text-warn-subtle-foreground flex items-start gap-2 rounded-lg p-3', className)}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Mensaje de un error devuelto por una server action. En producción Next enmascara los errores
 * lanzados por el servidor con un texto genérico: en ese caso no hay nada útil para mostrar.
 */
export function getActionErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const message = error.message.trim();
  if (!message || /server components render|digest/i.test(message)) return null;
  return message;
}
