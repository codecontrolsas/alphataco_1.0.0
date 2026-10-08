import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/utils/formatters';

// Sin directiva: server por defecto. `onSelect` solo se puede usar desde un client component (es una función).

// ============================================================================
// KpiStrip
// ============================================================================

// Columnas en ancho completo según cuántas cifras haya (clases completas: Tailwind v4 no ve clases armadas).
const WIDE_COLUMNS: Record<number, string> = {
  1: '',
  2: '',
  3: '@3xl/kpi:grid-cols-3',
  4: '@3xl/kpi:grid-cols-4',
  5: '@3xl/kpi:grid-cols-3 @5xl/kpi:grid-cols-5',
  6: '@3xl/kpi:grid-cols-3 @5xl/kpi:grid-cols-6',
};
const WIDE_COLUMNS_MANY = '@3xl/kpi:grid-cols-4';

type KpiStripProps = {
  /** Nombre de la tira para lectores de pantalla ("Resumen de empleados"). */
  'aria-label': string;
  /** `StatCard` / `StatCardSkeleton`. */
  children: React.ReactNode;
  className?: string;
};

/**
 * Cantidad de cifras que se van a renderizar. `Children.count` cuenta los `null`/`false` de un hijo condicional y
 * toma un Fragment como un solo hijo: acá se ignoran los vacíos y se cuentan los hijos de cada Fragment.
 */
function countRenderedChildren(children: React.ReactNode): number {
  let count = 0;
  React.Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean' || child === '') return;
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) {
      count += countRenderedChildren(child.props.children);
      return;
    }
    count += 1;
  });
  return count;
}

/**
 * Tira de métricas: un único panel dividido por hairlines (DISENO.md §4.10), no cards sueltas.
 * Las columnas se ajustan al ancho del contenedor (`@container/kpi`), no del viewport.
 */
function KpiStrip({ 'aria-label': ariaLabel, children, className }: KpiStripProps) {
  const count = countRenderedChildren(children);
  return (
    <div data-slot="kpi-strip" className={cn('@container/kpi', className)}>
      <dl
        aria-label={ariaLabel}
        className={cn(
          // Borde exterior arriba/izquierda + cada cifra a la derecha/abajo: hairlines sin duplicar en cualquier grilla.
          'grid border-t border-l border-border bg-card',
          count === 1 ? 'grid-cols-1' : 'grid-cols-2',
          WIDE_COLUMNS[count] ?? WIDE_COLUMNS_MANY
        )}
      >
        {children}
      </dl>
    </div>
  );
}

// ============================================================================
// StatCard
// ============================================================================

type StatCardFormat = 'number' | 'percent' | 'currency' | 'none';

// Formateadores de módulo (los `Intl` ya se crean una vez en `formatters.ts`).
const FORMATTERS: Record<Exclude<StatCardFormat, 'none'>, (value: number) => string> = {
  number: formatNumber,
  percent: formatPercent,
  currency: (value) => formatCurrency(value),
};

function formatValue(value: number | string, format: StatCardFormat): string {
  if (typeof value === 'string' || format === 'none') return String(value);
  return FORMATTERS[format](value);
}

type DeltaTone = 'better' | 'worse' | 'flat';

const DELTA_TONE_CLASSES: Record<DeltaTone, string> = {
  better: 'text-success-text',
  worse: 'text-danger-text',
  flat: 'text-muted-foreground',
};

const CELL_BASE = 'relative min-w-0 space-y-1 border-r border-b border-border p-4';
// El control estirado cubre toda la cifra: el foco se dibuja en la celda (2px, adentro).
const CELL_INTERACTIVE =
  'hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring';
const CELL_ACTIVE = 'shadow-[inset_0_2px_0_var(--primary)]';
const STRETCHED_CONTROL =
  'text-left after:absolute after:inset-0 focus-visible:outline-none';

type StatCardDelta = {
  value: number;
  /** "vs. mes anterior" */
  label: string;
  /** Qué dirección es buena: el tono del delta sale de acá, nunca del signo solo. */
  better: 'up' | 'down';
};

