import { Card, CardContent } from '@/components/ui/card';
import type { getChecksHeader } from '../../actions/checks.server';
import { formatInCurrency } from '../../lib/currency-format';

type ChecksHeader = NonNullable<Awaited<ReturnType<typeof getChecksHeader>>>;

/** Encabezado de la tab Cheques: total en cartera por cartera y los avisos de plazo para depositar. */
export function ChecksHeaderCards({ header }: { header: ChecksHeader }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {header.portfolios.map((p) => (
        <Card key={p.id}>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {p.name} · {p.count} {p.count === 1 ? 'cheque' : 'cheques'} en cartera
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatInCurrency(p.total, 'ARS')}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Plazo para depositar (30 días desde la fecha de pago)</p>
          <p className={header.dueSoon > 0 ? 'tabular-nums text-amber-700 dark:text-amber-400' : 'tabular-nums text-muted-foreground'}>
            {header.dueSoon} por vencer en 5 días o menos
          </p>
          <p className={header.expired > 0 ? 'tabular-nums text-red-600 dark:text-red-400' : 'tabular-nums text-muted-foreground'}>
            {header.expired} vencidos para depositar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
