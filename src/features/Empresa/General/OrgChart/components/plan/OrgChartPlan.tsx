'use client';

import * as k from '@/shared/components/iso/iso-kit';
import { Dots, FaceText, Line, Solid } from '@/shared/components/iso/react/draw';
import '@/shared/components/iso/iso.css';
import { cn } from '@/lib/utils';
import {
  Fragment,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { OrgChartCargo, OrgChartData } from '../../actions.server';
import { ORG_CHART_ISSUE_LABELS } from '../../lib/org-chart-rules';
import { employeeLabel, type SectorNode } from '../../lib/org-chart-tree';
import { TRAY_H, TRAY_LIFT, planBench, type PlannedTray } from './plan-layout';
import './org-plan.css';

const WIDTH = 760;
// Azimut del plano: el banco corre a lo largo de x, que así se ve casi horizontal (lado largo).
const AZIMUTH = 58;
const HEIGHT = 470;
const BASE_H = 7;
const FOOT_H = 4;
const TOKEN_R = 8.6;
const BODY_R = 6;
const BODY_H = 14;
const CAP_H = 2.2;
const LIFT = 3.5;
const LABEL_SIZE = 6.4;
const STEP_JOINT = 5;

interface OrgChartPlanProps {
  roots: SectorNode[];
  data: OrgChartData;
  sectorName: ReadonlyMap<string, string>;
  activeCargoId: string | null;
  onActivateCargo: (id: string | null) => void;
  onOpenCargo: (id: string) => void;
  canUpdate: boolean;
}

/** Recorta el nombre del sector para que entre en la placa (fuente monoespaciada). */
function fitName(name: string, width: number) {
  const max = Math.max(4, Math.floor((width - 6) / (LABEL_SIZE * 0.62)));
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Cadena de mando de un cargo: él y todos sus superiores (cortada si hubiera un ciclo). */
function chainOf(id: string | null, byId: ReadonlyMap<string, OrgChartCargo>) {
  const chain = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !chain.has(current.id)) {
    chain.add(current.id);
    current = current.reports_to_id ? byId.get(current.reports_to_id) : undefined;
  }
  return chain;
}

/**
 * Plano isométrico del organigrama (kit de Anatomy): un banco escalonado con una bandeja por sector
 * y una pieza por cargo. El dibujo es estático; lo único que cambia con la interacción es qué pieza
 * se ilumina, cuál se levanta y qué trazas de la cadena de mando se encienden.
 */
export function OrgChartPlan({
  roots,
  data,
  sectorName,
  activeCargoId,
  onActivateCargo,
  onOpenCargo,
  canUpdate,
}: OrgChartPlanProps) {
  const hintId = useId();
  const [hoverSectorId, setHoverSectorId] = useState<string | null>(null);

  const bench = useMemo(() => planBench(roots), [roots]);

  const P = useMemo(() => {
    const points: k.Point3[] = [
      ...bench.base.map(([x, y]) => [x, y, -BASE_H - FOOT_H] as k.Point3),
      ...bench.base.map(([x, y]) => [x, y, bench.topZ + TRAY_LIFT + TRAY_H + BODY_H + CAP_H + LIFT] as k.Point3),
    ];
    return k.fitProjection(points, WIDTH, HEIGHT, { pad: 18, azimuth: AZIMUTH });
  }, [bench]);

  const cargoById = useMemo(() => new Map(data.cargos.map((cargo) => [cargo.id, cargo])), [data.cargos]);
  const chain = useMemo(() => chainOf(activeCargoId, cargoById), [activeCargoId, cargoById]);
  const activeCargo = activeCargoId ? cargoById.get(activeCargoId) : undefined;

  /** Orden de navegación con teclado: el mismo que el árbol (bandeja por bandeja, superior primero). */
  const keyboardOrder = useMemo(
    () => [...bench.trays].sort((a, b) => a.level - b.level || a.s - b.s).flatMap((tray) => tray.sockets.map((socket) => socket.cargo.id)),
    [bench.trays]
  );

  // ── Piezas estáticas (no dependen de la interacción) ──────────────────────────────────────────
  const staticArt = useMemo(() => {
    const at = (point: k.Point3) => k.iso(point, P);
    const out: ReactNode[] = [];

    // Base sobre patas, con su ranura, tornillos y una regla al frente.
    const baseRing = bench.base;
    out.push(<path key="halo" className="iso-halo" d={k.extrude(baseRing, -BASE_H - FOOT_H, BASE_H, P).fill} />);
    const feet = [0.1, 0.9].flatMap((u) => [0.1, 0.9].map((w) => lerpRing(baseRing, u, w)));
    feet
      .sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))
      .forEach(([x, y], index) => {
        out.push(<Solid key={`foot-f-${index}`} paths={k.cylinder(x, y, 7, -BASE_H - FOOT_H, 1.4, P, 28)} tone="lo" />);
        out.push(<Solid key={`foot-${index}`} paths={k.cylinder(x, y, 5, -BASE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28)} tone="mid" />);
      });
    out.push(<Solid key="base" paths={k.extrude(baseRing, -BASE_H, BASE_H, P, { bevel: 1.2 })} tone="mid" />);
    const screws = [0.04, 0.96].flatMap((u) => [0.04, 0.96].map((w) => lerpRing(baseRing, u, w)));
    out.push(<Line key="screw-rings" d={screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join('')} tone="lo" />);
    out.push(<Dots key="screws" points={screws.map(([x, y]) => at([x, y, 0]))} size={0.5} />);

    // Regla al frente de la base (borde v máximo): marca cada nivel del banco.
    const front0 = lerpRing(baseRing, 0.06, 0.985);
    const front1 = lerpRing(baseRing, 0.94, 0.985);
    const ruler = lineRing(front0, front1, 3.4);
    out.push(<Solid key="ruler" paths={k.extrude(ruler, 0, 0.6, P)} tone="lo" crease="none" />);
    const tickCount = 48;
    const minor: string[] = [];
    const major: string[] = [];
    for (let index = 0; index <= tickCount; index += 1) {
      const t = index / tickCount;
      const along = mix(lerpRing(ruler, 0, 0), lerpRing(ruler, 1, 0), t);
      const length = index % 6 === 0 ? 2.6 : 1.4;
      const inward = towardInside(ruler, length);
      (index % 6 === 0 ? major : minor).push(
        k.pathOf([at([along[0], along[1], 0.6]), at([along[0] + inward[0], along[1] + inward[1], 0.6])])
      );
    }
    out.push(<Line key="ticks-minor" d={minor.join('')} tone="lo" />);
    out.push(<Line key="ticks-major" d={major.join('')} tone="mid" />);

    // Escalones, del más alto (atrás) al más bajo (adelante), con la junta del canto.
    for (const step of bench.steps) {
      out.push(<Solid key={`step-${step.level}`} paths={k.extrude(step.ring, 0, step.top, P, { bevel: 0.8 })} tone="mid" />);
      out.push(<Line key={`step-groove-${step.level}`} d={k.onTop(insetRing(step.ring, 4), step.top, P, true)} tone="faint" />);
      // Tornillos en las esquinas de la tapa del escalón, con su arandela.
      const stepScrews = insetRing(step.ring, 8);
      out.push(<Line key={`step-washers-${step.level}`} d={stepScrews.map(([x, y]) => k.ring(x, y, 1.8, step.top, P, 14)).join('')} tone="lo" />);
      out.push(<Dots key={`step-screws-${step.level}`} points={stepScrews.map(([x, y]) => at([x, y, step.top]))} size={0.45} />);
      // Junta horizontal en el frente del escalón (cara y máxima), de canto a canto.
      if (step.top > STEP_JOINT * 2) {
        const [front0, front1] = [step.ring[3], step.ring[2]];
        out.push(
          <Line key={`step-joint-${step.level}`} d={k.pathOf([at([front0[0], front0[1], step.top - STEP_JOINT]), at([front1[0], front1[1], step.top - STEP_JOINT])])} tone="faint" />
        );
      }
    }
    return out;
  }, [bench, P]);

  // ── Canaletas de dependencia entre sectores ──────────────────────────────────────────────────
  const activeSectorPath = useMemo(() => {
    // Sectores de la cadena de mando del cargo activo: sus canaletas se encienden.
    const sectors = new Set<string>();
    for (const id of chain) {
      const cargo = cargoById.get(id);
      if (cargo) sectors.add(cargo.sector_id);
    }
    return sectors;
  }, [chain, cargoById]);

  const conduits = bench.conduits.map((conduit) => {
    const at = (point: k.Point3) => k.iso(point, P);
    const lit = activeSectorPath.has(conduit.parentId) && conduit.childIds.some((id) => activeSectorPath.has(id));
    const tone = lit ? 'lit' : 'mid';
    return (
      <g key={`conduit-${conduit.parentId}`} className="iso-wire" data-tone={tone}>
        <Line d={k.pathOf(conduit.trunk.map(at))} tone={tone} />
        <Line d={k.pathOf(conduit.bus.map(at))} tone={tone} />
        {conduit.drops.map((drop) => {
          const dropLit = lit && activeSectorPath.has(drop.childId);
          return <Line key={drop.childId} d={k.pathOf(drop.points.map(at))} tone={dropLit ? 'lit' : 'mid'} />;
        })}
        {[conduit.trunk[0], conduit.trunk[3], ...conduit.drops.map((drop) => drop.points[1])].map((point, index) => {
          const [x, y] = at(point);
          return <circle key={index} className="iso-wire-end" cx={x} cy={y} r={1.1} />;
        })}
      </g>
    );
  });

  // ── Bandejas y piezas, de atrás hacia adelante ────────────────────────────────────────────────
  const trays = [...bench.trays].sort((a, b) => a.v - b.v);

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    const cargo = target.closest('[data-cargo]')?.getAttribute('data-cargo') ?? null;
    const sector = target.closest('[data-sector]')?.getAttribute('data-sector') ?? null;
    if (cargo !== activeCargoId) onActivateCargo(cargo);
    if (sector !== hoverSectorId) setHoverSectorId(sector);
  };

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const cargo = (event.target as Element).closest('[data-cargo]')?.getAttribute('data-cargo');
    if (cargo && canUpdate) onOpenCargo(cargo);
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardOrder.length === 0) return;
    const index = activeCargoId ? keyboardOrder.indexOf(activeCargoId) : -1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % keyboardOrder.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index <= 0 ? keyboardOrder.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = keyboardOrder.length - 1;
    if (next !== null) {
      event.preventDefault();
      onActivateCargo(keyboardOrder[next]);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && activeCargoId && canUpdate) {
      event.preventDefault();
      onOpenCargo(activeCargoId);
    }
    if (event.key === 'Escape') onActivateCargo(null);
  };

  const vacantCount = data.cargos.filter((cargo) => !cargo.employee).length;
  const summary = `${bench.trays.length} ${bench.trays.length === 1 ? 'sector' : 'sectores'} · ${data.cargos.length} ${data.cargos.length === 1 ? 'cargo' : 'cargos'} · ${vacantCount} ${vacantCount === 1 ? 'vacante' : 'vacantes'}`;
  const readout = activeCargo
    ? `${sectorName.get(activeCargo.sector_id) ?? 'Sector'} · ${activeCargo.position.name} · ${activeCargo.employee ? employeeLabel(activeCargo.employee) : 'Vacante'}${activeCargo.issues.length ? ` · ${ORG_CHART_ISSUE_LABELS[activeCargo.issues[0]]}` : ''}`
    : hoverSectorId
      ? `${sectorName.get(hoverSectorId) ?? 'Sector'} · ${bench.trays.find((tray) => tray.sectorId === hoverSectorId)?.sockets.length ?? 0} cargos`
      : summary;

  return (
    <figure className="iso org-plan min-w-0">
      <div className="iso-plate org-plan-plate">
        <div className="iso-plate-corners">
          <span className="iso-plate-corner" data-corner="fig" aria-hidden="true">
            Fig 1
          </span>
          <span className="iso-plate-corner" data-corner="title" aria-hidden="true">
            Organigrama
          </span>
          <span className="iso-plate-corner" data-corner="hint" aria-hidden="true">
            {canUpdate ? 'Flechas · Enter edita' : 'Mouse o flechas'}
          </span>
          <span className="iso-plate-corner org-plan-readout" data-corner="readout" role="status" aria-live="polite">
            {readout}
          </span>
        </div>
        <div
          className="iso-stage org-plan-stage"
          tabIndex={0}
          role="group"
          aria-roledescription="plano del organigrama"
          aria-label={`Plano del organigrama: ${summary}`}
          aria-describedby={hintId}
          onKeyDown={handleKey}
          onBlur={() => onActivateCargo(null)}
        >
          <svg
            className="iso-svg"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            aria-hidden="true"
            focusable="false"
            onPointerMove={handlePointer}
            onPointerLeave={() => {
              onActivateCargo(null);
              setHoverSectorId(null);
            }}
            onClick={handleClick}
          >
            {staticArt}
            {conduits}
            {trays.map((tray) => (
              <TrayArt
                key={tray.sectorId}
                tray={tray}
                P={P}
                activeCargoId={activeCargoId}
                chain={chain}
                hovered={hoverSectorId === tray.sectorId}
                clickable={canUpdate}
              />
            ))}
          </svg>
        </div>
        <span id={hintId} className="sr-only">
          Flechas para recorrer los cargos, Enter para editar el cargo elegido, Escape para soltarlo. La misma
          información está en la lista de al lado.
        </span>
      </div>
      <figcaption className="iso-legend">
        <span className="iso-caption">
          Cada bandeja es un sector y cada escalón, un nivel de dependencia. Las piezas son los cargos: con tapa si
          tienen titular, encastre vacío si están vacantes; un aro rojo marca un cargo desfasado.
        </span>
      </figcaption>
    </figure>
  );
}

