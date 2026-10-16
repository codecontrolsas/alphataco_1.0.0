'use client';

import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';

import { previewTypeRule, type RulePreviewSampleItem } from '../actions/queries.server';

// ============================================
// TIPOS
// ============================================

interface RulePreviewPanelProps {
  /** `Persona` o `Equipos`: los tipos de empresa no tienen condiciones. */
  applies: 'Persona' | 'Equipos';
  /** Condiciones del borrador tal como se guardarían (`selectionsToConditionsJson`). */
  conditionsJson: Parameters<typeof previewTypeRule>[1];
  /** En edición, el tipo guardado: permite mostrar cuántos empiezan y cuántos dejan de exigirlo. */
  documentTypeId?: string;
}

// ============================================
// HELPERS
// ============================================

/** Legajo en el formato de la regla `employee-file-number`: `[legajo] Apellido, Nombre`. */
function sampleLabel(item: RulePreviewSampleItem): string {
  if (item.kind === 'Persona') {
    return `[${item.fileNumber ?? 's/legajo'}] ${item.lastname}, ${item.firstname}`;
  }
  const model = [item.brand, item.model].filter(Boolean).join(' ');
  const parts = [
    item.domain ?? 'Sin dominio',
    model || null,
    item.internNumber ? `Interno ${item.internNumber}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

// ============================================
// COMPONENTE
// ============================================

/**
 * "Probar regla": panel dentro del formulario del tipo (sin modal) que, sin guardar nada, evalúa las
 * condiciones en edición y muestra a cuántos empleados o equipos de la empresa se les exigiría, con una
 * muestra. El resultado es de las condiciones que había al probar: si cambian, se pide volver a probar.
 */
export function _RulePreviewPanel({ applies, conditionsJson, documentTypeId }: RulePreviewPanelProps) {
  const currentKey = useMemo(
    () => JSON.stringify([applies, conditionsJson, documentTypeId ?? null]),
    [applies, conditionsJson, documentTypeId]
  );
  // Clave de las condiciones con las que se probó por última vez (null = todavía no se probó).
  const [probedKey, setProbedKey] = useState<string | null>(null);
  const isCurrent = probedKey !== null && probedKey === currentKey;

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['doc-type-rule-preview', probedKey],
    queryFn: () => previewTypeRule(applies, conditionsJson, documentTypeId),
    enabled: isCurrent,
    staleTime: 0,
    retry: false,
  });

  const resourceLabel = applies === 'Persona' ? 'empleados' : 'equipos';
  const resourceOne = applies === 'Persona' ? 'empleado' : 'equipo';
  const isStale = probedKey !== null && !isCurrent;

  const handleTest = () => {
    if (isCurrent) void refetch();
    else setProbedKey(currentKey);
  };

  const testButton = (
    <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={isFetching}>
      {isFetching ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : probedKey === null ? (
        <FlaskConical aria-hidden />
      ) : (
        <RefreshCw aria-hidden />
      )}
      {probedKey === null ? 'Probar regla' : 'Volver a probar'}
    </Button>
  );

  return (
    <section aria-labelledby="rule-preview-title" className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id="rule-preview-title" className="text-sm font-semibold">
            Probar regla
          </h3>
          <p className="text-muted-foreground text-sm text-pretty">
            Muestra a quiénes se les exigiría con las condiciones actuales. No guarda nada.
          </p>
        </div>
        {testButton}
      </div>

      <div aria-live="polite" aria-busy={isFetching}>
        {isStale && (
          <p className="bg-warn-subtle text-warn-subtle-foreground rounded-md px-3 py-2 text-sm" role="status">
            Cambiaste las condiciones. El resultado anterior ya no corresponde: volvé a probar.
          </p>
        )}

        {isCurrent && isFetching && (
          <div className="space-y-2" role="status" aria-label="Probando la regla">
            <Skeleton className="h-5 w-2/3" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}

        {isCurrent && !isFetching && error && (
          <StateBlock
            variant="error"
            title="No se pudo probar la regla"
            description={error instanceof Error ? error.message : 'Error desconocido'}
            className="py-6"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            }
          />
        )}

        {isCurrent && !isFetching && !error && data && (
          <div className="space-y-3">
            <p className="text-sm">
              Se le exigiría a <strong className="tabular-nums">{data.matching}</strong> de{' '}
              <span className="tabular-nums">{data.totalResources}</span> {resourceLabel} de la empresa.
              {documentTypeId && (data.startsRequiring > 0 || data.stopsRequiring > 0) && (
                <>
                  {' '}
                  Respecto de lo guardado, <span className="tabular-nums">{data.startsRequiring}</span>{' '}
                  {plural(data.startsRequiring, 'empezaría', 'empezarían')} a exigirlo y{' '}
                  <span className="tabular-nums">{data.stopsRequiring}</span>{' '}
                  {plural(data.stopsRequiring, 'dejaría', 'dejarían')} de exigirlo.
                </>
              )}
            </p>

            {data.matching === 0 ? (
              <StateBlock
                variant="empty"
                title={`Ningún ${resourceOne} cumple estas condiciones`}
                description="Revisá las condiciones: con esta regla el tipo no se le exigiría a nadie."
                className="py-6"
              />
            ) : (
              <div>
                <p className="text-muted-foreground mb-1 text-sm">
                  {data.matching > data.sample.length
                    ? `Primeros ${data.sample.length} (orden alfabético):`
                    : 'Quiénes son:'}
                </p>
                <ol
                  aria-label={`Muestra de ${resourceLabel} que cumplen la regla`}
                  className="divide-y rounded-md border"
                >
                  {data.sample.map((item) => (
                    <li key={item.id} className="px-3 py-1.5 text-sm">
                      {sampleLabel(item)}
                    </li>
                  ))}
                </ol>
                {data.matching > data.sample.length && (
                  <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                    y {data.matching - data.sample.length} más
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
