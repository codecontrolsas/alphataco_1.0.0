import * as k from '../../../../../shared/components/iso/iso-kit.ts';
import * as G from '../../../../../shared/components/iso/lathe.mjs';

export { G, k };

/** Lo que devuelve cada figura: lienzo y capas SVG en orden de pintado (de atrás hacia adelante). */
export interface Scene {
  width: number;
  height: number;
  body: string[];
}

type Style = Parameters<typeof k.solidSvg>[1];
type LStyle = Parameters<typeof k.lineSvg>[1];
type DStyle = Parameters<typeof k.dotsSvg>[1];

/** Atajos de dibujo atados a una proyección, para que cada escena lea como una lista de piezas. */
export function toolbox(P: k.Projection) {
  return {
    P,
    at: (p: k.Point3) => k.iso(p, P),
    /** Sólido con cuerpo: losa/caja con bisel opcional. */
    box: (plan: k.Plan, z: number, h: number, style: Style = {}, steps = 4, bevel = 0.5) =>
      k.solidSvg(k.slabOf(plan, z, h, P, steps, bevel), style),
    solid: (paths: k.SolidPaths, style?: Style) => k.solidSvg(paths, style),
    line: (d: string, style?: LStyle) => k.lineSvg(d, style),
    dots: (pts: Array<k.Flat | k.Point3>, style?: DStyle) => k.dotsSvg(pts, style),
    /** Línea sobre una cara superior, de punto a punto. */
    topLine: (a: k.Plane, b: k.Plane, z: number, style?: LStyle) => k.lineSvg(k.lineOnTop(a, b, z, P), style),
    /** Segmento en 3D. */
    seg: (a: k.Point3, b: k.Point3) => k.segment(a, b, P),
    /** Rectángulo cerrado sobre la cara +y (la que mira al espectador, a la izquierda). */
    faceY: (y: number, x0: number, x1: number, z0: number, z1: number) =>
      k.pathOf(
        k.pointsAt(
          [
            [x0, y, z0],
            [x1, y, z0],
            [x1, y, z1],
            [x0, y, z1],
          ],
          P
        ),
        true
      ),
    /** Rectángulo cerrado sobre la cara +x (la que mira al espectador, a la derecha). */
    faceX: (x: number, y0: number, y1: number, z0: number, z1: number) =>
      k.pathOf(
        k.pointsAt(
          [
            [x, y0, z0],
            [x, y1, z0],
            [x, y1, z1],
            [x, y0, z1],
          ],
          P
        ),
        true
      ),
    /** Rueda chica de eje y (camión, carro): cuerpo, llanta y tuerca. */
    wheelY: (x: number, y: number, z: number, r: number, w: number, outward: 1 | -1 = 1) => {
      const F = G.frameAlong([x, outward === 1 ? y : y + w, z], [0, outward, 0]);
      return [
        k.solidSvg(
          G.solidOf(
            [
              [0, r * 0.55],
              [0.8, r * 0.9, 1],
              [1.6, r],
              [w - 1.6, r],
              [w - 0.8, r * 0.9, 1],
              [w, r * 0.55],
            ],
            F,
            P
          ),
          { tone: 'mid' }
        ),
        k.solidSvg(G.disc(w - 0.3, w + 0.5, r * 0.55, F, P), { tone: 'hi', crease: 'lo' }),
        k.dotsSvg([k.iso(G.pointOf(F, w + 0.5, 0, 0) as k.Point3, P)], { size: 0.5, tone: 'hi' }),
      ].join('');
    },
    /** Orden de pintado: más lejos primero. */
    byDepth: <T>(items: T[], pos: (item: T) => k.Point3) =>
      [...items].sort((a, b) => k.depthOf(pos(a), P) - k.depthOf(pos(b), P)),
  };
}

/** `pointOf` de lathe.mjs con tipo: un punto del mundo. */
export const pointOf = (F: unknown, s: number, r: number, angle: number) => G.pointOf(F, s, r, angle) as k.Point3;
/** `dotsOf` de lathe.mjs con tipo: puntos ya proyectados. */
export const dotsOf = (...args: Parameters<typeof G.dotsOf>) => G.dotsOf(...args) as k.Flat[];
