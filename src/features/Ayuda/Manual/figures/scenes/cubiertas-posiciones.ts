import { G, dotsOf, k, pointOf, toolbox, type Scene } from './scene.ts';

/**
 * Chasis de un tractor con tres ejes y auxilio. Numeración REAL de `calculatePositions`
 * (Gomería/shared/tire-diagram-utils.ts): eje por eje, de adelante hacia atrás; en cada eje de
 * izquierda a derecha, y en los duales: exterior izquierda, interior izquierda, interior derecha,
 * exterior derecha. El auxilio es la última. Frente del vehículo = -x, lado izquierdo = -y (el mismo
 * sentido que el dibujo de la orden: frente a la izquierda, izquierda arriba).
 */
const W = 680;
const H = 420;
const R = 26; // radio de la cubierta
const TW = 22; // ancho de la cubierta
const LIT = 6; // posición que se mira: exterior derecha del eje 2

interface Wheel {
  n: number;
  x: number;
  side: 1 | -1; // -1 = izquierda (lejos), +1 = derecha (cerca)
  y0: number;
  y1: number;
  spare?: boolean;
}

function wheels(): Wheel[] {
  const out: Wheel[] = [];
  let n = 1;
  const axles = [
    { x: -100, dual: false },
    { x: 55, dual: true },
    { x: 130, dual: true },
  ];
  for (const ax of axles) {
    // izquierda a derecha = de y negativo a y positivo
    const lanes: Array<[number, number, 1 | -1]> = ax.dual
      ? [
          [58, 80, -1],
          [34, 56, -1],
          [34, 56, 1],
          [58, 80, 1],
        ]
      : [
          [40, 62, -1],
          [40, 62, 1],
        ];
    for (const [y0, y1, side] of lanes) out.push({ n: n++, x: ax.x, side, y0, y1 });
  }
  out.push({ n: n++, x: -22, side: 1, y0: -11, y1: 11, spare: true });
  return out;
}

