import GithubSlugger from 'github-slugger';

/**
 * Lectura liviana del cuerpo MDX, sin compilarlo: títulos (para el índice "En esta guía" y los
 * anclas de búsqueda), enlaces a otras guías (para validarlos y calcular los "mencionado en"),
 * componentes usados (para detectar uno mal escrito) y texto plano (para la búsqueda).
 *
 * Los ids de los títulos salen del MISMO slugger que usa `rehype-slug` al renderizar: si no, el
 * ancla del índice apuntaría a un id que no existe.
 */

export type TocItem = { depth: 2 | 3; text: string; id: string };

export type ScannedBody = {
  toc: TocItem[];
  /** `<GuideLink to="slug">` y `<GuideLink to="slug#ancla">`. */
  guideLinks: { slug: string; anchor?: string }[];
  /** `<OpenScreen to="slug" />`. */
  screenLinks: string[];
  /** `<Figure name="x" … />`: `name` literal de cada figura (null si no está escrito como cadena literal). */
  figures: { name: string | null; hasCaption: boolean }[];
  /** Componentes JSX usados (`<Callout`, `<Steps`…). */
  components: string[];
  /** Cuerpo sin sintaxis, para buscar. Mantiene los títulos para poder ubicar el fragmento. */
  sections: { headingId?: string; heading?: string; text: string }[];
  words: number;
};

const CODE_FENCE_RE = /```[\s\S]*?```/g;
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*#*\s*$/;

/** Saca la sintaxis inline de markdown de un título: lo que queda es lo que ve el lector. */
function headingText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

function plain(markdown: string): string {
  return (
    markdown
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Los marcadores de énfasis se borran (no se reemplazan por espacio: "**Borrador**:" quedaba
      // "Borrador :" en los fragmentos de búsqueda); los de bloque sí separan palabras.
      .replace(/[*_`~]/g, '')
      .replace(/^\s*[-+]\s+/gm, ' ')
      .replace(/[#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function scanBody(body: string): ScannedBody {
  const withoutCode = body.replace(CODE_FENCE_RE, '');
  const slugger = new GithubSlugger();

  const toc: TocItem[] = [];
  const sections: ScannedBody['sections'] = [];
  let current: { headingId?: string; heading?: string; lines: string[] } = { lines: [] };

  for (const line of withoutCode.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      sections.push({ headingId: current.headingId, heading: current.heading, text: plain(current.lines.join('\n')) });
      const text = headingText(heading[2]);
      const id = slugger.slug(text);
      toc.push({ depth: heading[1].length as 2 | 3, text, id });
      current = { headingId: id, heading: text, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push({ headingId: current.headingId, heading: current.heading, text: plain(current.lines.join('\n')) });

  const guideLinks = [...withoutCode.matchAll(/<GuideLink\b[^>]*\bto="([^"#]+)(?:#([^"]+))?"/g)].map((m) => ({
    slug: m[1],
    anchor: m[2],
  }));
  const screenLinks = [...withoutCode.matchAll(/<OpenScreen\b[^>]*\bto="([^"]+)"/g)].map((m) => m[1]);
  const figures = [...withoutCode.matchAll(/<Figure\b([^>]*?)\/?>/g)].map((m) => ({
    name: /\bname="([^"]+)"/.exec(m[1])?.[1] ?? null,
    hasCaption: /\bcaption="[^"]+"/.test(m[1]),
  }));
  const components = [...new Set([...withoutCode.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]))];

  const nonEmpty = sections.filter((s) => s.text || s.heading);
  const words = nonEmpty.reduce((acc, s) => acc + (s.text ? s.text.split(' ').length : 0), 0);

  return { toc, guideLinks, screenLinks, figures, components, sections: nonEmpty, words };
}

/** Minúsculas y sin acentos: "Certificación" y "certificacion" tienen que encontrarse igual. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
