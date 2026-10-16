import { Badge } from '@/components/ui/badge';
import { getContrastTextColor } from '../../lib/color-contrast';

interface NoveltyBadgeProps {
  name: string | null | undefined;
  /** Color de la novedad (viene de la base de datos). */
  color: string | null | undefined;
}

/** Chip de una novedad con el color que le dio el cliente y texto con contraste suficiente sobre ese fondo. */
export function NoveltyBadge({ name, color }: NoveltyBadgeProps) {
  if (!name) return <span className="text-muted-foreground text-sm">—</span>;
  if (!color) return <Badge variant="secondary">{name}</Badge>;

  return (
    <Badge
      variant="outline"
      className="border-0"
      style={{ backgroundColor: color, color: getContrastTextColor(color) }}
    >
      {name}
    </Badge>
  );
}

/** Punto de color de una novedad para listas y selectores. */
export function NoveltyDot({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="border-border inline-block size-3 shrink-0 rounded-full border"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
