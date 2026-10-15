import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/lib/fiscal-data-overview.server';
import { daysUntil } from '@/features/Empresa/General/FiscalData/lib/readiness';
import { ENVIRONMENT_LABELS } from '@/features/Empresa/General/FiscalData/schemas/fiscal-data';
import { joinList } from '@/features/Empresa/General/FiscalData/utils/format';
import { cn } from '@/lib/utils';
import { AlertTriangle, CircleDashed, FlaskConical, MonitorPlay } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FISCAL_DATA_HREF } from '../utils/invoice-links';

type NoticeTone = 'neutral' | 'warning';

/** Clases escritas completas (Tailwind v4). Tono warn = mismo criterio que el estado del certificado en Datos fiscales. */
const NOTICE_STYLES: Record<NoticeTone, string> = {
  neutral: 'border-border text-foreground',
  warning: 'border-warn/35 bg-warn-subtle text-warn-subtle-foreground',
};

const LINK_CLASS =
  'font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Notice({ tone, icon, children }: { tone: NoticeTone; icon: ReactNode; children: ReactNode }) {
  return (
    <div role="note" className={cn('flex items-start gap-3 border px-4 py-3 text-sm', NOTICE_STYLES[tone])}>
      {icon}
      <p className="min-w-0 flex-1 text-pretty">{children}</p>
    </div>
  );
}

/**
 * Avisos persistentes de la tab Facturación (estáticos: `role="note"`, no se anuncian). Salen de
 * la misma lectura que Datos fiscales (`getFiscalDataOverview`, deduplicada con `cache`).
 *
 * Con ARCA simulado no se muestran el de homologación ni el de vencimiento del certificado: el
 * aviso de modo demo ya dice que nada tiene validez fiscal y el certificado no se usa.
 */
export async function InvoicingNotices() {
  const overview = await getFiscalDataOverview();
  const { readiness, environment, arcaSimulated } = overview;
  const envLabel = ENVIRONMENT_LABELS[environment].toLowerCase();
  const activeCertificate = overview.certificates[environment].active;

  const notices: ReactNode[] = [];

  if (arcaSimulated) {
    notices.push(
      <Notice key="simulated" tone="neutral" icon={<MonitorPlay className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        ARCA simulado (modo demo): los comprobantes no se informan a ARCA y no tienen validez fiscal.
      </Notice>
    );
  } else if (environment === 'homologacion') {
    notices.push(
      <Notice key="homologation" tone="neutral" icon={<FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        Estás en homologación: los comprobantes que emitas son de prueba y no tienen validez fiscal.
      </Notice>
    );
  }

  if (!readiness.canIssue) {
    notices.push(
      <Notice key="not-ready" tone="warning" icon={<CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        Todavía no podés emitir comprobantes en {envLabel}: falta {joinList(readiness.blockers)}.{' '}
        <Link href={FISCAL_DATA_HREF} className={LINK_CLASS}>
          Completar en Datos fiscales
        </Link>
      </Notice>
    );
  }

  if (!arcaSimulated && readiness.certificate === 'expiring' && activeCertificate) {
    const days = daysUntil(activeCertificate.notAfter, new Date());
    const expiry = moment(activeCertificate.notAfter).format('DD/MM/YYYY');
    notices.push(
      <Notice key="expiring" tone="warning" icon={<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        <span className="tabular-nums">
          {days === 1
            ? `El certificado de ${envLabel} vence mañana (${expiry}).`
            : `El certificado de ${envLabel} vence en ${days} días (${expiry}).`}
        </span>{' '}
        Cuando venza no vas a poder emitir.{' '}
        <Link href={`${FISCAL_DATA_HREF}&cert=${environment}#certificado-arca`} className={LINK_CLASS}>
          Renovar el certificado
        </Link>
      </Notice>
    );
  }

  if (notices.length === 0) return null;
  return <div className="flex flex-col gap-2">{notices}</div>;
}