export function buildCubiertasPosiciones(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -200, y: -88, w: 400, d: 176, r: 2 }, 0, 0), [-190, 0, 112], [-22, 0, 80]],
    W,
    H,
    { pad: 22, azimuth: 62, elevation: 38 }
  );
  const t = toolbox(P);
  const all = wheels();

  const wheelSvg = (w: Wheel) => {
    const F = G.frameAlong([w.x, w.spare ? -TW / 2 : Math.min(w.side * w.y0, w.side * w.y1), R], [0, 1, 0]);
    const lit = w.n === LIT;
    const out: string[] = [];
    out.push(
      t.solid(
        G.solidOf(
          [
            [0, 15],
            [1.2, 23.5, 1],
            [3, R],
            [TW - 3, R],
            [TW - 1.2, 23.5, 1],
            [TW, 15],
          ],
          F,
          P
        ),
        { tone: lit ? 'hi' : 'mid', lit }
      )
    );
    out.push(t.line(G.arcOf(F, TW * 0.5, R, P), { tone: 'faint' }));
    out.push(t.line(G.arcOf(F, TW * 0.5, R - 2.2, P), { tone: 'faint' }));
    out.push(t.solid(G.disc(TW - 0.4, TW + 1.4, 15, F, P), { tone: 'hi', crease: 'lo' }));
    out.push(t.line(G.circleOf(F, TW + 1.4, 11, P, 40), { tone: 'lo' }));
    out.push(t.dots(dotsOf(F, TW + 1.4, 7, 8, P, { all: true }), { size: 0.5 }));
    out.push(t.dots([t.at(pointOf(F, TW + 1.4, 0, 0))], { size: 0.9, tone: 'hi' }));
    if (lit)
      out.push(
        `<path class="iso-line" data-tone="blue" style="stroke-width:2.6" d="${G.circleOf(F, TW + 0.2, 21, P, 48)}"/>`
      );
    return out.join('');
  };

  // Número: un puck sobre la cubierta, con su vástago. El texto va de pie (legible a 390 px).
  const puck = (w: Wheel) => {
    const yc = w.spare ? 0 : w.side * ((w.y0 + w.y1) / 2);
    const top = R * 2;
    const lit = w.n === LIT;
    const stemTop = top + 14;
    const c = t.at([w.x, yc, stemTop + 3.2]);
    return [
      t.line(k.rise([w.x, yc], top, stemTop, P), { tone: 'mid' }),
      t.solid(k.cylinder(w.x, yc, 10.5, stemTop, 3.2, P, 24, 0.4), { tone: 'hi', lit, crease: 'lo' }),
      k.faceTextSvg(`translate(${c[0].toFixed(1)} ${(c[1] + 4.6).toFixed(1)})`, String(w.n), {
        size: 13,
        tone: 'hi',
        anchor: 'middle',
      }),
    ].join('');
  };

  const far = t.byDepth(
    all.filter((w) => !w.spare && w.side === -1),
    (w) => [w.x, (w.y0 + w.y1) / -2, 0]
  );
  const near = t.byDepth(
    all.filter((w) => !w.spare && w.side === 1),
    (w) => [w.x, (w.y0 + w.y1) / 2, 0]
  );
  const spare = all.find((w) => w.spare)!;
  const out: string[] = [];

  out.push(
    `<path class="iso-halo" d="${k.haloOf({ x: -200, y: -90, w: 400, d: 180, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`
  );
  // lado izquierdo (lejos): cubiertas y sus números
  for (const w of far) out.push(wheelSvg(w), puck(w));
  // ejes: tubo y diferencial
  for (const x of [-100, 55, 130]) {
    const F = G.frameAlong([x, -66, R], [0, 1, 0]);
    out.push(t.solid(G.disc(0, 132, 4.5, F, P), { tone: 'lo', crease: 'none' }));
    if (x !== -100) out.push(t.solid(G.disc(58, 74, 9, F, P), { tone: 'mid' }));
  }
  // larguero izquierdo
  out.push(t.box({ x: -192, y: -26, w: 384, d: 6, r: 1.5 }, 46, 13, { tone: 'mid' }));
  out.push(t.topLine([-191.4, -23], [191.4, -23], 59, { tone: 'faint' }));
  const bolts = (y: number) =>
    t.dots(
      Array.from({ length: 23 }, (_, i) => t.at([-176 + i * 16, y, 59])),
      { size: 0.45, tone: 'lo' }
    );
  out.push(bolts(-23));
  // travesaños
  for (const x of [-170, -70, 8, 92]) {
    out.push(t.box({ x: x - 3, y: -20, w: 6, d: 40, r: 1 }, 48, 9, { tone: 'lo' }, 3, 0.4));
    out.push(t.dots([t.at([x, -14, 57.1]), t.at([x, 14, 57.1])], { size: 0.5 }));
  }
  // portaauxilio: ménsulas y rueda
  for (const y of [-16, 13]) out.push(t.box({ x: spare.x - 3, y, w: 6, d: 3, r: 0.6 }, 22, 26, { tone: 'lo' }, 2, 0.3));
  out.push(wheelSvg(spare), puck(spare));
  // larguero derecho
  out.push(t.box({ x: -192, y: 20, w: 384, d: 6, r: 1.5 }, 46, 13, { tone: 'mid' }));
  out.push(t.topLine([-191.4, 23], [191.4, 23], 59, { tone: 'faint' }), bolts(23));
  // cabina (frente = -x): puerta y ventanilla en la cara derecha (+y)
  const cab = { x: -192, y: -34, w: 62, d: 68, r: 6 };
  out.push(t.box(cab, 59, 46, { tone: 'mid' }, 6, 1.2));
  out.push(
    t.line(
      k.pathOf(
        k.pointsAt(
          [
            [-182, 34, 92],
            [-140, 34, 92],
            [-140, 34, 74],
            [-182, 34, 74],
          ],
          P
        ),
        true
      ),
      { tone: 'lo' }
    )
  );
  out.push(t.line(k.segment([-161, 34, 74], [-161, 34, 92], P), { tone: 'faint' }));
  out.push(t.line(k.segment([-182, 34, 69], [-140, 34, 69], P), { tone: 'faint' }));
  out.push(t.dots([t.at([-146, 34, 66]), t.at([-176, 34, 66])], { size: 0.7, tone: 'hi' }));
  // lado derecho (cerca): cubiertas y números
  for (const w of near) out.push(wheelSvg(w), puck(w));

  return { width: W, height: H, body: out };
}
