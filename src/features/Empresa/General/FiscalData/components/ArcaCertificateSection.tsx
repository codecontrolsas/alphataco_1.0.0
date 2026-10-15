'use client';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { AlertTriangle, MonitorPlay, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import type { FiscalDataOverview } from '../actions/fiscal-data.server';
import { certificateState, daysUntil, type CertificateState } from '../lib/readiness';
import { ARCA_ENVIRONMENTS, ENVIRONMENT_LABELS } from '../schemas/fiscal-data';
import { FiscalSection } from './FiscalSection';
import { ArcaPortalInstructions } from './certificate/ArcaPortalInstructions';
import { CertificateUploadStep } from './certificate/CertificateUploadStep';
import { CertificateWizardStep, type StepStatus } from './certificate/CertificateWizardStep';
import { ConnectionTestStep } from './certificate/ConnectionTestStep';
import { CsrRequestForm, PendingCsrSummary } from './certificate/CsrRequestStep';

type ArcaEnvironment = (typeof ARCA_ENVIRONMENTS)[number];
type Certificates = FiscalDataOverview['certificates'];

const TOTAL_STEPS = 4;

const STEP_TITLES = [
  'Generá la solicitud (CSR)',
  'Subí la solicitud a ARCA',
  'Cargá el certificado',
  'Probá la conexión',
] as const;

type Props = {
  company: FiscalDataOverview['company'];
  activeEnvironment: ArcaEnvironment;
  initialEnvironment: ArcaEnvironment;
  certificates: Certificates;
  secretsKeyConfigured: boolean;
  /** ARCA simulado (modo demo): el certificado no se usa para emitir. El asistente sigue visible. */
  arcaSimulated: boolean;
  canUpdate: boolean;
  nowIso: string;
};

/**
 * Certificado de ARCA: asistente de 4 pasos en la misma página (sin modales), uno por ambiente.
 * El ambiente que se está configurando va en la URL (`?cert=produccion`) para el deep link; se
 * cambia con `history.replaceState` porque todos los datos ya llegaron del server.
 */
export function ArcaCertificateSection({
  company,
  activeEnvironment,
  initialEnvironment,
  certificates,
  secretsKeyConfigured,
  arcaSimulated,
  canUpdate,
  nowIso,
}: Props) {
  const [environment, setEnvironment] = useState<ArcaEnvironment>(initialEnvironment);

  const changeEnvironment = (value: string) => {
    const next = ARCA_ENVIRONMENTS.find((env) => env === value);
    if (!next) return; // ToggleGroup single manda '' al destildar el activo: se ignora.
    setEnvironment(next);
    const params = new URLSearchParams(window.location.search);
    params.set('cert', next);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  return (
    <FiscalSection
      id="certificado-arca"
      title="Certificado de ARCA"
      description="Cada ambiente usa su propio certificado. Con él el sistema se autentica en ARCA para emitir."
    >
      {arcaSimulated && (
        <div role="note" className="text-muted-foreground flex items-start gap-3 border px-4 py-3 text-sm">
          <MonitorPlay className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-pretty">
            Con ARCA simulado no hace falta cargar un certificado: podés emitir comprobantes de prueba sin él. Si lo
            configurás igual, se usa cuando el sistema deje el modo demo.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span id="cert-environment-label" className="text-sm font-medium">
          Ambiente que estás configurando
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={environment}
          onValueChange={changeEnvironment}
          aria-labelledby="cert-environment-label"
        >
          {ARCA_ENVIRONMENTS.map((env) => (
            <ToggleGroupItem key={env} value={env} className="px-4">
              {ENVIRONMENT_LABELS[env]}
              {env === activeEnvironment && <span className="text-muted-foreground text-xs font-normal">(activo)</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* key: el asistente arranca de cero por ambiente (plegados, foco, resultados en curso). */}
      <CertificateWizard
        key={environment}
        environment={environment}
        company={company}
        certificate={certificates[environment]}
        secretsKeyConfigured={secretsKeyConfigured}
        canUpdate={canUpdate}
        nowIso={nowIso}
      />
    </FiscalSection>
  );
}

function focusById(id: string) {
  document.getElementById(id)?.focus();
}

function CertificateWizard({
  environment,
  company,
  certificate,
  secretsKeyConfigured,
  canUpdate,
  nowIso,
}: {
  environment: ArcaEnvironment;
  company: FiscalDataOverview['company'];
  certificate: Certificates[ArcaEnvironment];
  secretsKeyConfigured: boolean;
  canUpdate: boolean;
  nowIso: string;
}) {
  const { active, pending } = certificate;
  const [requestOpen, setRequestOpen] = useState(false);

  const headingId = (step: number) => `cert-${environment}-step-${step}`;
  const aliasFieldId = `cert-${environment}-alias`;
  const envLabel = ENVIRONMENT_LABELS[environment].toLowerCase();

  const statuses: Record<1 | 2 | 3 | 4, StepStatus> = {
    1: pending || active ? 'done' : 'current',
    2: pending ? 'current' : active ? 'done' : 'locked',
    3: pending ? 'current' : active ? 'done' : 'locked',
    4: active ? 'current' : 'locked',
  };
  const currentStep = ([1, 2, 3, 4] as const).find((step) => statuses[step] === 'current') ?? 4;

  const state = certificateState({ hasPending: pending !== null, active }, new Date(nowIso));
  const defaultAlias =
    pending?.alias ?? active?.alias ?? `alphataco-${environment === 'homologacion' ? 'homo' : 'prod'}`;

  // "Renovar certificado": abre el paso 1 y lleva el foco al alias.
  const startRenewal = () => {
    flushSync(() => setRequestOpen(true));
    document.querySelector<HTMLInputElement>(`#${aliasFieldId} input`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {active && (
        <CertificateStatus state={state} active={active} envLabel={envLabel} nowIso={nowIso} onRenew={startRenewal} />
      )}

      <p className="text-muted-foreground text-sm md:hidden">
        Paso {currentStep} de {TOTAL_STEPS}: {STEP_TITLES[currentStep - 1]}
      </p>

      <ol className="flex flex-col">
        <CertificateWizardStep
          number={1}
          total={TOTAL_STEPS}
          title={STEP_TITLES[0]}
          headingId={headingId(1)}
          status={statuses[1]}
          lockedHint=""
          summary={
            pending ? (
              <PendingCsrSummary environment={environment} pending={pending} canUpdate={canUpdate} />
            ) : active ? (
              <p className="text-sm">
                Certificado activo con el alias <code className="bg-muted px-1 font-mono text-xs">{active.alias}</code>.
              </p>
            ) : null
          }
          collapsedLabel={pending ? 'Generar otra solicitud' : 'Generar solicitud de renovación'}
          expandedLabel="Ocultar"
          open={requestOpen}
          onOpenChange={setRequestOpen}
        >
          <CsrRequestForm
            environment={environment}
            company={company}
            defaultAlias={defaultAlias}
            hasPending={pending !== null}
            hasActive={active !== null}
            canUpdate={canUpdate}
            secretsKeyConfigured={secretsKeyConfigured}
            aliasFieldId={aliasFieldId}
            onGenerated={() => {
              setRequestOpen(false);
              focusById(headingId(2));
            }}
          />
        </CertificateWizardStep>

        <CertificateWizardStep
          number={2}
          total={TOTAL_STEPS}
          title={STEP_TITLES[1]}
          headingId={headingId(2)}
          status={statuses[2]}
          lockedHint="Disponible después del paso 1."
          summary={
            statuses[2] === 'done' ? <p className="text-muted-foreground text-sm">Hecho en el portal de ARCA.</p> : null
          }
          collapsedLabel="Ver instrucciones"
          expandedLabel="Ocultar instrucciones"
        >
          <ArcaPortalInstructions environment={environment} alias={pending?.alias ?? active?.alias ?? defaultAlias} />
        </CertificateWizardStep>

        <CertificateWizardStep
          number={3}
          total={TOTAL_STEPS}
          title={STEP_TITLES[2]}
          headingId={headingId(3)}
          status={statuses[3]}
          lockedHint="Disponible después del paso 1."
          summary={statuses[3] === 'done' && active ? <ActiveCertificateCard active={active} /> : null}
        >
          {statuses[3] === 'current' && (
            <CertificateUploadStep
              environment={environment}
              canUpdate={canUpdate}
              onUploaded={() => focusById(headingId(4))}
            />
          )}
        </CertificateWizardStep>

        <CertificateWizardStep
          number={4}
          total={TOTAL_STEPS}
          title={STEP_TITLES[3]}
          headingId={headingId(4)}
          status={statuses[4]}
          lockedHint="Disponible cuando cargues el certificado (paso 3)."
          isLast
        >
          {active && (
            <ConnectionTestStep
              // Un certificado nuevo descarta el resultado de la prueba anterior.
              key={active.activatedAt ?? active.notAfter}
              environment={environment}
              saved={{ ok: active.lastTestOk, checks: active.lastTestChecks, testedAt: active.lastTestAt }}
              canUpdate={canUpdate}
            />
          )}
        </CertificateWizardStep>
      </ol>
    </div>
  );
}

type ActiveCertificate = NonNullable<Certificates[ArcaEnvironment]['active']>;

/** Datos de solo lectura del certificado vigente (paso 3 completo). */
function ActiveCertificateCard({ active }: { active: ActiveCertificate }) {
  return (
    <dl className="grid grid-cols-1 gap-3 border p-4 text-sm sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-muted-foreground">Titular</dt>
        <dd className="font-mono text-xs break-all">{active.subject ?? '—'}</dd>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-muted-foreground">Emisor</dt>
        <dd className="font-mono text-xs break-all">{active.issuer ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Vigencia</dt>
        <dd className="tabular-nums">
          {active.notBefore
            ? `Válido del ${formatArgentinaDay(active.notBefore)} al ${formatArgentinaDay(active.notAfter)}`
            : `Válido hasta el ${formatArgentinaDay(active.notAfter)}`}
        </dd>
      </div>
      {active.activatedAt && (
        <div>
          <dt className="text-muted-foreground">Cargado</dt>
          <dd className="tabular-nums">{formatArgentinaDateTime(active.activatedAt)}</dd>
        </div>
      )}
    </dl>
  );
}

/** Contenedor del aviso de estado según la vigencia. Clases completas (Tailwind v4). */
const STATUS_BOX_STYLES: Record<'ok' | 'expiring' | 'expired', string> = {
  ok: 'border-border',
  expiring: 'border-warn/40 bg-warn-subtle text-warn-subtle-foreground',
  expired: 'border-danger/40 bg-danger-subtle text-danger-subtle-foreground',
};

/** Estado del certificado vigente, siempre arriba del asistente cuando hay uno cargado. */
function CertificateStatus({
  state,
  active,
  envLabel,
  nowIso,
  onRenew,
}: {
  state: CertificateState;
  active: ActiveCertificate;
  envLabel: string;
  nowIso: string;
  onRenew: () => void;
}) {
  const days = daysUntil(active.notAfter, new Date(nowIso));
  const expiry = formatArgentinaDay(active.notAfter);
  const tone = state === 'expired' ? 'expired' : state === 'expiring' ? 'expiring' : 'ok';
  const Icon = tone === 'expired' ? XCircle : tone === 'expiring' ? AlertTriangle : ShieldCheck;

  const message =
    tone === 'expired'
      ? `El certificado de ${envLabel} venció el ${expiry}. No podés emitir en ${envLabel} hasta renovarlo.`
      : `Certificado de ${envLabel} vigente hasta el ${expiry} (${days === 1 ? 'falta 1 día' : `faltan ${days} días`}).`;

  const lastTest =
    active.lastTestAt === null
      ? 'Todavía no probaste la conexión.'
      : `Última prueba: ${formatArgentinaDateTime(active.lastTestAt)}, ${active.lastTestOk ? 'correcta' : 'con errores'}.`;

  return (
    <div
      role="note"
      className={cn(
        'flex flex-col gap-3 border px-4 py-3 text-sm sm:flex-row sm:items-center',
        STATUS_BOX_STYLES[tone]
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="tabular-nums text-pretty">{message}</p>
        <p className={cn('tabular-nums', tone === 'ok' && 'text-muted-foreground')}>{lastTest}</p>
      </div>
      {tone !== 'ok' && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRenew}>
          Renovar certificado
        </Button>
      )}
    </div>
  );
}
