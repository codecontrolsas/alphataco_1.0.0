import { k, toolbox, type Scene } from './scene.ts';

/**
 * Las cuatro pestañas del taller como cuatro estaciones sobre un mismo camino (guía "Del checklist
 * al taller", Paso 4): Por programar → Por ingresar → En taller → Aprobaciones. La pieza que se
 * mira (`lit`) es el equipo, que en la tercera estación entra al taller y pasa a No operativo.
 * Sentido de la línea: +x.
 */
const W = 640;
const H = 272;
const CX = [-150, -50, 50, 150];

export function buildTallerCircuito(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -198, y: -50, w: 396, d: 100, r: 2 }, 0, 0), [-150, -40, 58], [150, -44, 52], [50, -22, 46]],
    W,
    H,
    { pad: 22, azimuth: 64, elevation: 34 }
  );
  const t = toolbox(P);
  const out: string[] = [];
  out.push(
    `<path class="iso-halo" d="${k.haloOf({ x: -200, y: -52, w: 400, d: 104, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`
  );

  /** Plataforma y tramo de camino de una estación. */
  const base = (cx: number) => [
    t.box({ x: cx - 46, y: -48, w: 92, d: 96, r: 3 }, 0, 5, { tone: 'lo' }, 4, 0.6),
    t.line(k.planOutline(k.insetPlan({ x: cx - 46, y: -48, w: 92, d: 96, r: 3 }, 4), 5, P), { tone: 'faint' }),
    t.dots([t.at([cx - 42, -44, 5]), t.at([cx + 42, -44, 5]), t.at([cx - 42, 44, 5]), t.at([cx + 42, 44, 5])], {
      size: 0.55,
    }),
  ];
  const road = (cx: number) => [
    t.box({ x: cx - 46, y: -14, w: 92, d: 28, r: 0 }, 5, 3, { tone: 'mid' }, 2, 0.3),
    t.topLine([cx - 46, 0], [cx + 46, 0], 8, { tone: 'lo', dashed: true }),
    // flecha pintada en el camino: el sentido de la línea
    ...(cx === CX[2]
      ? []
      : [
          t.line(
            k.onTop(
              [
                [cx + 33, -6],
                [cx + 39, 0],
                [cx + 33, 6],
              ],
              8,
              P
            ),
            { tone: 'hi', free: true }
          ),
        ]),
  ];

  // ───────── 1. Por programar: calendario y bandeja con pedidos
  {
    const cx = CX[0];
    out.push(...base(cx));
    // calendario (lejos)
    for (const x of [cx - 20, cx + 17])
      out.push(t.box({ x, y: -42, w: 4, d: 4, r: 0.6 }, 5, 50, { tone: 'lo' }, 2, 0.3));
    out.push(t.box({ x: cx - 26, y: -43, w: 52, d: 3, r: 0.8 }, 30, 26, { tone: 'mid' }, 2, 0.4));
    out.push(t.line(t.faceY(-39.9, cx - 22, cx + 22, 32, 54 - 2.5), { tone: 'faint' }));
    out.push(t.line(t.seg([cx - 22, -39.9, 49], [cx + 22, -39.9, 49]), { tone: 'lo' }));
    const days: k.Point3[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) days.push([cx - 18 + c * 6, -39.9, 34.5 + r * 4.2]);
    out.push(t.dots(days.map(t.at), { size: 0.7, tone: 'mid' }));
    out.push(t.dots([t.at([cx - 18 + 4 * 6, -39.9, 34.5 + 4.2])], { size: 1.5, tone: 'hi' }));
    out.push(...road(cx));
    // bandeja con carpetas (cerca)
    out.push(t.box({ x: cx - 30, y: 20, w: 60, d: 24, r: 1 }, 5, 3, { tone: 'mid' }, 2, 0.4));
    out.push(t.box({ x: cx - 30, y: 20, w: 2.5, d: 24, r: 0 }, 8, 7, { tone: 'lo' }, 2, 0.3));
    out.push(t.box({ x: cx + 27.5, y: 20, w: 2.5, d: 24, r: 0 }, 8, 7, { tone: 'lo' }, 2, 0.3));
    [0, 1, 2, 3, 4].forEach((i) => {
      const x = cx - 24 + i * 11;
      const h = 22 + (i % 3) * 3;
      out.push(t.box({ x, y: 24, w: 4, d: 16, r: 0.4 }, 8, h, { tone: i === 4 ? 'hi' : 'mid' }, 2, 0.3));
      out.push(t.box({ x, y: 28 + (i % 2) * 4, w: 4, d: 5, r: 0.3 }, 8 + h, 3, { tone: 'hi' }, 2, 0.2));
      out.push(t.line(t.seg([x + 4, 26, 8 + h - 6], [x + 4, 38, 8 + h - 6]), { tone: 'faint', free: true }));
      out.push(t.line(t.seg([x + 4, 26, 8 + h - 10], [x + 4, 34, 8 + h - 10]), { tone: 'faint', free: true }));
    });
  }

  // ───────── 2. Por ingresar: barrera abierta y garita
  {
    const cx = CX[1];
    out.push(...base(cx));
    out.push(...road(cx));
    // poste con contrapeso (lejos) y pluma abierta, paralela al camino
    out.push(t.box({ x: cx - 34, y: -26, w: 10, d: 10, r: 1.2 }, 5, 30, { tone: 'mid' }, 3, 0.5));
    out.push(t.box({ x: cx - 33, y: -25, w: 8, d: 8, r: 1 }, 35, 3, { tone: 'hi' }, 3, 0.3));
    out.push(t.solid(k.cylinder(cx - 29, -21, 3, 38, 3, P, 20, 0.3), { tone: 'hi', crease: 'lo' }));
    out.push(t.box({ x: cx - 26, y: -23, w: 46, d: 4, r: 0.8 }, 36, 4, { tone: 'hi' }, 2, 0.3));
    for (let i = 0; i < 6; i++)
      out.push(t.line(t.seg([cx - 21 + i * 7, -23, 40], [cx - 21 + i * 7, -19, 40]), { tone: i % 2 ? 'lo' : 'mid' }));
    out.push(t.dots([t.at([cx - 29, -21, 41.2])], { size: 0.8, tone: 'hi' }));
    out.push(t.box({ x: cx + 18, y: -26, w: 6, d: 8, r: 0.8 }, 5, 26, { tone: 'lo' }, 2, 0.3)); // apoyo de la pluma
    // garita (cerca)
    const g = { x: cx - 16, y: 24, w: 32, d: 22, r: 2 };
    out.push(t.box(g, 5, 32, { tone: 'mid' }, 3, 0.8));
    out.push(t.line(t.faceY(46, cx - 10, cx + 10, 22, 34), { tone: 'lo' }));
    out.push(t.line(t.seg([cx, 46, 22], [cx, 46, 34]), { tone: 'faint' }));
    out.push(t.line(t.faceX(cx + 16, 30, 42, 22, 34), { tone: 'lo' }));
    out.push(t.box({ x: cx - 20, y: 22, w: 40, d: 26, r: 2 }, 37, 3, { tone: 'hi' }, 3, 0.6));
    out.push(t.dots([t.at([cx - 12, 46, 12]), t.at([cx + 12, 46, 12])], { size: 0.7, tone: 'hi' }));
    // lámpara de la garita
    out.push(t.solid(k.cylinder(cx + 14, 44, 2.2, 40, 4, P, 16, 0.2), { tone: 'hi', crease: 'lo' }));
    // reductores de velocidad sobre el camino
    for (const x of [cx + 20, cx + 30])
      out.push(t.box({ x, y: -13, w: 4, d: 26, r: 0.6 }, 8, 1.2, { tone: 'lo' }, 2, 0.2));
  }

  // ───────── 3. En taller: elevador, equipo, armario y cubiertas
  {
    const cx = CX[2];
    out.push(...base(cx));
    out.push(...road(cx));
    // armario de herramientas (lejos)
    out.push(t.box({ x: cx - 34, y: -44, w: 36, d: 18, r: 1 }, 5, 34, { tone: 'mid' }, 3, 0.6));
    out.push(t.box({ x: cx - 35, y: -45, w: 38, d: 20, r: 1 }, 39, 2.5, { tone: 'hi' }, 3, 0.4));
    for (const z of [14, 22, 30]) {
      out.push(t.line(k.sideSeam({ x: cx - 34, y: -44, w: 36, d: 18, r: 1 }, z, P, 3), { tone: 'lo' }));
      out.push(t.line(t.seg([cx - 20, -26, z - 3], [cx - 12, -26, z - 3]), { tone: 'hi', free: true }));
    }
    // elevador: columnas lejanas y travesaño
    for (const x of [cx - 36, cx + 31])
      out.push(t.box({ x, y: -22, w: 5, d: 5, r: 0.8 }, 5, 44, { tone: 'lo' }, 2, 0.4));
    out.push(t.box({ x: cx - 36, y: -22, w: 72, d: 4, r: 0.6 }, 45, 4, { tone: 'mid' }, 2, 0.3));
    // plataforma
    out.push(t.box({ x: cx - 34, y: -16, w: 68, d: 32, r: 1.5 }, 8, 6, { tone: 'mid' }, 3, 0.6));
    out.push(
      t.line(k.planOutline(k.insetPlan({ x: cx - 34, y: -16, w: 68, d: 32, r: 1.5 }, 3), 14, P), { tone: 'faint' })
    );
    // el equipo (lit)
    const z0 = 14;
    out.push(t.box({ x: cx - 28, y: -8, w: 56, d: 16, r: 1 }, z0 + 4, 4, { tone: 'lo' }, 2, 0.3));
    for (const wx of [cx - 18, cx + 14]) {
      out.push(t.wheelY(wx, -13, z0 + 6.5, 6.5, 5, -1));
    }
    out.push(t.box({ x: cx - 28, y: -10, w: 34, d: 20, r: 1.5 }, z0 + 8, 20, { tone: 'hi', lit: true }, 3, 0.8));
    out.push(t.line(t.seg([cx - 11, 10, z0 + 9], [cx - 11, 10, z0 + 27]), { tone: 'faint' }));
    out.push(t.line(t.seg([cx + 2, 10, z0 + 9], [cx + 2, 10, z0 + 27]), { tone: 'faint' }));
    out.push(t.box({ x: cx + 8, y: -10, w: 20, d: 20, r: 2 }, z0 + 8, 14, { tone: 'hi', lit: true }, 3, 0.8));
    out.push(t.line(t.faceX(cx + 28, -7, 7, z0 + 17, z0 + 21), { tone: 'hi' }));
    out.push(t.line(t.faceY(10, cx + 11, cx + 25, z0 + 17, z0 + 21), { tone: 'hi' }));
    out.push(t.dots([t.at([cx + 28, -6, z0 + 11]), t.at([cx + 28, 6, z0 + 11])], { size: 0.8, tone: 'hi' }));
    for (const wx of [cx - 18, cx + 14]) out.push(t.wheelY(wx, 8, z0 + 6.5, 6.5, 5, 1));
    // columnas cercanas
    for (const x of [cx - 36, cx + 31])
      out.push(t.box({ x, y: 17, w: 5, d: 5, r: 0.8 }, 5, 44, { tone: 'lo' }, 2, 0.4));
    out.push(t.dots([t.at([cx - 33.5, 17, 49.1]), t.at([cx + 33.5, 17, 49.1])], { size: 0.5 }));
    // cubiertas apiladas y tablero de órdenes (cerca)
    for (let i = 0; i < 3; i++) {
      out.push(t.solid(k.cylinder(cx - 22, 34, 8.5, 5 + i * 5, 5, P, 24, 0.5), { tone: 'mid' }));
      out.push(t.line(k.ring(cx - 22, 34, 4.5, 10 + i * 5, P, 20), { tone: 'faint' }));
    }
    out.push(t.box({ x: cx + 8, y: 36, w: 18, d: 3, r: 0.6 }, 5, 30, { tone: 'mid' }, 2, 0.3));
    for (const z of [30, 25, 20, 15])
      out.push(t.line(t.seg([cx + 10, 39, z], [cx + 24, 39, z]), { tone: 'faint', free: true }));
    out.push(t.dots([t.at([cx + 17, 39, 33])], { size: 0.9, tone: 'hi' }));
  }

  // ───────── 4. Aprobaciones: escritorio con sello y archivo
  {
    const cx = CX[3];
    out.push(...base(cx));
    // escritorio (lejos)
    for (const [x, y] of [
      [cx - 34, -46],
      [cx + 12, -46],
      [cx - 34, -26],
      [cx + 12, -26],
    ])
      out.push(t.box({ x, y, w: 4, d: 4, r: 0.5 }, 5, 22, { tone: 'lo' }, 2, 0.3));
    out.push(t.box({ x: cx - 36, y: -48, w: 54, d: 26, r: 1.5 }, 27, 3, { tone: 'hi' }, 3, 0.6));
    out.push(
      t.line(k.planOutline(k.insetPlan({ x: cx - 36, y: -48, w: 54, d: 26, r: 1.5 }, 2.5), 30, P), { tone: 'faint' })
    );
    // sello
    out.push(t.box({ x: cx - 28, y: -42, w: 12, d: 12, r: 1 }, 30, 3, { tone: 'mid' }, 3, 0.4));
    out.push(t.solid(k.cylinder(cx - 22, -36, 2.2, 33, 9, P, 16, 0.3), { tone: 'hi', crease: 'lo' }));
    out.push(t.solid(k.cylinder(cx - 22, -36, 4.4, 42, 3, P, 20, 0.4), { tone: 'hi', crease: 'lo' }));
    // pila de papeles y bandeja
    out.push(t.box({ x: cx - 12, y: -44, w: 14, d: 18, r: 0.4 }, 30, 2, { tone: 'mid' }, 2, 0.2));
    out.push(t.box({ x: cx - 11, y: -43, w: 12, d: 16, r: 0.4 }, 32, 2, { tone: 'lo' }, 2, 0.2));
    out.push(t.line(t.seg([cx + 1, -43, 33], [cx + 1, -27, 33]), { tone: 'faint' }));
    // pantalla
    out.push(t.box({ x: cx + 4, y: -38, w: 3, d: 18, r: 0.6 }, 40, 14, { tone: 'mid' }, 2, 0.3));
    out.push(t.box({ x: cx + 3, y: -31, w: 5, d: 4, r: 0.5 }, 30, 10, { tone: 'lo' }, 2, 0.2));
    for (const [y0, y1, z] of [
      [-36, -22, 50],
      [-36, -26, 47],
      [-36, -24, 44],
    ] as const)
      out.push(t.line(t.seg([cx + 7, y0, z], [cx + 7, y1, z]), { tone: 'faint', free: true }));
    out.push(t.line(t.faceX(cx + 7, -37, -21, 41, 53), { tone: 'lo' }));
    out.push(...road(cx));
    // lámpara de aprobado: el único color de la figura
    out.push(t.solid(k.cylinder(cx + 36, -14, 2.6, 8, 24, P, 16, 0.2), { tone: 'lo', crease: 'none' }));
    out.push(t.solid(k.cylinder(cx + 36, -14, 5, 32, 8, P, 20, 0.4), { tone: 'mid', crease: 'lo' }));
    out.push(
      `<path class="iso-line" data-tone="green" style="stroke-width:2.2" d="${k.ring(cx + 36, -14, 3.2, 40, P, 20)}"/>`
    );
    // archivo (cerca)
    out.push(t.box({ x: cx - 10, y: 18, w: 36, d: 22, r: 1 }, 5, 34, { tone: 'mid' }, 3, 0.6));
    out.push(t.box({ x: cx - 11, y: 17, w: 38, d: 24, r: 1 }, 39, 2.5, { tone: 'hi' }, 3, 0.4));
    for (const z of [16, 25, 34]) {
      out.push(t.line(k.sideSeam({ x: cx - 10, y: 18, w: 36, d: 22, r: 1 }, z, P, 3), { tone: 'lo' }));
    }
    for (const z of [10.5, 20, 29.5])
      out.push(t.line(t.seg([cx + 4, 40, z], [cx + 12, 40, z]), { tone: 'hi', free: true }));
    // carpeta cerrada sobre el archivo
    out.push(t.box({ x: cx - 2, y: 24, w: 18, d: 12, r: 0.6 }, 41.5, 2, { tone: 'hi' }, 2, 0.3));
  }

  return { width: W, height: H, body: out };
}
