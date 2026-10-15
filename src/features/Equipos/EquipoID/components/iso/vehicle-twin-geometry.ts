/**
 * Geometría del gemelo del vehículo (skill anatomy). Pura: datos -> SVG. Compone `buildTruckSvg`
 * (ejes y ruedas con su estado) con las zonas del equipo: chasis/placa, cabina, motor y enganche.
 * La silueta depende de la categoría; un tipo desconocido cae en camión genérico.
 */
import {
  availableLayers,
  buildTruckSvg,
  toneForLayer,
  type TireLayer,
  type TireTone,
  type TruckBody,
  type TruckHitch,
  type TruckZone,
} from '@/features/Mantenimiento/Gomeria/shared/iso/truck-geometry';
import { type DiagramAxle, type DiagramPosition } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import {
  ZONE_NAME,
  defaultAxles,
  type TwinZoneId,
  type TwinZoneInfo,
  type VehicleCategory,
} from '../../lib/vehicle-twin';

/** Prefijo del id de cada rueda: `tire-<n>` pertenece a la zona `tires`. */
export const TIRE_ID_PREFIX = 'tire-';

export function zoneOfIsoId(id: string): TwinZoneId | null {
  if (id.startsWith(TIRE_ID_PREFIX)) return 'tires';
  return id in ZONE_NAME ? (id as TwinZoneId) : null;
}

export const twinLayers = availableLayers;

const WORST: TireTone[] = ['red', 'amber', 'blue', 'green', 'none'];

/** Peor tono de las cubiertas montadas en la capa, y cuántas hay de cada tono. */
export function tiresSummary(positions: DiagramPosition[], layer: TireLayer | null) {
  const counts: Record<TireTone, number> = { red: 0, amber: 0, blue: 0, green: 0, none: 0 };
  const mounted = positions.filter((p) => p.tire_id !== null);
  for (const p of mounted) counts[toneForLayer(layer, p)] += 1;
  const tone = WORST.find((t) => counts[t] > 0) ?? 'none';
  return { tone, counts, mounted: mounted.length, total: positions.length };
}

export interface BuildVehicleTwinInput {
  category: VehicleCategory;
  axles: DiagramAxle[];
  positions: DiagramPosition[];
  layer: TireLayer | null;
  zones: TwinZoneInfo[];
  selected: TwinZoneId | null;
  hasHitch: boolean;
  label: string;
}

const BODY: Record<VehicleCategory, TruckBody> = {
  tractor: 'truck',
  trailer: 'truck',
  truck: 'truck',
  pickup: 'pickup',
  machinery: 'machinery',
};

/** SVG del gemelo. Sin ejes configurados dibuja ejes de vista previa (ruedas sin color). */
export function buildVehicleTwinSvg(input: BuildVehicleTwinInput): string {
  const { category, positions, layer, zones, selected, hasHitch, label } = input;
  const configured = input.axles.length > 0 && positions.length > 0;
  const axles = configured ? input.axles : defaultAxles(category);
  // Hay pocas zonas: se arma un mapa por id para sacar tono, texto y selección.
  const zone = (id: TwinZoneId): TruckZone | undefined => {
    const info = zones.find((z) => z.id === id);
    if (!info) return undefined;
    const hint = info.hint ? `. ${info.hint}` : '';
    const action = info.tab ? `. Abre ${info.name}` : '';
    return {
      id,
      tone: info.tone,
      selected: selected === id,
      label: `${info.name}: ${info.summary}${hint}${action}`,
    };
  };
  const hitch: TruckHitch | undefined = hasHitch
    ? {
        label: 'Enganche',
        position: category === 'tractor' ? 'rear' : category === 'trailer' ? 'front' : 'rear',
      }
    : undefined;
  return buildTruckSvg({
    axles,
    positions: configured ? positions : [],
    layer: configured ? layer : null,
    interactive: true,
    body: BODY[category],
    cabinLabel: category === 'tractor' || category === 'truck' ? 'Cabina' : undefined,
    hitch,
    wheelIdPrefix: TIRE_ID_PREFIX,
    selectAllWheels: selected === 'tires',
    zones: {
      documents: zone('documents'),
      checklists: zone('checklists'),
      maintenance: zone('maintenance'),
      hitch: hitch ? zone('hitch') : undefined,
    },
    label,
  });
}
