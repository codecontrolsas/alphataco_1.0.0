import type { ComponentProps } from 'react';
import type { Label } from 'recharts';

/**
 * Contenido del `<Label>` que pone un total y su leyenda en el centro de un gráfico de dona.
 * Se pasa como `<Label content={donutCenterContent(...)} />` dentro del `<Pie>`: recharts solo reconoce
 * `Label` como hijo directo, por eso esto es una función y no un componente.
 */
export function donutCenterContent({
  value,
  caption,
  compact = false,
}: {
  value: string | number;
  caption: string;
  /** Dona chica (tarjetas de flota): texto más pequeño. */
  compact?: boolean;
}): ComponentProps<typeof Label>['content'] {
  const DonutCenter = ({ viewBox }: { viewBox?: object }) => {
    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
      const cx = viewBox.cx as number;
      const cy = viewBox.cy as number | undefined;
      return (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
          <tspan
            x={cx}
            y={cy}
            className={compact ? 'fill-foreground text-xl font-bold' : 'fill-foreground text-2xl font-bold'}
          >
            {value}
          </tspan>
          <tspan
            x={cx}
            y={(cy ?? 0) + (compact ? 16 : 20)}
            className={compact ? 'fill-muted-foreground text-[10px]' : 'fill-muted-foreground text-xs'}
          >
            {caption}
          </tspan>
        </text>
      );
    }
  };
  return DonutCenter;
}
