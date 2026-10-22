'use client';

import { Button } from '@/components/ui/button';
import {
  PRESSURE_OK_DELTA_PSI,
  PRESSURE_TARGET_PSI,
  PRESSURE_WARN_DELTA_PSI,
  TIRE_LAYERS,
  TREAD_OK_MM,
  TREAD_WARN_MM,
  describePositionDetail,
  type TireLayer,
  type TireTone,
} from '@/features/Mantenimiento/Gomeria/shared/iso/truck-geometry';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { cn } from '@/lib/utils';
import { IsoFigure } from '@/shared/components/iso/IsoFigure';
import { useIsoSelect } from '@/shared/components/iso/use-iso-select';
import { ArrowRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { buildZoneInfos, defaultAxles, type TwinZoneId, type VehicleTwinData } from '../../lib/vehicle-twin';
import { TIRE_ID_PREFIX, buildVehicleTwinSvg, tiresSummary, twinLayers, zoneOfIsoId } from './vehicle-twin-geometry';

const TONE_VAR: Record<TireTone, string> = {
  green: 'var(--status-ok)',
  amber: 'var(--status-warn)',
  red: 'var(--status-danger)',
  blue: 'var(--status-info)',
  none: 'var(--muted-foreground)',
};

const TONE_TEXT: Record<TireTone, string> = {
  green: 'en orden',
  amber: 'atención',
  red: 'crítico',
  blue: 'en curso',
  none: 'sin dato',
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

const TREAD_TEXT = `dibujo: verde desde ${TREAD_OK_MM} mm, ámbar desde ${TREAD_WARN_MM} mm`;
const PRESSURE_TEXT = `presión: verde ±${PRESSURE_OK_DELTA_PSI} y ámbar ±${PRESSURE_WARN_DELTA_PSI} psi de ${PRESSURE_TARGET_PSI}`;

export function VehicleTwin({ data }: { data: VehicleTwinData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Lleva la ficha a otra sección: el índice de la ficha es `?tab=` con enlaces, y la sección se arma en el servidor. */
  const goToTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const [chosenLayer, setChosenLayer] = useState<TireLayer | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<TwinZoneId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedIdRef = useRef<string | null>(null);

  const positions = data.tires?.positions ?? [];
  const configured = (data.tires?.axles.length ?? 0) > 0 && positions.length > 0;
  const layers = useMemo(() => twinLayers(positions), [positions]);
  const layer: TireLayer | null = chosenLayer && layers.includes(chosenLayer) ? chosenLayer : layers[0] ?? null;

  const tires = useMemo(() => tiresSummary(positions, layer), [positions, layer]);
  const tiresText = !configured
    ? 'sin configuración'
    : tires.mounted === 0
      ? 'sin cubiertas montadas'
      : `${tires.mounted} de ${tires.total} montadas`;
  const zones = useMemo(
    () => buildZoneInfos(data, configured ? tires.tone : 'none', tiresText),
    [data, configured, tires.tone, tiresText]
  );

  const svg = useMemo(
    () =>
      buildVehicleTwinSvg({
        category: data.category,
        axles: data.tires?.axles ?? [],
        positions,
        layer,
        zones,
        selected: pinned,
        hasHitch: data.hitch.capable,
        label: `Gemelo de ${data.label}: ${data.typeName ?? 'equipo'} en perspectiva isométrica. Cada zona se pinta con el estado real de su sección.`,
      }),
    [data, positions, layer, zones, pinned]
  );

  // Al redibujar el SVG el nodo enfocado se reemplaza: se devuelve el foco al mismo id.
  useLayoutEffect(() => {
    const id = focusedIdRef.current;
    const root = containerRef.current;
    if (!id || !root || root.contains(document.activeElement)) return;
    root.querySelector<SVGGElement>(`[data-iso-id="${id}"]`)?.focus({ preventScroll: true });
  }, [svg]);

  const activate = useCallback(
    (zoneId: TwinZoneId) => {
      const info = zones.find((z) => z.id === zoneId);
      if (info?.tab) goToTab(info.tab);
      else setPinned((current) => (current === zoneId ? null : zoneId));
    },
    [zones, goToTab]
  );
  const handleSelect = useCallback(
    (id: string | null) => {
      const zone = id === null ? null : zoneOfIsoId(id);
      if (zone) activate(zone);
    },
    [activate]
  );
  const { onClick, onKeyDown } = useIsoSelect(handleSelect);

  const idOf = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.('[data-iso-id]')?.getAttribute('data-iso-id') ?? null;
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const id = idOf(event.target);
    focusedIdRef.current = id;
    setHovered(id);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!(event.target as Element).isConnected) return;
    focusedIdRef.current = null;
    setHovered(null);
  };

  const readId = hovered ?? pinned;
  const readZone = readId ? zoneOfIsoId(readId) : null;
  const info = readZone ? zones.find((z) => z.id === readZone) : undefined;
  const wheelNumber = readId?.startsWith(TIRE_ID_PREFIX) ? Number(readId.slice(TIRE_ID_PREFIX.length)) : null;
  const wheelText = useMemo(() => {
    if (wheelNumber === null || !configured) return null;
    const computed = calculatePositions(data.tires?.axles ?? defaultAxles(data.category)).find(
      (c) => c.position_number === wheelNumber
    );
    return computed
      ? describePositionDetail(
          computed,
          positions.find((p) => p.position_number === wheelNumber)
        )
      : null;
  }, [wheelNumber, configured, data, positions]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3" role="group" aria-label={`Gemelo de ${data.label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm font-medium">{data.label}</p>
        {configured && layers.length > 1 && (
          <div role="group" aria-label="Qué mostrar en el color de las cubiertas" className="flex flex-wrap gap-1.5">
            {TIRE_LAYERS.filter((item) => layers.includes(item.id)).map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={layer === item.id ? 'secondary' : 'outline'}
                aria-pressed={layer === item.id}
                className="h-8"
                onClick={() => setChosenLayer(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerOver={(event: PointerEvent<HTMLElement>) => setHovered(idOf(event.target))}
        onPointerLeave={() => setHovered(null)}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <IsoFigure svg={svg} />
      </div>

      {!configured && (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          Este equipo no tiene cubiertas configuradas, así que las ruedas se dibujan sin estado.{' '}
          {data.access.tires ? (
            <button
              type="button"
              className="text-foreground focus-visible:ring-ring rounded font-medium underline underline-offset-2 outline-none focus-visible:ring-2"
              onClick={() => goToTab('tires')}
            >
              {data.canEditTires ? 'Configurar los ejes en Cubiertas' : 'Ver la pestaña Cubiertas'}
            </button>
          ) : (
            'Pedí acceso a la pestaña Cubiertas para configurarlas.'
          )}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Zonas del equipo y su estado">
        {zones.map((zone) => {
          const body = (
            <>
              <Swatch tone={zone.tone} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium">{zone.name}</span>
                <span className="text-muted-foreground block truncate text-xs tabular-nums">{zone.summary}</span>
              </span>
              {zone.tab && <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />}
            </>
          );
          const cls =
            'bg-card focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2';
          return (
            <li key={zone.id}>
              <button
                type="button"
                className={cn(cls, zone.tab && 'hover:bg-muted/50')}
                aria-label={`${zone.name}: ${zone.summary}${zone.tab ? `. ${zone.sectionLabel}` : ''}`}
                onClick={() => activate(zone.id)}
              >
                {body}
              </button>
            </li>
          );
        })}
      </ul>

      <ul
        className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        aria-label="Leyenda de colores"
      >
        {(['green', 'blue', 'amber', 'red'] as const).map((tone) => (
          <li key={tone} className="flex items-center gap-1.5">
            <Swatch tone={tone} />
            {TONE_TEXT[tone]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Swatch tone="none" />
          sin dato
        </li>
        {configured && layer && (
          <li>
            Ruedas por{' '}
            {layer === 'profundidad' ? TREAD_TEXT : layer === 'presion' ? PRESSURE_TEXT : 'nivel de recapado'}
          </li>
        )}
      </ul>

      {/* Lectura de la zona bajo el mouse, con foco o fijada. Reserva alto para que nada salte. */}
      <div className="bg-muted/30 min-h-28 rounded-md border p-3" aria-live="polite">
        {info ? (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Swatch tone={info.tone} />
              <span>{info.name}</span>
              <span className="text-muted-foreground text-xs font-normal">({TONE_TEXT[info.tone]})</span>
            </p>
            {wheelText && <p className="text-xs">{wheelText}</p>}
            {info.id === 'tires' && configured && !wheelText && (
              <p className="text-xs tabular-nums">
                {tires.counts.green} en rango, {tires.counts.amber} en atención, {tires.counts.red} fuera de rango,{' '}
                {tires.counts.none} sin dato
              </p>
            )}
            {info.rows.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {info.rows.map(([name, value]) => (
                  <div key={name} className="contents">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="min-w-0 break-words font-mono tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {info.hint && <p className="text-muted-foreground text-xs">{info.hint}</p>}
            {info.tab && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => goToTab(info.tab as string)}
              >
                {info.sectionLabel}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Pasá el mouse por una zona del equipo, o enfocala con el teclado, para ver su estado. Tocala para ir a su
            sección.
          </p>
        )}
      </div>
    </div>
  );
}