// ============================================================================
// Bandeja de un sector con sus piezas
// ============================================================================

function TrayArt({
  tray,
  P,
  activeCargoId,
  chain,
  hovered,
  clickable,
}: {
  tray: PlannedTray;
  P: k.Projection;
  activeCargoId: string | null;
  chain: ReadonlySet<string>;
  hovered: boolean;
  clickable: boolean;
}) {
  const at = (point: k.Point3) => k.iso(point, P);
  const floor = tray.floorZ;
  const z0 = floor + TRAY_LIFT;
  const top = z0 + TRAY_H;
  const { plan, label } = tray;

  const feet = k
    .corners(plan, 7)
    .sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

  const socketByCargo = new Map(tray.sockets.map((socket) => [socket.cargo.id, socket.center]));

  // Trazas de reporte dentro de la bandeja: de cada pieza a la de su superior, sobre la tapa.
  const traces = tray.sockets
    .filter((socket) => socket.cargo.reports_to_id && socketByCargo.has(socket.cargo.reports_to_id))
    .map((socket) => {
      const boss = socketByCargo.get(socket.cargo.reports_to_id as string) as k.Plane;
      const lit = chain.has(socket.cargo.id) && chain.has(socket.cargo.reports_to_id as string);
      // Ruta en L por las calles entre encastres: primero en x, después en y.
      const corner: k.Plane = [boss[0], socket.center[1]];
      return { id: socket.cargo.id, d: k.onTop([socket.center, corner, boss], top, P), lit };
    });

  const sockets = [...tray.sockets].sort(
    (a, b) => k.depthOf([a.center[0], a.center[1], 0], P) - k.depthOf([b.center[0], b.center[1], 0], P)
  );

  return (
    <g data-sector={tray.sectorId} className={cn('org-plan-tray', tray.inactive && 'is-inactive', hovered && 'is-hovered')}>
      <path className="iso-halo" d={k.haloOf(k.insetPlan(plan, 3), floor, 0.1, P)} style={{ filter: 'blur(4px)' }} />
      {feet.map(([x, y], index) => (
        <Solid key={`foot-${index}`} paths={k.cylinder(x, y, 2.6, floor, TRAY_LIFT, P, 18)} tone="lo" crease="none" />
      ))}
      <Solid paths={k.slabOf(plan, z0, TRAY_H, P, 6, 0.8)} tone={tray.inactive ? 'lo' : 'mid'} />
      <Line d={k.planOutline(k.insetPlan(plan, 3.4), top, P, 6)} tone="faint" />
      <Dots points={k.corners(plan, 4.4).map(([x, y]) => at([x, y, top]))} size={0.45} tone="lo" />

      {/* Placa del nombre, sobre el borde delantero. */}
      <Solid paths={k.slabOf(label, top, 0.8, P, 3)} tone="lo" crease="none" />
      <Dots
        points={[at([label.x + 2.2, label.y + label.d / 2, top + 0.8]), at([label.x + label.w - 2.2, label.y + label.d / 2, top + 0.8])]}
        size={0.4}
        tone="lo"
      />
      <FaceText
        transform={k.topMatrix([label.x + label.w / 2, label.y + label.d / 2 + LABEL_SIZE * 0.35], top + 0.8, P, 'x')}
        size={LABEL_SIZE}
        tone={hovered ? 'hi' : 'mid'}
        anchor="middle"
      >
        {fitName(tray.name, label.w - 8)}
      </FaceText>

      {traces.map((trace) => (
        <Line key={`trace-${trace.id}`} d={trace.d} tone={trace.lit ? 'lit' : 'lo'} />
      ))}

      {sockets.map(({ cargo, center: [x, y] }) => {
        const active = cargo.id === activeCargoId;
        const inChain = chain.has(cargo.id);
        const issues = cargo.issues.length > 0;
        return (
          <g
            key={cargo.id}
            data-cargo={cargo.id}
            className={cn('org-plan-token', clickable && 'is-clickable', active && 'is-active')}
            style={{ transform: active ? `translateY(${-k.screenRise(LIFT, P)}px)` : undefined }}
          >
            {/* Área de captura generosa: la pieza es chica a 1×. */}
            <path className="org-plan-hit" d={k.cylinder(x, y, TOKEN_R + 2, top, BODY_H + CAP_H, P, 20).fill} />
            <Line d={k.ring(x, y, TOKEN_R + 1.4, top, P, 32)} tone="faint" />
            <Solid paths={k.cylinder(x, y, TOKEN_R, top, 1.2, P, 32)} tone={inChain ? 'hi' : 'lo'} lit={active} />
            {cargo.employee ? (
              <Fragment>
                <Solid paths={k.cylinder(x, y, BODY_R, top + 1.2, BODY_H, P, 28)} tone={inChain ? 'hi' : 'mid'} crease="none" lit={active} />
                <Solid paths={k.cylinder(x, y, BODY_R + 0.9, top + 1.2 + BODY_H, CAP_H, P, 28, 0.4)} tone="hi" lit={active || inChain} />
                <Line d={k.ring(x, y, 2.2, top + 1.2 + BODY_H + CAP_H, P, 20)} tone="lo" />
                <Dots points={[at([x, y, top + 1.2 + BODY_H + CAP_H])]} size={0.5} tone={active ? 'hi' : 'mid'} />
              </Fragment>
            ) : (
              <Fragment>
                <Line d={k.ring(x, y, BODY_R, top + 1.2, P, 28)} tone={inChain ? 'mid' : 'lo'} />
                <Solid paths={k.cylinder(x, y, 1.3, top + 1.2, 2.4, P, 14)} tone="lo" crease="none" lit={active} />
              </Fragment>
            )}
            {issues ? (
              <Line
                d={k.ring(x, y, BODY_R + 1.6, top + 1.2 + (cargo.employee ? BODY_H + CAP_H : 0), P, 32)}
                tone="red"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

// ============================================================================
// Ayudas de geometría plana para anillos de 4 vértices (rectángulos rotados)
// ============================================================================

const mix = (a: k.Plane, b: k.Plane, t: number): k.Plane => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Punto de un rectángulo [p0, p1, p2, p3] en coordenadas (u a lo largo de p0→p1, w de p0→p3). */
function lerpRing(ring: k.Plane[], u: number, w: number): k.Plane {
  const along0 = mix(ring[0], ring[1], u);
  const along1 = mix(ring[3], ring[2], u);
  return mix(along0, along1, w);
}

function insetRing(ring: k.Plane[], by: number): k.Plane[] {
  const length = (a: k.Plane, b: k.Plane) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = by / length(ring[0], ring[1]);
  const w = by / length(ring[0], ring[3]);
  return [lerpRing(ring, u, w), lerpRing(ring, 1 - u, w), lerpRing(ring, 1 - u, 1 - w), lerpRing(ring, u, 1 - w)];
}

/** Franja delgada entre dos puntos (una regla), de `width` de ancho hacia el interior del banco. */
function lineRing(from: k.Plane, to: k.Plane, width: number): k.Plane[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  // Normal hacia atrás (alejándose del observador, que mira desde (+x, +y)).
  const nx = (dy / length) * width;
  const ny = (-dx / length) * width;
  const back: k.Plane = nx + ny < 0 ? [nx, ny] : [-nx, -ny];
  return [from, to, [to[0] + back[0], to[1] + back[1]], [from[0] + back[0], from[1] + back[1]]];
}

function towardInside(ring: k.Plane[], length: number): k.Plane {
  const dx = ring[3][0] - ring[0][0];
  const dy = ring[3][1] - ring[0][1];
  const norm = Math.hypot(dx, dy) || 1;
  return [(dx / norm) * length, (dy / norm) * length];
}
