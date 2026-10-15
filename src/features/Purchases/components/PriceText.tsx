import { formatMoney, formatUnitCost } from '@/features/Warehouses/lib/format';
import { cn } from '@/lib/utils';

/**
 * Importe de Compras. `value === null` puede ser "no hay importe" o "no se puede ver": lo decide
 * `canViewPrices`, que viaja con el dato desde el servidor. Sin permiso se dice "Sin permiso",
 * nunca $ 0 ni vacío (se leería como un dato).
 */
export function PriceText({
  value,
  canViewPrices,
  unit = false,
  className,
}: {
  value: string | null | undefined;
  canViewPrices: boolean;
  /** Costo unitario (hasta 4 decimales) en vez de importe total. */
  unit?: boolean;
  className?: string;
}) {
  if (!canViewPrices) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)} title="No tenés permiso para ver los importes">
        Sin permiso
      </span>
    );
  }
  return <span className={cn('tabular-nums', className)}>{unit ? formatUnitCost(value) : formatMoney(value)}</span>;
}
