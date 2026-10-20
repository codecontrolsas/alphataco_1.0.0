import { NO_DATA_LABEL } from '@/features/Dashboard/lib/metric';
import { formatInCurrency } from '@/features/Treasury/lib/currency-format';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { ReactNode } from 'react';
import { loadCashPosition, type CashSource } from '../lib/cash.server';

const money = (value: string) => formatInCurrency(value, 'ARS');

const isPositive = (value: string) => Number(value) > 0;

/** Variación contra el mismo día del mes anterior. Sin base (0) no hay porcentaje: se dice, no se inventa. */
function deltaText(month: string, previous: string, previousLabel: string): string {
  const current = Number(month);
  const base = Number(previous);
  if (base === 0)
    return current === 0
      ? `Sin facturación ni en ${previousLabel}`
      : `Sin facturación a esta altura de ${previousLabel}`;
  const pct = Math.round(((current - base) / Math.abs(base)) * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct} % contra ${previousLabel} a esta altura (${money(previous)})`;
}

function previousMonthLabel(monthLabel: string): string {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const index = months.indexOf(monthLabel);
  return index === -1 ? 'el mes anterior' : months[(index + 11) % 12];
}

/** Una tarjeta por fuente que el usuario puede ver; sin permiso no se dibuja, con error muestra «—». */
function tile<T>(
  source: CashSource<T>,
  label: string,
  render: (data: T) => { value: ReactNode; hint: ReactNode; tone?: 'danger' }
) {
  if (source.status === 'forbidden') return null;
  if (source.status === 'error') {
    return <MetricCard key={label} label={label} value={NO_DATA_LABEL} hint="No se pudo calcular" />;
  }
  const { value, hint, tone } = render(source.data);
  return <MetricCard key={label} label={label} value={value} hint={hint} tone={tone} />;
}

/**
 * «Plata»: disponible hoy en cuentas, pendiente de cobro y facturado en el mes. Es de alphataco (Tesorería y
 * Facturación) y cada número exige el permiso de su módulo.
 */
export async function CashPositionWidget() {
  const { available, receivable, billed } = await loadCashPosition();

  const cards = [
    tile(available, 'Disponible hoy', (data) => ({
      value: money(data.total),
      hint: data.accounts === 1 ? 'En 1 cuenta activa' : `En ${data.accounts} cuentas activas`,
      tone: Number(data.total) < 0 ? 'danger' : undefined,
    })),
    tile(receivable, 'A cobrar', (data) => ({
      value: money(data.total),
      hint: isPositive(data.overdue) ? `${money(data.overdue)} ya vencido` : 'Nada vencido',
      tone: isPositive(data.overdue) ? 'danger' : undefined,
    })),
    tile(billed, `Facturado en ${billed.status === 'ok' ? billed.data.monthLabel : 'el mes'}`, (data) => ({
      value: money(data.month),
      hint: deltaText(data.month, data.previous, previousMonthLabel(data.monthLabel)),
    })),
  ].filter(Boolean);

  if (cards.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin acceso a Tesorería ni a Facturación"
        description="Estos números se muestran según los permisos de cada módulo."
      />
    );
  }

  // El marco del widget (SectionCard) es el contenedor de las container queries.
  return <div className="grid gap-3 @xl:grid-cols-3">{cards}</div>;
}
