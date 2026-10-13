import { cn } from '@/lib/utils';

/** Tarjeta de cabecera del legajo: la identidad a la izquierda (server) y las acciones a la derecha. */
export function EmployeeHeaderShell({
  header,
  actions,
  className,
}: {
  header: React.ReactNode;
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
      <div className="min-w-0">{header}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
