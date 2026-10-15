'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IsoFigure } from '@/shared/components/iso/IsoFigure';
import { useIsoSelect } from '@/shared/components/iso/use-iso-select';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import type { TireDiagramHitch } from '../TireDiagramRenderer';
import {
  calculatePositions,
  describePosition,
  type ComputedPosition,
  type DiagramAxle,
  type DiagramPosition,
} from '../tire-diagram-utils';
import { inferTemplateLayout } from './axle-layout';
import {
  PRESSURE_OK_DELTA_PSI,
  PRESSURE_TARGET_PSI,
  PRESSURE_WARN_DELTA_PSI,
  RETREAD_LABELS,
  TIRE_LAYERS,
  TREAD_OK_MM,
  TREAD_WARN_MM,
  availableLayers,
  buildTruckSvg,
  formatMm,
  formatPsi,
  toneForLayer,
  type TireLayer,
  type TireTone,
  type TruckBody,
} from './truck-geometry';

export interface TireDiagramIsoProps {
  axles: DiagramAxle[];
  positions?: DiagramPosition[];
  interactive?: boolean;
  onPositionClick?: (positionNumber: number) => void;
  /** Posiciones intervenidas en esta orden: se marcan con un punto en el centro. */
  highlightedPositions?: number[];
  /** Posición abierta en el panel: se dibuja con un anillo blanco/negro. */
  selectedPosition?: number | null;
  /** e.g. dominio o patente del vehículo. */
  label?: string;
  /** Si viene, se dibuja la cabina adelante. */
  cabinLabel?: string;
  /** Extremo de conexión con otro vehículo. */
  hitch?: TireDiagramHitch;
  /** Silueta de la carrocería (por defecto, camión / semirremolque). */
  body?: TruckBody;
  /** Separación entre ejes consecutivos, de adelante hacia atrás (ver `inferTemplateLayout`). */
  axleGaps?: number[];
  /** Capa de color controlada. Sin esto, la figura elige sola (primera capa con datos) y la cambia el selector. */
  layer?: TireLayer | null;
  onLayerChange?: (layer: TireLayer) => void;
}

const NO_HIGHLIGHTS: number[] = [];
const NO_POSITIONS: DiagramPosition[] = [];

/** Variable de tema de cada tono: nunca colores fijos. */
const TONE_VAR: Record<TireTone, string> = {
  green: 'var(--status-ok)',
  amber: 'var(--status-warn)',
  red: 'var(--status-danger)',
  blue: 'var(--status-info)',
  none: 'var(--muted-foreground)',
};

const TONE_TEXT: Record<TireTone, string> = {
  green: 'en rango',
  amber: 'atención',
  red: 'fuera de rango',
  blue: 'recapado',
  none: 'sin dato',
};

interface LegendItem {
  key: string;
  tone: TireTone;
  text: string;
}

const lowerBound = PRESSURE_TARGET_PSI - PRESSURE_OK_DELTA_PSI;
const upperBound = PRESSURE_TARGET_PSI + PRESSURE_OK_DELTA_PSI;
const lowerWarn = PRESSURE_TARGET_PSI - PRESSURE_WARN_DELTA_PSI;
const upperWarn = PRESSURE_TARGET_PSI + PRESSURE_WARN_DELTA_PSI;

/** Leyenda de colores con los valores reales de los umbrales (provisorios, a confirmar con el taller). */
const LEGENDS: Record<TireLayer, LegendItem[]> = {
  profundidad: [
    { key: 'ok', tone: 'green', text: `${TREAD_OK_MM} mm o más` },
    { key: 'warn', tone: 'amber', text: `${TREAD_WARN_MM} a ${TREAD_OK_MM} mm` },
    { key: 'bad', tone: 'red', text: `menos de ${TREAD_WARN_MM} mm` },
  ],
  presion: [
    { key: 'ok', tone: 'green', text: `${lowerBound} a ${upperBound} psi` },
    { key: 'warn', tone: 'amber', text: `${lowerWarn} a ${upperWarn} psi` },
    { key: 'bad', tone: 'red', text: `fuera de ${lowerWarn} a ${upperWarn} psi` },
  ],
  recapado: [
    { key: 'ok', tone: 'green', text: 'sin recapar' },
    { key: 'first', tone: 'blue', text: RETREAD_LABELS.FIRST },
    { key: 'second', tone: 'amber', text: RETREAD_LABELS.SECOND },
    { key: 'third', tone: 'red', text: RETREAD_LABELS.THIRD },
  ],
};

