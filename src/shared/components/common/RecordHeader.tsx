import { cn } from '@/lib/utils';

/**
 * Tarjeta de cabecera de una ficha (empleado, candidato…): la identidad a la izquierda,
 * normalmente pre-renderizada en el servidor, y las acciones a la derecha.
 */
export function RecordHeader({
  identity,
  actions,
  className,
}: {
  identity: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-card flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">{identity}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