type StatCardBaseProps = {
  /** Overline en caso natural ("Empleados activos"): las mayúsculas las pone `text-overline`. */
  label: string;
  /** `null` = no medido → "—". Nunca pasar 0 cuando no hay dato. */
  value: number | string | null;
  /** Default `'number'`. Con `'percent'`, `value` es la fracción (0.125 → 12,5 %). */
  format?: StatCardFormat;
  /** "hs", "km" */
  unit?: string;
  delta?: StatCardDelta;
  /** Una línea de caption bajo el valor. */
  hint?: string;
  /** 14px muted junto al label; nunca caja de color. */
  icon?: LucideIcon;
  /** Skeleton del valor con la geometría real (el label se mantiene). */
  loading?: boolean;
  className?: string;
};

type StatCardProps = StatCardBaseProps &
  (
    | { href?: never; onSelect?: never; active?: never }
    | { href: string; active?: boolean; onSelect?: never }
    | { onSelect: () => void; active: boolean; href?: never }
  );

function StatCardDeltaValue({ delta, format }: { delta: StatCardDelta; format: StatCardFormat }) {
  const direction = delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : null;
  const tone: DeltaTone = direction === null ? 'flat' : direction === delta.better ? 'better' : 'worse';
  const Arrow = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : null;
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', DELTA_TONE_CLASSES[tone])}>
        {Arrow ? <Arrow className="size-3" strokeWidth={2} aria-hidden="true" /> : null}
        {sign}
        {formatValue(Math.abs(delta.value), format)}
      </span>
      <span>{delta.label}</span>
    </span>
  );
}

/**
 * Una cifra de la `KpiStrip`. Va SIEMPRE dentro de un `KpiStrip` (renderiza `dt`/`dd`, que solo son válidos
 * dentro del `dl`). Clickeable con `href` (navega) u `onSelect` + `active` (filtra en la misma vista).
 */
function StatCard(props: StatCardProps) {
  const { label, value, format = 'number', unit, delta, hint, icon: Icon, loading = false, className } = props;
  const isInteractive = props.href !== undefined || props.onSelect !== undefined;
  const active = props.active === true;

  let labelContent: React.ReactNode = label;
  if (props.href !== undefined) {
    labelContent = (
      <Link href={props.href} aria-label={`Ver ${label}`} className={STRETCHED_CONTROL}>
        {label}
      </Link>
    );
  } else if (props.onSelect !== undefined) {
    labelContent = (
      <button
        type="button"
        aria-pressed={active}
        aria-label={`Filtrar por ${label}`}
        onClick={props.onSelect}
        className={cn(STRETCHED_CONTROL, 'cursor-pointer')}
      >
        {label}
      </button>
    );
  }

  const formatted = value === null ? null : formatValue(value, format);

  return (
    <div
      data-slot="stat-card"
      data-active={active || undefined}
      aria-busy={loading || undefined}
      className={cn(CELL_BASE, isInteractive && CELL_INTERACTIVE, active && CELL_ACTIVE, className)}
    >
      <dt className="flex min-w-0 items-center gap-1.5 text-overline text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null}
        <span className="min-w-0 truncate">{labelContent}</span>
      </dt>
      {loading ? (
        <dd>
          <Skeleton className="h-[31px] w-24" />
          <span className="sr-only">Cargando…</span>
        </dd>
      ) : formatted === null ? (
        <dd className="text-kpi text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Sin dato</span>
        </dd>
      ) : (
        <dd className="truncate text-kpi tabular-nums" title={formatted}>
          {formatted}
          {unit ? <span className="ml-1 text-body font-normal text-muted-foreground">{unit}</span> : null}
        </dd>
      )}
      {!loading && delta ? (
        <dd className="text-caption text-muted-foreground">
          <StatCardDeltaValue delta={delta} format={format} />
        </dd>
      ) : null}
      {!loading && hint ? <dd className="truncate text-caption text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** Cifra en carga para los `Suspense` por cifra (Preparte). Geometría 11/28/12px; sin pulso con reduced motion. */
function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div data-slot="stat-card-skeleton" aria-busy="true" className={cn(CELL_BASE, className)}>
      <dt>
        <Skeleton className="h-3.5 w-24" />
        <span className="sr-only">Cargando…</span>
      </dt>
      <dd>
        <Skeleton className="h-[31px] w-20" />
      </dd>
      <dd>
        <Skeleton className="h-4 w-32" />
      </dd>
    </div>
  );
}

export { KpiStrip, StatCard, StatCardSkeleton, type KpiStripProps, type StatCardProps };
