import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import Link from 'next/link';
import { loadComplianceCounts, type ComplianceCounts, type ComplianceSource } from '../lib/document-compliance.server';
import { statusListHref, type DocumentResourceKind } from '../lib/document-list-links';
import { ComplianceDonut } from './ComplianceDonut';

const KIND_UI = {
  employees: { title: 'Personal', noun: 'empleados', listModule: 'empleados', listTab: 'employees' },
  vehicles: { title: 'Equipos', noun: 'equipos', listModule: 'equipos', listTab: 'equipos' },
} as const satisfies Record<
  DocumentResourceKind,
  { title: string; noun: string; listModule: 'empleados' | 'equipos'; listTab: string }
>;

/** Filas de la leyenda: estado del enum de Prisma, texto y tono del sistema. */
const LEGEND = [
  { status: 'Completo', key: 'complete', label: 'En regla', dot: 'bg-ok' },
  { status: 'Completo_con_doc_vencida', key: 'expired', label: 'Con documentos vencidos', dot: 'bg-warn' },
  { status: 'Incompleto', key: 'incomplete', label: 'Con documentos faltantes', dot: 'bg-danger' },
] as const satisfies ReadonlyArray<{ status: string; key: keyof ComplianceCounts; label: string; dot: string }>;

const rowClass = 'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm';

function KindPanel({
  kind,
  source,
  canOpenList,
}: {
  kind: DocumentResourceKind;
  source: Exclude<ComplianceSource, { status: 'forbidden' }>;
  canOpenList: boolean;
}) {
  const ui = KIND_UI[kind];

  if (source.status === 'error') {
    return (
      <StateBlock
        variant="error"
        title={`No se pudo calcular el estado de ${ui.noun}`}
        description="Probá recargar la página."
      />
    );
  }

  const { counts } = source;
  if (counts.total === 0) {
    return <StateBlock variant="empty" title={`Sin ${ui.noun} activos con documentación exigida`} />;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <ComplianceDonut counts={counts} />
      <ul className="w-full min-w-0 space-y-0.5">
        {LEGEND.map((item) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', item.dot)} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="font-mono font-semibold tabular-nums">{counts[item.key]}</span>
            </>
          );
          return (
            <li key={item.status}>
              {canOpenList && counts[item.key] > 0 ? (
                <Link
                  href={statusListHref(kind, item.status)}
                  className={cn(rowClass, 'hover:bg-muted focus-visible:ring-ring outline-none focus-visible:ring-2')}
                >
                  {content}
                </Link>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
        <li className={cn(rowClass, 'text-muted-foreground border-t pt-2')}>
          <span>Total {ui.noun} activos</span>
          <span className="font-mono tabular-nums">{counts.total}</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Widget "Estado documental": cuántos empleados y equipos activos están en regla, con documentos vencidos o
 * con faltantes. Usa el estado que ya calcula y guarda el motor de cumplimiento (el mismo de las tarjetas de
 * los listados) con una consulta agrupada por tipo de recurso; muestra solo lo que el usuario puede ver.
 */
export async function DocumentComplianceWidget() {
  const [employees, vehicles, canOpenEmployees, canOpenVehicles] = await Promise.all([
    loadComplianceCounts('employees'),
    loadComplianceCounts('vehicles'),
    checkPermissionServer(KIND_UI.employees.listModule, KIND_UI.employees.listTab, 'view'),
    checkPermissionServer(KIND_UI.vehicles.listModule, KIND_UI.vehicles.listTab, 'view'),
  ]);

  const panels = [
    { kind: 'employees', source: employees, canOpenList: canOpenEmployees },
    { kind: 'vehicles', source: vehicles, canOpenList: canOpenVehicles },
  ] as const;
  const visible = panels.flatMap((panel) =>
    panel.source.status === 'forbidden' ? [] : [{ ...panel, source: panel.source }]
  );

  if (visible.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver esta información"
        description="Pedile a un administrador que te habilite el acceso a la documentación de personal o de equipos."
      />
    );
  }

  return (
    <div className={cn('grid gap-6', visible.length > 1 && 'lg:grid-cols-2 lg:divide-x lg:gap-0')}>
      {visible.map(({ kind, source, canOpenList }) => (
        <section
          key={kind}
          aria-labelledby={`compliance-${kind}`}
          className={cn('min-w-0 space-y-3', visible.length > 1 && 'lg:px-5 lg:first:pl-0 lg:last:pr-0')}
        >
          <h3 id={`compliance-${kind}`} className="text-sm font-semibold">
            {KIND_UI[kind].title}
          </h3>
          <KindPanel kind={kind} source={source} canOpenList={canOpenList} />
        </section>
      ))}
    </div>
  );
}
