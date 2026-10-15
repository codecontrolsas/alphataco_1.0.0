import { k, toolbox, type Scene } from './scene.ts';

/**
 * Validar solicitud: ítem por ítem. Los ítems salen de la tolva sin decidir y pasan por un sensor;
 * en la estación de decisión un empujador (lo que se mira, `lit`) saca a un lado los rechazados, que
 * caen a su bandeja, y los aprobados siguen derecho hasta la carpeta del pedido para el taller.
 * Verde y rojo son el único color: es lo que significa cada ítem. Sentido: +x.
 */
const W = 640;
const H = 330;
const Z = 14; // altura de la cara superior de la cinta
const X0 = -140;
const X1 = 150;

export function buildValidacionSolicitud(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -196, y: -40, w: 392, d: 120, r: 2 }, 0, 0), [20, -30, 44], [-170, 0, 50]],
    W,
    H,
    { pad: 22, azimuth: 52, elevation: 36 }
  );
  const t = toolbox(P);
  const out: string[] = [];
  out.push(
    `<path class="iso-halo" d="${k.haloOf({ x: -196, y: -40, w: 392, d: 122, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`
  );

  const mark = (cx: number, cy: number, tone: 'green' | 'red', z: number) =>
    `<path class="iso-line" data-tone="${tone}" style="stroke-width:2.6" d="${k.ring(cx, cy, 2, z, P, 16)}"/>`;
  /** Tarjeta de un ítem de la solicitud, de pie sobre la cinta. */
  const card = (x: number, y: number, z: number, state: 'open' | 'ok' | 'no') => {
    const top = z + 22;
    const parts = [
      t.box({ x, y, w: 3.5, d: 16, r: 0.5 }, z, 22, { tone: state === 'open' ? 'mid' : 'hi' }, 2, 0.3),
      t.line(t.seg([x + 3.5, y + 3, z + 14], [x + 3.5, y + 13, z + 14]), { tone: 'faint', free: true }),
      t.line(t.seg([x + 3.5, y + 3, z + 10], [x + 3.5, y + 9, z + 10]), { tone: 'faint', free: true }),
      t.line(t.seg([x + 3.5, y + 3, z + 6], [x + 3.5, y + 11, z + 6]), { tone: 'faint', free: true }),
    ];
    if (state !== 'open') parts.push(mark(x + 1.75, y + 8, state === 'ok' ? 'green' : 'red', top));
    else parts.push(t.dots([t.at([x + 1.75, y + 8, top])], { size: 0.6, tone: 'mid' }));
    return parts.join('');
  };
  const legs = [-130, -70, -10, 50, 110, 150];

  // tolva de entrada (lejos de todo): la solicitud con sus ítems
  out.push(t.box({ x: -196, y: -16, w: 40, d: 32, r: 1.5 }, 0, 24, { tone: 'mid' }, 4, 0.8));
  out.push(t.box({ x: -194, y: -14, w: 36, d: 28, r: 1 }, 24, 2, { tone: 'lo' }, 4, 0.3));
  for (const i of [0, 1, 2])
    out.push(t.box({ x: -190 + i * 9, y: -10, w: 3.5, d: 16, r: 0.4 }, 26, 14, { tone: 'mid' }, 2, 0.3));
  // empujador (lejos): carcasa
  out.push(t.box({ x: 6, y: -42, w: 30, d: 18, r: 1.5 }, 4, 30, { tone: 'mid' }, 3, 0.8));
  out.push(t.box({ x: 4, y: -43, w: 34, d: 20, r: 1.5 }, 34, 3, { tone: 'hi' }, 3, 0.5));
  out.push(
    t.dots([t.at([10, -24, 28]), t.at([32, -24, 28]), t.at([10, -24, 12]), t.at([32, -24, 12])], { size: 0.65 })
  );
  out.push(t.line(t.seg([6.8, -24, 20], [35.2, -24, 20]), { tone: 'lo', free: true }));
  // patas y riel lejano
  for (const x of legs) out.push(t.box({ x: x - 2, y: -14, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3));
  out.push(t.box({ x: X0, y: -14, w: X1 - X0, d: 3, r: 0.6 }, Z - 6, 6, { tone: 'mid' }, 2, 0.3));
  // sensor: poste lejano, poste cercano (más abajo, tras la cinta) y haz entre ambos
  out.push(t.box({ x: -50, y: -19, w: 4, d: 4, r: 0.5 }, 0, 36, { tone: 'mid' }, 2, 0.4));
  // cinta con rodillos
  out.push(t.box({ x: X0, y: -11, w: X1 - X0, d: 22, r: 0 }, Z - 3, 3, { tone: 'lo' }, 2, 0.3));
  for (let x = X0 + 4; x <= X1 - 3; x += 8) out.push(t.topLine([x, -11], [x, 11], Z, { tone: 'faint' }));
  out.push(t.line(k.planOutline({ x: X0, y: -11, w: X1 - X0, d: 22, r: 0 }, Z, P), { tone: 'lo' }));
  // ítems sin decidir, antes de la estación; aprobados, después
  for (const x of [-120, -88, -56]) out.push(card(x, -8, Z, 'open'));
  for (const x of [78, 108]) out.push(card(x, -8, Z, 'ok'));
  // vástago del empujador, por encima de la cinta: del cilindro lejano hasta la placa
  out.push(t.box({ x: 20, y: -24, w: 3, d: 36, r: 0.4 }, 24, 3, { tone: 'hi', lit: true }, 2, 0.3));
  // riel cercano y patas
  out.push(t.box({ x: X0, y: 11, w: X1 - X0, d: 3, r: 0.6 }, Z - 6, 6, { tone: 'mid' }, 2, 0.3));
  for (const x of legs) out.push(t.box({ x: x - 2, y: 10, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3));
  // poste cercano del sensor y su haz
  out.push(t.box({ x: -50, y: 15, w: 4, d: 4, r: 0.5 }, 0, 36, { tone: 'mid' }, 2, 0.4));
  out.push(
    t.line(t.seg([-48, -15, 33], [-48, 15, 33]), { tone: 'mid', dotted: true }),
    t.dots([t.at([-48, 15, 33]), t.at([-48, -15, 33])], { size: 0.9, tone: 'hi' })
  );
  // rampa lateral hacia la bandeja de rechazados
  out.push(t.box({ x: 4, y: 14, w: 36, d: 32, r: 0.8 }, Z - 3, 3, { tone: 'lo' }, 2, 0.3));
  for (let y = 18; y <= 44; y += 6) out.push(t.topLine([4.8, y], [39.2, y], Z, { tone: 'faint' }));
  out.push(t.line(k.planOutline({ x: 4, y: 14, w: 36, d: 32, r: 0.8 }, Z, P), { tone: 'lo' }));
  for (const x of [8, 34]) out.push(t.box({ x, y: 41, w: 4, d: 4, r: 0.4 }, 0, Z - 2, { tone: 'lo' }, 2, 0.3));
  // bandeja de rechazados con su ítem
  out.push(t.box({ x: -2, y: 48, w: 48, d: 34, r: 1.5 }, 0, 12, { tone: 'mid' }, 4, 0.6));
  out.push(t.box({ x: 0.5, y: 50.5, w: 43, d: 29, r: 1 }, 10, 2.5, { tone: 'lo' }, 4, 0.2));
  out.push(card(19, 56, 12.5, 'no'));
  out.push(
    t.dots([t.at([2, 52, 12.1]), t.at([42, 52, 12.1]), t.at([2, 78, 12.1]), t.at([42, 78, 12.1])], { size: 0.5 })
  );
  // carpeta del pedido, al final de la cinta
  out.push(t.box({ x: 142, y: -18, w: 44, d: 36, r: 1.5 }, 0, 10, { tone: 'mid' }, 4, 0.6));
  out.push(t.box({ x: 144.5, y: -15.5, w: 39, d: 31, r: 1 }, 8, 2.5, { tone: 'lo' }, 4, 0.2));
  for (const i of [0, 1, 2])
    out.push(
      t.box(
        { x: 150 + i * 10, y: -10, w: 4, d: 20, r: 0.4 },
        10.5,
        20 + (i % 2) * 3,
        { tone: i === 2 ? 'hi' : 'mid' },
        2,
        0.3
      )
    );
  // placa del empujador (lit): empuja al ítem rechazado hacia la rampa
  out.push(t.box({ x: 12, y: 12, w: 18, d: 3, r: 0.8 }, Z + 3, 18, { tone: 'hi', lit: true }, 2, 0.4));
  out.push(t.line(t.seg([12.9, 15, Z + 12], [29.1, 15, Z + 12]), { tone: 'lit', free: true }));
  // tablero de mando en el poste cercano
  out.push(t.box({ x: 50, y: 18, w: 10, d: 14, r: 1 }, 0, 20, { tone: 'mid' }, 2, 0.5));
  out.push(t.box({ x: 49, y: 17, w: 12, d: 16, r: 1 }, 20, 6, { tone: 'hi' }, 2, 0.4));
  out.push(t.dots([t.at([54, 29, 24]), t.at([54, 22, 24])], { size: 1, tone: 'hi' }));
  out.push(mark(55, 25.5, 'green', 26.1));

  return { width: W, height: H, body: out };
}
