'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, CornerDownRight, Plus, UserRound, UserRoundX } from 'lucide-react';
import type { OrgChartCargo } from '../actions.server';
import { ORG_CHART_ISSUE_LABELS } from '../lib/org-chart-rules';
import { employeeLabel, type CargoNode, type SectorNode } from '../lib/org-chart-tree';

interface OrgChartTreeProps {
  roots: SectorNode[];
  sectorName: ReadonlyMap<string, string>;
  canCreate: boolean;
  canUpdate: boolean;
  /** Cargo resaltado desde el plano (hover/foco). */
  activeCargoId: string | null;
  onActivateCargo: (id: string | null) => void;
  onEditCargo: (cargo: OrgChartCargo) => void;
  onCreateCargo: (sectorId: string) => void;
}

/**
 * Vista de árbol del organigrama: es la vista accesible (teclado y lector de pantalla) y la única
 * en pantallas angostas. Sectores anidados por "depende de"; dentro, cargos anidados por "reporta a".
 */
export function OrgChartTree(props: OrgChartTreeProps) {
  return (
    <ul className="flex min-w-0 flex-col gap-3" aria-label="Sectores del organigrama">
      {props.roots.map((node) => (
        <SectorItem key={node.sector.id} node={node} {...props} />
      ))}
    </ul>
  );
}

function SectorItem({ node, ...props }: { node: SectorNode } & OrgChartTreeProps) {
  const { sector } = node;
  const headingId = `org-sector-${sector.id}`;
  const inactive = sector.is_active === false;

  return (
    <li className="min-w-0">
      <section
        aria-labelledby={headingId}
        className={cn('bg-card border-border/70 rounded-lg border', inactive && 'border-dashed opacity-80')}
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <h4 id={headingId} className="min-w-0 truncate text-sm font-semibold">
            {sector.name}
          </h4>
          {inactive ? <Badge variant="outline">Inactivo</Badge> : null}
          <span className="text-muted-foreground text-xs tabular-nums">
            {node.cargoCount === 0 ? 'Sin cargos' : node.cargoCount === 1 ? '1 cargo' : `${node.cargoCount} cargos`}
          </span>
          {props.canCreate && !inactive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto min-h-9"
              onClick={() => props.onCreateCargo(sector.id)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar cargo
              <span className="sr-only"> en {sector.name}</span>
            </Button>
          ) : null}
        </header>

        {node.cargos.length > 0 ? (
          <ul className="flex flex-col gap-1 p-2" aria-label={`Cargos de ${sector.name}`}>
            {node.cargos.map((cargoNode) => (
              <CargoItem key={cargoNode.cargo.id} node={cargoNode} {...props} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-3 py-3 text-sm">Este sector todavía no tiene cargos cargados.</p>
        )}
      </section>

      {node.children.length > 0 ? (
        <ul
          className="border-border mt-3 ml-3 flex min-w-0 flex-col gap-3 border-l pl-3 sm:ml-5 sm:pl-5"
          aria-label={`Sectores que dependen de ${sector.name}`}
        >
          {node.children.map((child) => (
            <SectorItem key={child.sector.id} node={child} {...props} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CargoItem({ node, ...props }: { node: CargoNode } & OrgChartTreeProps) {
  const { cargo, outsideBoss } = node;
  const active = props.activeCargoId === cargo.id;
  const hasIssues = cargo.issues.length > 0;

  const body = (
    <>
      {cargo.employee ? (
        <UserRound className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <UserRoundX className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{cargo.position.name}</span>
        <span className={cn('truncate text-xs', cargo.employee ? 'text-foreground/80' : 'text-muted-foreground')}>
          {cargo.employee ? employeeLabel(cargo.employee) : 'Vacante'}
        </span>
        {outsideBoss ? (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <CornerDownRight className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Reporta a {outsideBoss.position.name} ({props.sectorName.get(outsideBoss.sector_id) ?? 'otro sector'})
            </span>
          </span>
        ) : null}
      </span>
      {hasIssues ? (
        <span className="text-destructive mt-0.5 shrink-0" title={cargo.issues.map((i) => ORG_CHART_ISSUE_LABELS[i]).join('. ')}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <span className="sr-only">Desfasado: {cargo.issues.map((i) => ORG_CHART_ISSUE_LABELS[i]).join('. ')}</span>
        </span>
      ) : null}
    </>
  );

  const rowClass = cn(
    'flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left',
    active && 'bg-accent',
    hasIssues && 'ring-destructive/40 ring-1'
  );

  return (
    <li className="min-w-0">
      {props.canUpdate ? (
        <button
          type="button"
          className={cn(rowClass, 'hover:bg-accent focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2')}
          onClick={() => props.onEditCargo(cargo)}
          onMouseEnter={() => props.onActivateCargo(cargo.id)}
          onMouseLeave={() => props.onActivateCargo(null)}
          onFocus={() => props.onActivateCargo(cargo.id)}
          onBlur={() => props.onActivateCargo(null)}
        >
          {body}
          <span className="sr-only">. Editar cargo</span>
        </button>
      ) : (
        <div className={rowClass} onMouseEnter={() => props.onActivateCargo(cargo.id)} onMouseLeave={() => props.onActivateCargo(null)}>
          {body}
        </div>
      )}
      {node.children.length > 0 ? (
        <ul className="border-border/70 ml-4 flex flex-col gap-1 border-l pl-2" aria-label={`Reportan a ${cargo.position.name}`}>
          {node.children.map((child) => (
            <CargoItem key={child.cargo.id} node={child} {...props} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
