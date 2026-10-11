import { Card, CardContent } from '@/components/ui/card';
import type { getOwnChecksHeader } from '../../actions/own-checks.server';
import { formatInCurrency } from '../../lib/currency-format';

type OwnChecksHeader = NonNullable<Awaited<ReturnType<typeof getOwnChecksHeader>>>;

/** Encabezado de la tab Cheques propios: lo emitido sin debitar por cuenta y los pendientes de confirmar. */
export function OwnChecksHeaderCards({ header }: { header: OwnChecksHeader }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {header.issued.map((a) => (
        <Card key={a.accountId}>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {a.name} · {a.count} {a.count === 1 ? 'cheque emitido' : 'cheques emitidos'} sin debitar
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatInCurrency(a.total, 'ARS')}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Fecha de pago vencida, sin débito confirmado</p>
          <p className={header.pendingConfirmation > 0 ? 'tabular-nums text-amber-700 dark:text-amber-400' : 'tabular-nums text-muted-foreground'}>
            {header.pendingConfirmation} {header.pendingConfirmation === 1 ? 'pendiente' : 'pendientes'} de confirmar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
