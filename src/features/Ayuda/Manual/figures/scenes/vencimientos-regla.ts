import { k, toolbox, type Scene } from './scene.ts';

/**
 * Vencimientos: una regla de bancada con un día por marca (de 6 días atrás a 30 adelante). El
 * cursor (`lit`) es HOY: a su izquierda, lo que ya venció (rojo); de 0 a 7 días, el pórtico naranja;
 * hasta el tope de 30 días, la ventana que lista el Dashboard. Cada carpeta está de pie sobre su
 * fecha de vencimiento. Sentido de los días: +x.
 */
const W = 680;
const H = 250;
const DAY = 9;
const OFF = -108; // x del día 0
const dx = (day: number) => OFF + day * DAY;
const ORANGE = 'stroke:var(--status-expired)';

export function buildVencimientosRegla(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -176, y: -26, w: 352, d: 52, r: 2 }, 0, 0), [dx(0), 0, 52], [dx(30), 0, 40]],
    W,
    H,
    { pad: 22, azimuth: 74, elevation: 36 }
  );
  const t = toolbox(P);
  const out: string[] = [];
  const x0 = dx(-6) - 8;
  const x1 = dx(30) + 8;
  out.push(
    `<path class="iso-halo" d="${k.haloOf({ x: x0 - 4, y: -28, w: x1 - x0 + 8, d: 56, r: 4 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`
  );

  // patas y regla
  for (const x of [x0 + 16, dx(7), dx(18), x1 - 24])
    out.push(t.box({ x: x - 5, y: -12, w: 10, d: 24, r: 1 }, 0, 4, { tone: 'lo' }, 2, 0.4));
  out.push(t.box({ x: x0, y: -16, w: x1 - x0, d: 32, r: 0 }, 4, 4, { tone: 'mid' }, 2, 0.5));
  out.push(t.line(k.planOutline({ x: x0 + 3, y: -13, w: x1 - x0 - 6, d: 26, r: 0 }, 8, P), { tone: 'faint' }));
  // marcas: un día por marca, mayores en 0, 7 y 30 y cada cinco días
  for (let d = -6; d <= 30; d++) {
    const big = d === 0 || d === 7 || d === 30;
    const len = big ? 6 : d % 5 === 0 ? 4.5 : 2.5;
    out.push(
      t.topLine([dx(d), 16 - 0.01], [dx(d), 16 - 0.01 - len], 8, { tone: big ? 'hi' : d % 5 === 0 ? 'mid' : 'lo' })
    );
  }
  // bandas de estado sobre la regla: ya vencido / por vencer / dentro de la ventana
  const band = (a: number, b: number, attr: string, style = '') =>
    `<path class="iso-line" ${attr} style="stroke-width:2.6;${style}" d="${k.lineOnTop([a, -9], [b, -9], 8, P)}"/>`;
  out.push(band(x0, dx(0), 'data-tone="red"'), band(dx(0), dx(7), '', ORANGE), band(dx(7), x1, 'data-tone="lo"'));
  // numerales grabados: 0, 7 y 30
  for (const [day, text] of [
    [7, '7'],
    [30, '30'],
  ] as const) {
    out.push(
      k.faceTextSvg(k.topMatrix([dx(day) - (day === 30 ? 2 : 0), 3], 8, P, 'x'), text, {
        size: 7,
        tone: 'hi',
        anchor: day === 30 ? 'end' : 'middle',
      })
    );
  }
  out.push(
    t.dots([t.at([x0 + 3, -13, 8]), t.at([x0 + 3, 13, 8]), t.at([x1 - 3, -13, 8]), t.at([x1 - 3, 13, 8])], {
      size: 0.55,
    })
  );

  // pórtico de 7 días (lejos): dos postes y una viga con el borde naranja
  for (const x of [dx(0) - 2, dx(7) - 2])
    out.push(t.box({ x, y: -24, w: 4, d: 4, r: 0.5 }, 0, 40, { tone: 'lo' }, 2, 0.4));
  out.push(t.box({ x: dx(0) - 2, y: -24, w: 7 * DAY + 4, d: 4, r: 0.5 }, 36, 4, { tone: 'mid' }, 2, 0.4));
  out.push(
    `<path class="iso-line" style="stroke-width:2.2;${ORANGE}" d="${k.lineOnTop([dx(0) - 1.95, -22], [dx(7) + 1.95, -22], 40, P)}"/>`
  );

  // carpetas de documentos sobre su fecha
  const folders: Array<[number, 'red' | 'orange' | 'none']> = [
    [-5, 'red'],
    [-2, 'red'],
    [3, 'orange'],
    [6, 'orange'],
    [13, 'none'],
    [21, 'none'],
    [28, 'none'],
  ];
  for (const [day, state] of folders) {
    const x = dx(day) - 2;
    const h = 20 + (day % 3) * 2;
    out.push(t.box({ x, y: -11, w: 4, d: 22, r: 0.4 }, 8, h, { tone: state === 'none' ? 'mid' : 'hi' }, 2, 0.3));
    out.push(t.box({ x, y: -4 + (day % 2) * 8, w: 4, d: 7, r: 0.3 }, 8 + h, 2.5, { tone: 'hi' }, 2, 0.2));
    out.push(t.line(t.seg([x + 4, -7, 8 + h - 6], [x + 4, 7, 8 + h - 6]), { tone: 'faint', free: true }));
    out.push(t.line(t.seg([x + 4, -7, 8 + h - 10], [x + 4, 1, 8 + h - 10]), { tone: 'faint', free: true }));
    if (state === 'red')
      out.push(
        `<path class="iso-line" data-tone="red" style="stroke-width:2.8" d="${k.ring(x + 2, 0, 2.4, 8 + h + 2.5, P, 16)}"/>`
      );
    if (state === 'orange')
      out.push(
        `<path class="iso-line" style="stroke-width:2.8;${ORANGE}" d="${k.ring(x + 2, 0, 2.4, 8 + h + 2.5, P, 16)}"/>`
      );
  }

  // cursor de HOY (lit): puente sobre la regla, aguja y perilla
  out.push(t.box({ x: dx(0) - 6, y: -15, w: 12, d: 30, r: 1 }, 8, 8, { tone: 'hi', lit: true }, 3, 0.6));
  out.push(t.solid(k.cylinder(dx(0), 0, 3.6, 16, 6, P, 24, 0.4), { tone: 'hi', lit: true, crease: 'lo' }));
  out.push(t.line(t.seg([dx(0) + 6, -12, 12], [dx(0) + 6, 12, 12]), { tone: 'lit', free: true }));
  // tope de 30 días
  out.push(t.box({ x: x1 - 6, y: -17, w: 8, d: 34, r: 1 }, 0, 18, { tone: 'mid' }, 3, 0.6));
  out.push(t.dots([t.at([x1 + 2, -8, 12]), t.at([x1 + 2, 8, 12])], { size: 0.7, tone: 'hi' }));

  return { width: W, height: H, body: out };
}
