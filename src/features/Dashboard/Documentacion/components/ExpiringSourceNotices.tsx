import { StateBlock } from '@/shared/components/common/StateBlock';
import type { ExpiringOverview, ExpiringSource } from '../lib/expiring-overview.server';

export const KIND_LABEL = { employees: 'Personal', vehicles: 'Equipos' } as const;

/** Fuentes disponibles para el usuario; las que no puede ver se omiten sin aviso. */
export function visibleSources(overview: ExpiringOverview) {
  const sources = [
    { kind: 'employees', source: overview.employees },
    { kind: 'vehicles', source: overview.vehicles },
  ] as const;
  return sources.filter(({ source }) => source.status !== 'forbidden');
}

/** Estados comunes de los widgets de vencimientos: sin permiso en ninguna fuente, o error de carga. */
export function ExpiringSourcesState({
  sources,
}: {
  sources: ReadonlyArray<{ kind: 'employees' | 'vehicles'; source: ExpiringSource }>;
}) {
  if (sources.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver esta información"
        description="Pedile a un administrador que te habilite el acceso a los vencimientos de personal o de equipos."
      />
    );
  }
  const failed = sources.filter(({ source }) => source.status === 'error');
  if (failed.length === 0) return null;
  return (
    <p role="alert" className="bg-danger-subtle text-danger-subtle-foreground rounded-md px-3 py-2 text-sm">
      No se pudieron calcular los vencimientos de{' '}
      {failed.map(({ kind }) => KIND_LABEL[kind].toLowerCase()).join(' ni de ')}. Probá recargar la página.
    </p>
  );
}