function Swatch({ tone, dashed = false }: { tone: TireTone; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-3 shrink-0 rounded-full border-2', dashed && 'border-dashed')}
      style={{ borderColor: TONE_VAR[tone] }}
    />
  );
}

/** Datos de una posición para el panel de lectura (hover, foco o selección). */
function PositionReadout({
  computed,
  data,
  layer,
  highlighted,
}: {
  computed: ComputedPosition;
  data: DiagramPosition | undefined;
  layer: TireLayer | null;
  highlighted: boolean;
}) {
  const mounted = data !== undefined && data.tire_id !== null;
  const tone = toneForLayer(layer, data);
  const rows: Array<[string, string]> = [];
  if (mounted) {
    if (data.tire_serial) rows.push(['Serie', data.tire_serial]);
    if (data.tire_brand) rows.push(['Marca', data.tire_brand]);
    if (data.tire_size) rows.push(['Medida', data.tire_size]);
    rows.push(['Dibujo', data.tread_depth_mm != null ? formatMm(data.tread_depth_mm) : 'sin dato']);
    rows.push(['Presión', data.pressure_psi != null ? formatPsi(data.pressure_psi) : 'sin dato']);
    if (data.retread_level !== undefined) {
      rows.push(['Recapado', data.retread_level ? RETREAD_LABELS[data.retread_level] : 'sin recapar']);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        {layer && mounted && <Swatch tone={tone} />}
        <span>{describePosition(computed)}</span>
        {layer && mounted && tone !== 'none' && (
          <span className="text-muted-foreground text-xs font-normal">({TONE_TEXT[tone]})</span>
        )}
      </p>
      {mounted ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {rows.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-muted-foreground">{name}</dt>
              <dd className="min-w-0 break-words font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground text-xs">Sin cubierta en esta posición.</p>
      )}
      {highlighted && <p className="text-xs font-medium">Intervenida en esta orden.</p>}
    </div>
  );
}

/**
 * Diagrama isométrico de cubiertas de un vehículo (skill anatomy). Mismo contrato que
 * `TireDiagramRenderer`: cada posición es un botón (`interactive`) o una imagen enfocable.
 * El color de los anillos lo elige la capa: profundidad de dibujo, presión o recapado.
 */
export function TireDiagramIso({
  axles,
  positions = NO_POSITIONS,
  interactive = false,
  onPositionClick,
  highlightedPositions = NO_HIGHLIGHTS,
  selectedPosition = null,
  label,
  cabinLabel,
  hitch,
  body,
  axleGaps,
  layer: controlledLayer,
  onLayerChange,
}: TireDiagramIsoProps) {
  const [chosenLayer, setChosenLayer] = useState<TireLayer | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // En modo no interactivo (ficha del equipo) el toque/Enter fija la lectura de una cubierta.
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedIdRef = useRef<string | null>(null);

  const layers = useMemo(() => availableLayers(positions), [positions]);
  const layer: TireLayer | null =
    controlledLayer !== undefined
      ? controlledLayer
      : chosenLayer && layers.includes(chosenLayer)
        ? chosenLayer
        : layers[0] ?? null;

  const selectedId = interactive ? selectedPosition : pinnedId;

  // Sin cabina, enganche ni carrocería indicados (ficha del equipo, vista previa), la forma sale de los ejes.
  const inferred = useMemo(
    () => (cabinLabel === undefined && hitch === undefined && body === undefined ? inferTemplateLayout(axles) : null),
    [axles, cabinLabel, hitch, body]
  );

  const svg = useMemo(
    () =>
      buildTruckSvg({
        axles,
        positions,
        layer,
        selected: selectedId,
        highlighted: highlightedPositions,
        cabinLabel: cabinLabel ?? inferred?.cabinLabel,
        hitch: hitch ?? inferred?.hitch,
        interactive,
        label,
        body: body ?? inferred?.body,
        axleGaps,
      }),
    [
      axles,
      positions,
      layer,
      selectedId,
      highlightedPositions,
      cabinLabel,
      hitch,
      interactive,
      label,
      body,
      axleGaps,
      inferred,
    ]
  );

  // Al redibujar el SVG (cambia la selección) el nodo enfocado se reemplaza: se devuelve el foco al mismo id.
  useLayoutEffect(() => {
    const id = focusedIdRef.current;
    const root = containerRef.current;
    if (!id || !root || root.contains(document.activeElement)) return;
    root.querySelector<SVGGElement>(`[data-iso-id="${id}"]`)?.focus({ preventScroll: true });
  }, [svg]);

  const computed = useMemo(() => calculatePositions(axles), [axles]);
  const dataByPosition = useMemo(() => new Map(positions.map((p) => [p.position_number, p])), [positions]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id === null) return;
      const number = Number(id);
      if (interactive) onPositionClick?.(number);
      else setPinnedId((current) => (current === number ? null : number));
    },
    [interactive, onPositionClick]
  );
  const { onClick, onKeyDown } = useIsoSelect(handleSelect);

  const idOf = (target: EventTarget | null) => {
    const raw = (target as Element | null)?.closest?.('[data-iso-id]')?.getAttribute('data-iso-id');
    return raw == null ? null : Number(raw);
  };
  const onPointerOver = (event: PointerEvent<HTMLElement>) => setHoveredId(idOf(event.target));
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const id = idOf(event.target);
    focusedIdRef.current = id === null ? null : String(id);
    setHoveredId(id);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    // Si el nodo salió del DOM por un redibujado no se pierde el id a restaurar.
    if (!(event.target as Element).isConnected) return;
    focusedIdRef.current = null;
    setHoveredId(null);
  };

  if (axles.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
        Este vehículo no tiene ejes configurados, así que no hay nada para dibujar.
      </p>
    );
  }

  const readoutId = hoveredId ?? selectedId;
  const readoutComputed = readoutId === null ? undefined : computed.find((c) => c.position_number === readoutId);
  const withTire = positions.filter((p) => p.tire_id !== null).length;
  const spareCount = computed.filter((c) => c.side === 'SPARE').length;
  const showPositions = positions.length > 0;
  const legend = layer ? LEGENDS[layer] : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3" role="group" aria-label={label ?? 'Diagrama de cubiertas'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? <div className="text-muted-foreground text-sm font-medium">{label}</div> : <span />}
        {layers.length > 1 && (
          <div role="group" aria-label="Qué mostrar en el color de las cubiertas" className="flex flex-wrap gap-1.5">
            {TIRE_LAYERS.filter((item) => layers.includes(item.id)).map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={layer === item.id ? 'secondary' : 'outline'}
                aria-pressed={layer === item.id}
                className="h-8"
                onClick={() => {
                  setChosenLayer(item.id);
                  onLayerChange?.(item.id);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {(cabinLabel || hitch) && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {cabinLabel && <li>Cabina al frente: {cabinLabel}</li>}
          {hitch && (
            <li>
              Enganche {hitch.position === 'front' ? 'adelante' : 'atrás'}: {hitch.label}
            </li>
          )}
        </ul>
      )}

      {/* Los handlers van en el contenedor (delegación): cada rueda lleva `data-iso-id`. */}
      <div
        ref={containerRef}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerOver={onPointerOver}
        onPointerLeave={() => setHoveredId(null)}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <IsoFigure svg={svg} />
      </div>

      {showPositions && (
        <ul
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          aria-label="Leyenda de colores"
        >
          {legend.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <Swatch tone={item.tone} />
              {item.text}
            </li>
          ))}
          {layer && (
            <li className="flex items-center gap-1.5">
              <Swatch tone="none" />
              sin dato
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Swatch tone="none" dashed />
            sin cubierta
          </li>
          {highlightedPositions.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="bg-foreground inline-block size-2 shrink-0 rounded-full" />
              intervenida en esta orden
            </li>
          )}
        </ul>
      )}

      {/* Lectura de la cubierta bajo el mouse, con foco o seleccionada. Reserva alto para que nada salte. */}
      {showPositions && (
        <div className="bg-muted/30 min-h-24 rounded-md border p-3" aria-live="polite">
          {readoutComputed ? (
            <PositionReadout
              computed={readoutComputed}
              data={dataByPosition.get(readoutComputed.position_number)}
              layer={layer}
              highlighted={highlightedPositions.includes(readoutComputed.position_number)}
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              {interactive
                ? 'Pasá el mouse por una cubierta o tocá una para ver su detalle.'
                : 'Pasá el mouse por una cubierta, o enfocala con el teclado, para ver su detalle.'}
            </p>
          )}
        </div>
      )}

      <p className="text-muted-foreground text-[11px]">
        {computed.length - spareCount} posiciones
        {showPositions && ` · ${withTire} con cubierta`} · {spareCount} auxilio
      </p>
    </div>
  );
}
