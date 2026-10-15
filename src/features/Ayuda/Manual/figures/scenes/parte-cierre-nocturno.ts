import { G, k, pointOf, toolbox, type Scene } from './scene.ts';

/**
 * Cierre automático de los partes (guía "Partes diarios"): una bandeja por día con sus líneas de pie.
 * Una marca verde en la línea = resuelta (Ejecutado, Reprogramado, Cancelado o En certificación);
 * una roja = Pendiente o Sin recursos asignados. Un pórtico con reloj en 00:30 (lo que se mira,
 * `lit`) recorre los días anteriores: bandera verde = Cerrado completo, roja = Cerrado incompleto.
 * La bandeja de hoy sigue Abierta, sin bandera. Los días pasan en sentido +x.
 */
const W = 680;
const H = 300;
const TRAYS = [-135, -45, 45, 135];
const BAR_X = 80;

export function buildParteCierreNocturno(): Scene {
  const P = k.fitProjection(
    [...k.boxCorners({ x: -190, y: -44, w: 380, d: 90, r: 2 }, 0, 0), [BAR_X, 0, 64], [-135, -18, 44], [-45, -18, 44]],
    W,
    H,
    { pad: 22, azimuth: 58, elevation: 35 }
  );
  const t = toolbox(P);
  const out: string[] = [
    `<path class="iso-halo" d="${k.haloOf({ x: -192, y: -46, w: 384, d: 94, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`,
  ];
  const tone = (c: 'green' | 'red') => `data-tone="${c}"`;
  const ring = (x: number, y: number, z: number, c: 'green' | 'red') =>
    `<path class="iso-line" ${tone(c)} style="stroke-width:2.6" d="${k.ring(x, y, 2, z, P, 16)}"/>`;

  // riel lejano y pie del pórtico lejano
  out.push(t.box({ x: -190, y: -46, w: 380, d: 6, r: 1 }, 0, 4, { tone: 'lo' }, 2, 0.4));
  out.push(t.line(k.lineOnTop([-189.4, -43], [189.4, -43], 4, P), { tone: 'faint' }));

  type Card = 'ok' | 'no' | 'open';
  const tray = (cx: number, cards: Card[], flag: 'green' | 'red' | null) => {
    const s: string[] = [];
    s.push(t.box({ x: cx - 36, y: -22, w: 72, d: 44, r: 2 }, 4, 3, { tone: 'mid' }, 4, 0.6));
    s.push(t.line(k.planOutline({ x: cx - 32, y: -18, w: 64, d: 36, r: 1 }, 7, P), { tone: 'faint' }));
    s.push(
      t.dots(
        [
          t.at([cx - 33.5, -19.5, 7]),
          t.at([cx + 33.5, -19.5, 7]),
          t.at([cx - 33.5, 19.5, 7]),
          t.at([cx + 33.5, 19.5, 7]),
        ],
        { size: 0.55 }
      )
    );
    cards.forEach((state, i) => {
      const x = cx - 28 + i * 13;
      const h = 22 + (i % 2) * 3;
      s.push(t.box({ x, y: -14, w: 3.5, d: 28, r: 0.4 }, 7, h, { tone: state === 'open' ? 'mid' : 'hi' }, 2, 0.3));
      s.push(t.line(t.seg([x + 3.5, -9, 7 + h - 6], [x + 3.5, 9, 7 + h - 6]), { tone: 'faint', free: true }));
      s.push(t.line(t.seg([x + 3.5, -9, 7 + h - 10], [x + 3.5, 3, 7 + h - 10]), { tone: 'faint', free: true }));
      if (state === 'open') s.push(t.dots([t.at([x + 1.75, 0, 7 + h])], { size: 0.7, tone: 'mid' }));
      else s.push(ring(x + 1.75, 0, 7 + h, state === 'ok' ? 'green' : 'red'));
    });
    if (flag) {
      s.push(t.box({ x: cx + 31, y: -20, w: 2, d: 2, r: 0.3 }, 4, 38, { tone: 'lo' }, 2, 0.2));
      s.push(t.box({ x: cx + 31, y: -18, w: 1.6, d: 18, r: 0.3 }, 28, 12, { tone: 'hi' }, 2, 0.2));
      s.push(
        `<path class="iso-line" ${tone(flag)} style="stroke-width:2.2" d="${t.faceX(cx + 32.6, -18, 0, 28, 40)}"/>`
      );
    }
    return s.join('');
  };
  out.push(tray(TRAYS[0], ['ok', 'ok', 'ok', 'ok', 'ok'], 'green'));
  out.push(tray(TRAYS[1], ['ok', 'ok', 'no', 'ok', 'ok'], 'red'));
  out.push(tray(TRAYS[2], ['ok', 'ok', 'ok', 'no', 'ok'], null));

  // pórtico: poste lejano, travesaño, cabezal con reloj
  for (const x of [BAR_X]) out.push(t.box({ x: x - 3, y: -46, w: 6, d: 6, r: 0.8 }, 4, 56, { tone: 'mid' }, 3, 0.5));
  out.push(t.box({ x: BAR_X - 4, y: -46, w: 8, d: 92, r: 0.8 }, 60, 6, { tone: 'hi' }, 3, 0.6));
  out.push(t.line(k.lineOnTop([BAR_X, -45.4], [BAR_X, 45.4], 66, P), { tone: 'faint' }));
  out.push(t.box({ x: BAR_X + 4, y: -12, w: 12, d: 24, r: 1.5 }, 38, 28, { tone: 'hi', lit: true }, 3, 0.8));
  {
    const F = G.frameAlong([BAR_X + 16, 0, 52], [1, 0, 0]);
    const up = G.angleToward(F, [0, 0, 1]);
    const at = (r: number, a: number) => k.iso(pointOf(F, 0, r, a), P);
    // sentido horario en pantalla: el que mueve el punto hacia la derecha al pasar de las 12
    const sign = at(8, up + 0.3)[0] > at(8, up)[0] ? 1 : -1;
    out.push(t.solid(G.disc(0, 1.5, 10.5, F, P), { tone: 'hi', lit: true, crease: 'lo' }));
    const ticks = Array.from({ length: 12 }, (_, i) =>
      k.pathOf([at(8.6, up + sign * i * 0.5236), at(9.9, up + sign * i * 0.5236)])
    );
    out.push(
      `<path class="iso-line" data-tone="mid" d="${ticks.join('')}"/>`.replace(
        'class="iso-line"',
        'class="iso-line" data-free=""'
      )
    );
    out.push(
      t.line(k.pathOf([k.iso(pointOf(F, 1.5, 0, 0), P), k.iso(pointOf(F, 1.5, 5.8, up + sign * 3.1416), P)]), {
        tone: 'lit',
        free: 'end',
      })
    );
    out.push(
      t.line(k.pathOf([k.iso(pointOf(F, 1.5, 0, 0), P), k.iso(pointOf(F, 1.5, 4, up + sign * 0.26), P)]), {
        tone: 'lit',
        free: 'end',
      })
    );
    out.push(t.dots([k.iso(pointOf(F, 1.5, 0, 0), P)], { size: 1, tone: 'hi' }));
  }
  // bandeja de hoy (abierta) y riel cercano
  out.push(tray(TRAYS[3], ['open', 'open', 'open'], null));
  out.push(t.box({ x: -190, y: 40, w: 380, d: 6, r: 1 }, 0, 4, { tone: 'lo' }, 2, 0.4));
  out.push(t.line(k.lineOnTop([-189.4, 43], [189.4, 43], 4, P), { tone: 'faint' }));
  out.push(t.box({ x: BAR_X - 3, y: 40, w: 6, d: 6, r: 0.8 }, 4, 56, { tone: 'mid' }, 3, 0.5));
  out.push(t.dots([t.at([BAR_X, 43, 60.1])], { size: 0.5 }));

  return { width: W, height: H, body: out };
}
