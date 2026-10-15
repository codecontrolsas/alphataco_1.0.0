import { figureSvg } from '../../../../shared/components/iso/iso-kit.ts';
import { FIGURE_LABELS, type FigureName } from './names.ts';
import { buildCubiertasPosiciones } from './scenes/cubiertas-posiciones.ts';
import { buildParteCierreNocturno } from './scenes/parte-cierre-nocturno.ts';
import { buildSalidaDirecta } from './scenes/salida-directa.ts';
import type { Scene } from './scenes/scene.ts';
import { buildTallerCircuito } from './scenes/taller-circuito.ts';
import { buildValidacionSolicitud } from './scenes/validacion-solicitud.ts';
import { buildVencimientosRegla } from './scenes/vencimientos-regla.ts';

/**
 * Cada figura es una función pura sin argumentos que devuelve su escena (tamaño del lienzo y capas
 * en orden de pintado). Se arma una sola vez por proceso y se guarda el SVG: las figuras no
 * dependen de datos. Tipado contra `FIGURE_LABELS`: no puede faltar ni sobrar un nombre.
 *
 * Imports relativos con extensión: `manual:check` carga `names.ts` con Node a secas, y la vista
 * previa de las figuras (scratch) importa estos mismos builders sin duplicar geometría.
 */
const SCENES = {
  'taller-circuito': buildTallerCircuito,
  'validacion-solicitud': buildValidacionSolicitud,
  'cubiertas-posiciones': buildCubiertasPosiciones,
  'vencimientos-regla': buildVencimientosRegla,
  'salida-directa': buildSalidaDirecta,
  'parte-cierre-nocturno': buildParteCierreNocturno,
} satisfies Record<FigureName, () => Scene>;

const cache = new Map<FigureName, string>();

/** SVG de una figura (string), o `null` si el nombre no existe (el validador lo atrapa antes). */
export function figureSvgOf(name: string): string | null {
  if (!(name in SCENES)) return null;
  const key = name as FigureName;
  let svg = cache.get(key);
  if (svg === undefined) {
    const scene = SCENES[key]();
    svg = figureSvg({ width: scene.width, height: scene.height, label: FIGURE_LABELS[key], body: scene.body });
    cache.set(key, svg);
  }
  return svg;
}
