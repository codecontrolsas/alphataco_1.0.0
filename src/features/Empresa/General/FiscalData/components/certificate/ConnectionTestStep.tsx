'use client';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { testArcaConnection } from '../../actions/arca-credentials.server';
import type { ConnectionCheck } from '../../actions/fiscal-data.server';
import type { ARCA_ENVIRONMENTS } from '../../schemas/fiscal-data';
import { CopyTextButton } from './CopyTextButton';

export type ConnectionResult = { ok: boolean | null; checks: ConnectionCheck[]; testedAt: string | null };

/**
 * Paso 4: prueba real contra ARCA. El resultado vive en una región `role="status"` que existe
 * desde el primer render (una región que se monta junto con el texto no se anuncia). Al entrar a
 * la página se muestra el último resultado guardado.
 */
export function ConnectionTestStep({
  environment,
  saved,
  canUpdate,
}: {
  environment: (typeof ARCA_ENVIRONMENTS)[number];
  saved: ConnectionResult;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [testing, startTest] = useTransition();
  // Resultado de esta sesión; si no hay, el guardado. El componente se monta por ambiente
  // (key), así una prueba en curso no pisa el resultado del otro ambiente.
  const [latest, setLatest] = useState<ConnectionResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const result = latest ?? saved;

  const runTest = () => {
    setActionError(null);
    startTest(async () => {
      const response = await testArcaConnection(environment);
      if (!response.ok) {
        setActionError(response.error);
        return;
      }
      setLatest({ ok: response.data.ok, checks: response.data.checks, testedAt: new Date().toISOString() });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="brand" disabled={!canUpdate || testing} onClick={runTest}>
          <LoadingSwap isLoading={testing}>{testing ? 'Probando conexión…' : 'Probar conexión'}</LoadingSwap>
        </Button>
        {result.testedAt && (
          <p className="text-muted-foreground text-sm tabular-nums">
            Última prueba: {moment(result.testedAt).format('DD/MM/YYYY HH:mm')}
            {result.ok === true ? ', correcta.' : result.ok === false ? ', con errores.' : '.'}
          </p>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      )}

      <div role="status" className="flex flex-col gap-2">
        {testing ? (
          <p className="text-muted-foreground text-sm">Probando la conexión con ARCA…</p>
        ) : result.checks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no probaste la conexión con este certificado.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-sm">
                {check.ok ? (
                  <CheckCircle2 className="text-brand-ink mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="sr-only">{check.ok ? 'Correcto:' : 'Con error:'}</span>
                  <span className="text-pretty">{check.label}</span>
                  {check.detail && <span className="text-muted-foreground text-pretty">{check.detail}</span>}
                  {check.technical && <TechnicalDetail technical={check.technical} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TechnicalDetail({ technical }: { technical: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="link" size="sm" className="group h-auto w-fit px-0 text-xs">
          Respuesta técnica de ARCA
          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col items-start gap-2 pt-2">
        <pre className="bg-muted max-w-full overflow-x-auto p-3 font-mono text-xs break-all whitespace-pre-wrap">
          {technical}
        </pre>
        <CopyTextButton
          value={technical}
          label="Copiar respuesta"
          successMessage="Respuesta copiada al portapapeles."
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
