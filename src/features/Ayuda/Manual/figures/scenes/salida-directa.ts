import { G, k, pointOf, toolbox, type Scene } from './scene.ts';

/**
 * La regla de la salida directa como tres compuertas en fila (guía "Circuito de materiales"):
 * 1) permiso Salida directa (lector de tarjeta), 2) el material no requiere aprobación (anillo
 * detector) y 3) el total no supera el monto máximo (báscula con su tope). Después de cada una, una
 * rampa lleva a la vía lateral del pedido de materiales. La caja (lit) es el material; si pasa las
 * tres llega a la ventanilla de salida registrada. Sentido: +x.
 */
const W = 680;
const H = 330;
const Z = 10;
const GATES = [-100, -20, 60];

export function buildSalidaDirecta(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -190, y: -26, w: 372, d: 80, r: 2 }, 0, 0), [60, -20, 52], [155, 0, 56]],
    W,
    H,
    { pad: 22, azimuth: 56, elevation: 35 }
  );
  const t = toolbox(P);
  // Capas en orden de pintado: pies lejanos → cinta y lo que va sobre ella → vía lateral → piezas cercanas → ventanilla y bandeja.
  const layers: Record<'far' | 'mid' | 'lane' | 'near' | 'end', string[]> = {
    far: [],
    mid: [],
    lane: [],
    near: [],
    end: [],
  };
  const add = (layer: keyof typeof layers, ...svg: string[]) => layers[layer].push(svg.join(''));
  const head: string[] = [
    `<path class="iso-halo" d="${k.haloOf({ x: -192, y: -28, w: 380, d: 84, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`,
  ];

  // cinta principal con patas y rodillos
  const BX0 = -170;
  const BX1 = 132;
  const belt: string[] = [];
  for (const x of [-160, -100, -40, 20, 80, 124]) {
    belt.push(
      t.box({ x: x - 2, y: -13, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3),
      t.box({ x: x - 2, y: 9, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3)
    );
  }
  belt.push(t.box({ x: BX0, y: -13, w: BX1 - BX0, d: 3, r: 0.6 }, Z - 6, 6, { tone: 'mid' }, 2, 0.3));
  belt.push(t.box({ x: BX0, y: -10, w: BX1 - BX0, d: 20, r: 0 }, Z - 3, 3, { tone: 'lo' }, 2, 0.3));
  for (let x = BX0 + 4; x < BX1 - 2; x += 8) belt.push(t.topLine([x, -10], [x, 10], Z, { tone: 'faint' }));
  belt.push(t.line(k.planOutline({ x: BX0, y: -10, w: BX1 - BX0, d: 20, r: 0 }, Z, P), { tone: 'lo' }));
  belt.push(t.box({ x: BX0, y: 10, w: BX1 - BX0, d: 3, r: 0.6 }, Z - 6, 6, { tone: 'mid' }, 2, 0.3));
  add('mid', ...belt);

  // caja de material (lit) con sus flejes
  add(
    'mid',
    t.box({ x: -158, y: -8, w: 20, d: 16, r: 1 }, Z, 14, { tone: 'hi', lit: true }, 3, 0.7),
    t.line(k.sideSeam({ x: -158, y: -8, w: 20, d: 16, r: 1 }, Z + 9, P, 3), { tone: 'lit' }),
    t.line(t.seg([-147.6, 8, Z + 1.5], [-147.6, 8, Z + 8.5]), { tone: 'lit', free: true }),
    t.dots([t.at([-141, 8, Z + 11]), t.at([-155, 8, Z + 11])], { size: 0.6, tone: 'hi' })
  );

  // compuertas: pórtico de dos postes y viga
  const portal = (x: number, extra: string[] = []) => {
    add('far', t.box({ x: x - 3, y: -22, w: 6, d: 6, r: 0.8 }, 0, 44, { tone: 'mid' }, 3, 0.5));
    add('mid', t.box({ x: x - 3, y: -22, w: 6, d: 44, r: 0.8 }, 44, 5, { tone: 'hi' }, 3, 0.5), ...extra);
    add(
      'near',
      t.box({ x: x - 3, y: 16, w: 6, d: 6, r: 0.8 }, 0, 44, { tone: 'mid' }, 3, 0.5),
      t.dots([t.at([x, 19, 49.1])], { size: 0.5 })
    );
  };
  // 1) lector de permiso
  {
    const x = GATES[0];
    portal(x, [t.line(t.seg([x - 2.2, -20, 44], [x - 2.2, 20, 44]), { tone: 'faint', free: true })]);
    add(
      'near',
      t.box({ x: x + 3, y: 22, w: 10, d: 4, r: 0.8 }, 20, 16, { tone: 'hi' }, 2, 0.4),
      t.line(t.seg([x + 5, 26, 30], [x + 11, 26, 30]), { tone: 'lo', free: true }),
      t.box({ x: x + 5.5, y: 26, w: 5, d: 0.8, r: 0.1 }, 30.6, 5, { tone: 'mid' }, 2, 0.1),
      t.dots([t.at([x + 8, 26, 24]), t.at([x + 11, 26, 24])], { size: 0.7, tone: 'hi' })
    );
    add('near', t.box({ x: x + 6, y: 22, w: 4, d: 4, r: 0.5 }, 0, 20, { tone: 'lo' }, 2, 0.3));
  }
  // 2) cabezal detector colgado de la viga (aprobación)
  {
    const x = GATES[1];
    portal(x);
    const F = G.frameAlong([x + 5, 0, 36], [1, 0, 0]);
    add(
      'mid',
      t.box({ x: x - 5, y: -8, w: 10, d: 16, r: 1 }, 34, 10, { tone: 'mid' }, 3, 0.6),
      t.solid(G.disc(0, 1.2, 5.5, F, P), { tone: 'hi', crease: 'lo' }),
      t.line(G.circleOf(F, 1.2, 3.2, P, 24), { tone: 'lo' }),
      t.dots([k.iso(pointOf(F, 1.2, 0, 0), P)], { size: 0.9, tone: 'hi' })
    );
  }
  // 3) báscula con su dial y tope
  {
    const x = GATES[2];
    portal(x);
    add(
      'mid',
      t.box({ x: x - 20, y: -10, w: 40, d: 20, r: 0.5 }, Z, 3, { tone: 'hi' }, 2, 0.4),
      t.line(k.planOutline({ x: x - 17, y: -7, w: 34, d: 14, r: 0 }, Z + 3, P), { tone: 'faint' }),
      t.dots(
        [t.at([x - 18, -8, Z + 3]), t.at([x + 18, -8, Z + 3]), t.at([x - 18, 8, Z + 3]), t.at([x + 18, 8, Z + 3])],
        { size: 0.5 }
      )
    );
    // dial en el poste cercano
    const D = G.frameAlong([x - 3, 22.5, 36], [0, 1, 0]);
    const dial = [
      t.box({ x: x - 4, y: 22, w: 8, d: 4, r: 0.8 }, 0, 26, { tone: 'lo' }, 2, 0.3),
      t.solid(G.disc(0, 3, 10, D, P), { tone: 'hi', crease: 'lo' }),
      t.line(G.circleOf(D, 3, 8, P, 36), { tone: 'mid' }),
      `<path class="iso-line" data-free="" data-tone="red" style="stroke-width:2.6" d="${k.pathOf(Array.from({ length: 9 }, (_, i) => k.iso(pointOf(D, 3, 6.4, 0.2 + i * 0.1), P)))}"/>`,
      t.line(k.pathOf([k.iso(pointOf(D, 3, 0, 0), P), k.iso(pointOf(D, 3, 5.6, 2.5), P)]), { tone: 'hi', free: true }),
      t.dots([k.iso(pointOf(D, 3, 0, 0), P)], { size: 1.1, tone: 'hi' }),
    ];
    add('near', ...dial);
    // tope: la barra baja hasta la báscula
    add('mid', t.box({ x: x + 12, y: -2, w: 2, d: 4, r: 0.3 }, Z + 3, 12, { tone: 'mid' }, 2, 0.2));
  }

  // rampas laterales y vía del pedido
  const LY0 = 28;
  for (const x of GATES.map((g) => g + 20)) {
    const flap = x - 8;
    add(
      'lane',
      t.box({ x: flap, y: 10, w: 16, d: LY0 - 10 + 4, r: 0.5 }, Z - 3, 3, { tone: 'lo' }, 2, 0.3),
      t.line(k.planOutline({ x: flap, y: 10, w: 16, d: LY0 - 6, r: 0.5 }, Z, P), { tone: 'lo' }),
      t.line(
        k.onTop(
          [
            [flap + 4, 18],
            [flap + 8, 22],
            [flap + 12, 18],
          ],
          Z,
          P
        ),
        { tone: 'hi', free: true }
      )
    );
  }
  const LX0 = GATES[0] + 6;
  const LX1 = 168;
  const lane: string[] = [t.box({ x: LX0, y: LY0, w: LX1 - LX0, d: 14, r: 0 }, Z - 3, 3, { tone: 'lo' }, 2, 0.3)];
  for (let x = LX0 + 4; x < LX1 - 1; x += 8) lane.push(t.topLine([x, LY0], [x, LY0 + 14], Z, { tone: 'faint' }));
  lane.push(t.line(k.planOutline({ x: LX0, y: LY0, w: LX1 - LX0, d: 14, r: 0 }, Z, P), { tone: 'lo' }));
  for (const x of [LX0 + 6, -20, 60, 120])
    lane.push(t.box({ x: x - 2, y: LY0 + 10, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3));
  add('lane', ...lane);
  // ventanilla de salida registrada, al final de la cinta principal
  add(
    'end',
    t.box({ x: 132, y: -18, w: 40, d: 36, r: 2 }, 0, 34, { tone: 'mid' }, 4, 0.8),
    t.box({ x: 130, y: -20, w: 44, d: 40, r: 2 }, 34, 3, { tone: 'hi' }, 4, 0.5),
    t.line(t.faceX(172, -10, 10, 8, 26), { tone: 'lo' }),
    t.line(t.seg([172, -10, 17], [172, 10, 17]), { tone: 'faint' }),
    t.dots([t.at([172, -6, 21]), t.at([172, 6, 21])], { size: 0.7, tone: 'hi' }),
    `<path class="iso-line" data-tone="green" style="stroke-width:2.6" d="${k.ring(160, -6, 3, 37.1, P, 20)}"/>`
  );

  // bandeja del pedido al final de la vía
  add(
    'end',
    t.box({ x: 136, y: 34, w: 44, d: 34, r: 1.5 }, 0, 14, { tone: 'mid' }, 4, 0.6),
    t.box({ x: 138.5, y: 36.5, w: 39, d: 29, r: 1 }, 12, 2.5, { tone: 'lo' }, 4, 0.2),
    ...[0, 1, 2].map((i) =>
      t.box(
        { x: 144 + i * 10, y: 42, w: 4, d: 18, r: 0.4 },
        14.5,
        18 + (i % 2) * 3,
        { tone: i === 1 ? 'hi' : 'mid' },
        2,
        0.3
      )
    )
  );

  return {
    width: W,
    height: H,
    body: [...head, ...layers.far, ...layers.mid, ...layers.lane, ...layers.near, ...layers.end],
  };
}
