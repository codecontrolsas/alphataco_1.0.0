import { cn } from '@/lib/utils';

/** Dato de solo lectura: rótulo chico y atenuado, valor al frente. `mono` para identificadores y fechas. */
export function Field({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  /** Valor ya armado (por ejemplo con un link). Si viene, manda sobre `value`. */
  children?: React.ReactNode;
}) {
  const content = children ?? value;
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          'font-medium',
          content && mono && 'font-mono tabular-nums',
          !content && 'text-muted-foreground font-normal'
        )}
      >
        {content || 'Sin dato'}
      </dd>
    </div>
  );
}

/** Etiqueta de un enum para mostrar en un `Field`: sin valor devuelve `null` (y el campo muestra "Sin dato"). */
export function enumLabel(value: string | null | undefined, labels: Record<string, string>): string | null {
  return value ? labels[value] ?? value.replace(/_/g, ' ') : null;
}

/** Grilla de `Field`: 1 columna en móvil, 2 desde `sm` y 3 desde `xl`. */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>;
}
