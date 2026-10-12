import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AMOUNT_SCALE, amountOf, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { ChevronRight, Landmark, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { TreasuryAccountRow } from '../../actions/accounts.server';

type Indicators = Pick<TreasuryAccountRow, 'balance' | 'toDebit' | 'toCredit' | 'projected'>;

const negative = (value: string) => value.startsWith('-');
const amountTone = (value: string) => (negative(value) ? 'text-red-600 dark:text-red-400' : '');

function sumIndicators(rows: Indicators[]): Indicators {
  const total = (key: keyof Indicators) => formatScaled(rows.reduce((acc, r) => acc + amountOf(r[key]), BigInt(0)), AMOUNT_SCALE);
  return { balance: total('balance'), toDebit: total('toDebit'), toCredit: total('toCredit'), projected: total('projected') };
}

/** Las cuatro cifras de una cuenta (o de un total). */
function IndicatorGrid({ value }: { value: Indicators }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">A debitar</dt>
      <dd className={`text-right tabular-nums ${amountTone(value.toDebit)}`}>{formatMoney(value.toDebit)}</dd>
      <dt className="text-muted-foreground">A acreditar</dt>
      <dd className="text-right tabular-nums">{formatMoney(value.toCredit)}</dd>
      <dt className="font-medium">Proyectado</dt>
      <dd className={`text-right font-medium tabular-nums ${amountTone(value.projected)}`}>{formatMoney(value.projected)}</dd>
    </dl>
  );
}

/**
 * Tarjetas por cuenta y caja activa con los totales de bancos y de cajas (spec Tesorería etapa 1
 * §4). Saldo = movimientos hasta hoy; a debitar / a acreditar = los de fecha futura (cheques y
 * e-cheqs que todavía no vencieron, débitos programados). Cada tarjeta abre el extracto.
 */
export function AccountCards({ accounts, canConfigure }: { accounts: TreasuryAccountRow[]; canConfigure: boolean }) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todavía no hay cuentas ni cajas activas.
          {canConfigure && (
            <>
              {' '}
              Cargalas en{' '}
              <Link href="/dashboard/treasury?tab=config-tesoreria" className="font-medium underline underline-offset-4">
                Configuración de Tesorería
              </Link>
              .
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const banks = accounts.filter((a) => a.kind === 'BANK');
  const cash = accounts.filter((a) => a.kind === 'CASH');

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: 'Total bancos', rows: banks },
          { title: 'Total cajas', rows: cash },
        ].map((group) => {
          const total = sumIndicators(group.rows);
          return (
            <Card key={group.title}>
              <CardHeader className="pb-2">
                <CardDescription>{group.title}</CardDescription>
                <CardTitle className={`text-2xl tabular-nums ${amountTone(total.balance)}`}>{formatMoney(total.balance)}</CardTitle>
              </CardHeader>
              <CardContent>
                <IndicatorGrid value={total} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const Icon = a.kind === 'BANK' ? Landmark : Wallet;
          return (
            <Link key={a.id} href={`/dashboard/treasury/accounts/${a.id}`} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="min-w-0 flex-1 truncate text-base">{a.name}</CardTitle>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <CardDescription className="truncate">
                    {a.kind === 'BANK' ? [a.bank_name, a.account_number].filter(Boolean).join(' · ') || 'Cuenta bancaria' : 'Caja'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p className={`text-xl font-semibold tabular-nums ${amountTone(a.balance)}`}>{formatMoney(a.balance)}</p>
                  </div>
                  <IndicatorGrid value={a} />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
