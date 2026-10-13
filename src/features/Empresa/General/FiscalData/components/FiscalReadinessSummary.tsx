import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Landmark, XCircle } from 'lucide-react';
import moment from 'moment';
import type { FiscalDataOverview } from '../actions/fiscal-data.server';
import { daysUntil } from '../lib/readiness';
import { ENVIRONMENT_LABELS } from '../schemas/fiscal-data';
import { joinList } from '../utils/format';
import { ENVIRONMENT_BADGE_STYLES } from './environment-styles';

type ItemState = 'ok' | 'warning' | 'missing' | 'error';

/** Ícono + color por estado. Nunca solo color: el texto del ítem dice lo mismo. */
const ITEM_ICONS = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  missing: CircleDashed,
  error: XCircle,
} as const;

const ITEM_ICON_STYLES: Record<ItemState, string> = {
  ok: 'text-brand-ink',
  warning: 'text-amber-600 dark:text-amber-400',
  missing: 'text-muted-foreground',
  error: 'text-destructive',
};

type ReadinessItem = { key: string; href: string; state: ItemState; text: string };

/**
 * "Listo para facturar": lista de chequeo arriba de todo. Cada ítem lleva a su sección. Server
 * Component: no tiene interacción.
 */
export function FiscalReadinessSummary({ overview, nowIso }: { overview: FiscalDataOverview; nowIso: string }) {
  const { readiness, environment } = overview;
  const now = new Date(nowIso);
  const envLabel = ENVIRONMENT_LABELS[environment].toLowerCase();
  const active = overview.certificates[environment].active;

  const items: ReadinessItem[] = [
    {
      key: 'profile',
      href: '#datos-del-emisor',
      state: readiness.profileComplete ? 'ok' : 'missing',
      text: readiness.profileComplete ? 'Datos fiscales completos' : 'Faltan los datos fiscales',
    },
    {
      key: 'sales-points',
      href: '#puntos-de-venta',
      state: readiness.activeSalesPoints > 0 ? 'ok' : 'missing',
      text:
        readiness.activeSalesPoints === 0
          ? 'Sin puntos de venta activos'
          : readiness.activeSalesPoints === 1
            ? '1 punto de venta activo'
            : `${readiness.activeSalesPoints} puntos de venta activos`,
    },
    overview.arcaSimulated && readiness.certificate !== 'active' && readiness.certificate !== 'expiring'
      ? // Con ARCA simulado el certificado no bloquea (ver `computeReadiness`): no se marca como faltante.
        { key: 'certificate', href: '#certificado-arca', state: 'ok', text: 'Certificado no necesario (ARCA simulado)' }
      : certificateItem(readiness.certificate, envLabel, active?.notAfter ?? null, now),
  ];

  if (active) {
    items.push({
      key: 'connection',
      href: '#certificado-arca',
      state: active.lastTestAt === null ? 'missing' : active.lastTestOk ? 'ok' : 'error',
      text:
        active.lastTestAt === null
          ? 'Conexión sin probar'
          : active.lastTestOk
            ? `Conexión probada el ${moment(active.lastTestAt).format('DD/MM/YYYY HH:mm')}`
            : 'La última prueba de conexión falló',
    });
  }

  const EnvIcon = environment === 'homologacion' ? FlaskConical : Landmark;

  return (
    <section aria-labelledby="fiscal-readiness-title" className="flex flex-col gap-3 border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 id="fiscal-readiness-title" className="text-lg font-semibold">
          Facturación electrónica
        </h3>
        <Badge variant="outline" className={cn('whitespace-nowrap', ENVIRONMENT_BADGE_STYLES[environment])}>
          <EnvIcon className="size-3.5" aria-hidden />
          {environment === 'homologacion' ? 'Homologación · sin validez fiscal' : 'Producción · con validez fiscal'}
        </Badge>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {items.map((item) => {
          const Icon = ITEM_ICONS[item.state];
          return (
            <li key={item.key}>
              <a
                href={item.href}
                className="focus-visible:ring-ring/50 inline-flex items-center gap-1.5 underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
              >
                <Icon className={cn('size-4 shrink-0', ITEM_ICON_STYLES[item.state])} aria-hidden />
                <span className="tabular-nums">{item.text}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <p className={cn('text-sm text-pretty', readiness.canIssue ? 'text-muted-foreground' : 'font-medium')}>
        {readiness.canIssue
          ? `Todo listo: podés emitir comprobantes en ${envLabel}.`
          : `Todavía no podés emitir: falta ${joinList(readiness.blockers)}.`}
      </p>
    </section>
  );
}

function certificateItem(
  state: FiscalDataOverview['readiness']['certificate'],
  envLabel: string,
  notAfter: string | null,
  now: Date
): ReadinessItem {
  const base = { key: 'certificate', href: '#certificado-arca' };
  switch (state) {
    case 'missing':
      return { ...base, state: 'missing', text: `Falta el certificado de ${envLabel}` };
    case 'pending':
      return { ...base, state: 'missing', text: `Certificado de ${envLabel} solicitado, falta cargarlo` };
    case 'expired':
      return { ...base, state: 'error', text: `El certificado de ${envLabel} está vencido` };
    case 'expiring': {
      const days = notAfter ? daysUntil(notAfter, now) : 0;
      return {
        ...base,
        state: 'warning',
        text: days === 1 ? 'El certificado vence mañana' : `El certificado vence en ${days} días`,
      };
    }
    case 'active':
      return {
        ...base,
        state: 'ok',
        text: `Certificado vigente hasta el ${notAfter ? moment(notAfter).format('DD/MM/YYYY') : '—'}`,
      };
  }
}
