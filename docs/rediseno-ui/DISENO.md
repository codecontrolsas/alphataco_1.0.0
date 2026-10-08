# alphataco — Lenguaje visual "Operativo y preciso"

Especificación, no implementación. Stack: Next.js 16 · React 19 · Tailwind v4 (`src/app/globals.css`) · shadcn/ui new-york (`src/components/ui`).
Contrastes medidos con un script OKLCH→sRGB (WCAG 2.x). Paleta de gráficos validada con el validador de la skill `dataviz` (ΔE OKLab×100, simulación CVD Machado 2009).

---

## 1. Principios

| # | Principio | Regla concreta | Contra GH |
|---|---|---|---|
| 1 | **La tabla es la pantalla** | El foco de cada vista es el dato. Títulos chicos (20px), nada decorativo compite con la grilla. | GH: cards con sombra y KPIs grandes que empujan la tabla hacia abajo. |
| 2 | **Líneas, no sombras** | Jerarquía con hairlines de 1px y cambio tonal canvas→panel. Sombra solo en capas flotantes (popover, dialog, toast). | GH: `shadow` en Button, Card, Dialog, Sheet. |
| 3 | **Esquinas rectas en todo** | `--radius: 0`. Excepciones: avatar, punto de estado y switch-thumb, que son `rounded-full`. | GH: `rounded-md`/`rounded-lg` en todo. |
| 4 | **Tipografía técnica** | IBM Plex Sans + Plex Mono. `tabular-nums` en todo número que se compara. Mono para legajo, CUIT, patente, códigos e importes en tabla. | GH: Poppins, cifras proporcionales. |
| 5 | **El color significa algo** | Gris para la estructura y un acento verde (acción, selección, foco). El color de estado sale siempre de 5 tokens semánticos, con ícono y texto. Nunca `bg-blue-500`. | GH: primary azul, secondary violeta y destructive rojo fijos. Badges `yellow/red/info` de paleta. |
| 6 | **Barra de acento de 2px como firma** | Lo activo o seleccionado se marca con una regla de 2px en `--primary`: ítem del sidebar (ya existe en `NavMain`), tab activa (subrayado), fila seleccionada (borde izquierdo), card KPI enfocada y fila de form con error (borde izquierdo en danger). | GH: fondo relleno para lo activo. |
| 7 | **Denso en desktop, táctil en mobile** | Controles de 32px con `pointer: fine` y 44px con `pointer: coarse`. En mobile la tabla pasa a tarjetas y los paneles salen desde abajo. | GH: h-10 fijo y tabla con scroll horizontal en mobile. |

Modo: **instrumental**. Densidad elegida: padding de panel 16px, celdas 8×12px, gap entre grupos 24px. Se mantiene el mismo número en toda la app.

---

## 2. Tokens (`globals.css`)

### 2.1 Arquitectura
- **Primitivos**: los valores oklch de abajo. Ningún componente los usa directo.
- **Semánticos**: se respetan los nombres shadcn (`--background`, `--card`, `--primary`…) y se agregan `--canvas`, `--panel-2`, `--border-strong`, `--primary-hover`, `--primary-soft`, `--primary-text`, `--fg-subtle`, `--{success|warning|danger|info|neutral}{,-soft,-border,-text}`, `--chart-1..6`, `--chart-other`, `--chart-grid`, `--chart-axis`.
- **Convención shadcn**: `--primary` es la marca. `--accent` sigue siendo el **hover neutro** (no es la marca).
- **Prohibido en componentes**: `bg-white`, `dark:bg-slate-*`, `text-gray-*`, `bg-{red|green|yellow|blue|purple|emerald}-*`. Va una regla de lint/grep en la migración.
- **Tema**: un solo mecanismo, la clase `.dark` (`@custom-variant dark` ya existe). `next-themes` con `disableTransitionOnChange`.
- **Neutrales**: grafito frío, hue 245, croma ≤ 0.016. El tono del hue es constante en toda la escala.

### 2.2 `:root` (claro)

```css
:root {
  --radius: 0;

  /* Superficies (canvas gris + paneles blancos separados por hairline) */
  --canvas: oklch(0.975 0.003 240);        /* fondo de página (body) */
  --background: oklch(0.975 0.003 240);    /* = canvas: shadcn lo usa como base */
  --card: oklch(1 0 0);                    /* panel */
  --panel-2: oklch(0.985 0.002 240);       /* sub-panel, header de tabla alterno */
  --popover: oklch(1 0 0);
  --muted: oklch(0.955 0.004 240);         /* header de tabla, fills inactivos */

  /* Texto: 4 niveles */
  --foreground: oklch(0.205 0.012 245);           /* 17.9:1 sobre card */
  --card-foreground: oklch(0.205 0.012 245);
  --popover-foreground: oklch(0.205 0.012 245);
  --muted-foreground: oklch(0.50 0.016 245);      /* 5.98 card · 5.57 canvas · 5.25 muted */
  --fg-subtle: oklch(0.60 0.014 245);             /* 3.94: SOLO placeholders/íconos/disabled, nunca texto informativo */

  /* Líneas */
  --border: oklch(0.905 0.006 245);         /* hairline de estructura (1.33, decorativo) */
  --border-strong: oklch(0.82 0.008 245);   /* separador de header de tabla / page header */
  --input: oklch(0.64 0.014 245);           /* borde de control: 3.36 card · 3.12 canvas (≥3:1, WCAG 1.4.11) */

  /* Marca (verde esmeralda ajustado) */
  --primary: oklch(0.505 0.11 163);               /* fill de botón; 5.49 vs card */
  --primary-foreground: oklch(0.99 0.01 165);     /* 5.36 sobre primary */
  --primary-hover: oklch(0.445 0.10 163);         /* 7.00 con fg */
  --primary-text: oklch(0.47 0.10 163);           /* links/valores de marca: 6.48 card */
  --primary-soft: oklch(0.965 0.025 163);         /* fila seleccionada, nav activa; fg 16.3 */
  --ring: oklch(0.56 0.12 163);                   /* foco: 4.38 card · 4.08 canvas · 3.99 fila sel. */

  /* Neutro de acción (shadcn) */
  --secondary: oklch(1 0 0);                      /* botón secundario = panel + borde input */
  --secondary-foreground: oklch(0.205 0.012 245);
  --accent: oklch(0.955 0.004 240);               /* hover neutro */
  --accent-foreground: oklch(0.205 0.012 245);

  /* Estados — solid (íconos, puntos, fills), soft (fondo), border, text */
  --success: oklch(0.55 0.14 145);          /* 4.57 card */
  --success-soft: oklch(0.965 0.035 145);
  --success-border: oklch(0.85 0.07 145);
  --success-text: oklch(0.44 0.11 145);     /* 6.76 sobre soft */

  --warning: oklch(0.65 0.135 70);          /* 3.32 card (ícono, no texto) */
  --warning-soft: oklch(0.968 0.04 85);
  --warning-border: oklch(0.86 0.08 80);
  --warning-text: oklch(0.47 0.10 65);      /* 6.36 sobre soft */

  --danger: oklch(0.525 0.19 27);           /* fill botón: blanco 5.78 */
  --danger-soft: oklch(0.965 0.022 25);
  --danger-border: oklch(0.86 0.06 25);
  --danger-text: oklch(0.48 0.17 27);       /* 6.36 sobre soft */

  --info: oklch(0.55 0.15 250);             /* 4.85 card */
  --info-soft: oklch(0.965 0.022 250);
  --info-border: oklch(0.86 0.05 250);
  --info-text: oklch(0.47 0.13 250);        /* 6.17 sobre soft */

  --neutral: oklch(0.55 0.014 245);         /* 4.84 card */
  --neutral-soft: oklch(0.955 0.004 245);
  --neutral-border: oklch(0.88 0.006 245);
  --neutral-text: oklch(0.45 0.015 245);    /* 6.51 sobre soft */

  /* Compatibilidad shadcn */
  --destructive: var(--danger);
  --destructive-foreground: oklch(0.99 0 0);

  /* Gráficos (validados, ver 2.5) */
  --chart-1: oklch(0.562 0.117 163.8);  /* #0e8a62 verde marca */
  --chart-2: oklch(0.575 0.163 255.5);  /* #2a78d6 azul */
  --chart-3: oklch(0.671 0.175 40.6);   /* #eb6834 naranja */
  --chart-4: oklch(0.433 0.167 283.6);  /* #4a3aa7 violeta */
  --chart-5: oklch(0.716 0.141 357.4);  /* #e87ba4 magenta */
  --chart-6: oklch(0.764 0.161 75.1);   /* #eda100 ámbar */
  --chart-other: oklch(0.70 0.01 245);  /* "Otros" */
  --chart-grid: oklch(0.92 0.004 245);
  --chart-axis: oklch(0.82 0.008 245);

  /* Sidebar: mismo plano que el canvas, separado por hairline */
  --sidebar: oklch(0.975 0.003 240);
  --sidebar-foreground: oklch(0.205 0.012 245);
  --sidebar-primary: oklch(0.505 0.11 163);           /* barra de acento */
  --sidebar-primary-foreground: oklch(0.99 0.01 165);
  --sidebar-accent: oklch(0.945 0.03 163);            /* ítem activo; fg 15.4 */
  --sidebar-accent-foreground: oklch(0.205 0.012 245);
  --sidebar-border: oklch(0.905 0.006 245);
  --sidebar-ring: oklch(0.56 0.12 163);
}
```

### 2.3 `.dark`

El modo oscuro no es el claro invertido: el **fill de marca pasa a claro con texto oscuro**. El problema de hoy era el fill oklch 0.432 sobre la card, que medía **2.29:1** (el botón primario casi no se distinguía del panel). Con el valor nuevo mide 8.13:1.

```css
.dark {
  --canvas: oklch(0.165 0.006 245);
  --background: oklch(0.165 0.006 245);
  --card: oklch(0.195 0.007 245);          /* +3% L */
  --panel-2: oklch(0.215 0.008 245);
  --popover: oklch(0.225 0.008 245);       /* un nivel arriba del panel */
  --muted: oklch(0.25 0.008 245);

  --foreground: oklch(0.955 0.004 240);           /* 16.0 card */
  --card-foreground: oklch(0.955 0.004 240);
  --popover-foreground: oklch(0.955 0.004 240);
  --muted-foreground: oklch(0.715 0.014 245);     /* 7.25 card · 6.34 muted · 6.78 popover */
  --fg-subtle: oklch(0.60 0.012 245);             /* 4.64 */

  --border: oklch(0.30 0.008 245);
  --border-strong: oklch(0.36 0.01 245);
  --input: oklch(0.52 0.012 245);                 /* 3.32 card */

  --primary: oklch(0.73 0.14 163);                /* 8.13 vs card */
  --primary-foreground: oklch(0.17 0.03 165);     /* 8.45 */
  --primary-hover: oklch(0.79 0.13 163);          /* 10.38 */
  --primary-text: oklch(0.76 0.14 163);           /* 9.04 card */
  --primary-soft: oklch(0.26 0.035 163);          /* fila sel.; fg 13.46 */
  --ring: oklch(0.72 0.14 163);                   /* 7.84 card · 6.58 fila sel. */

  --secondary: oklch(0.195 0.007 245);
  --secondary-foreground: oklch(0.955 0.004 240);
  --accent: oklch(0.25 0.008 245);
  --accent-foreground: oklch(0.955 0.004 240);

  --success: oklch(0.70 0.15 145);  --success-soft: oklch(0.26 0.045 145);
  --success-border: oklch(0.40 0.07 145);  --success-text: oklch(0.82 0.13 145);  /* 9.18 */
  --warning: oklch(0.78 0.15 75);   --warning-soft: oklch(0.27 0.045 70);
  --warning-border: oklch(0.42 0.07 70);   --warning-text: oklch(0.85 0.13 80);   /* 9.49 */
  --danger: oklch(0.58 0.19 25);    --danger-soft: oklch(0.27 0.06 25);           /* fill: blanco 4.58; vs card 3.88 */
  --danger-border: oklch(0.42 0.09 25);    --danger-text: oklch(0.80 0.11 25);    /* 7.89 */
  --info: oklch(0.70 0.13 250);     --info-soft: oklch(0.27 0.055 255);
  --info-border: oklch(0.42 0.08 255);     --info-text: oklch(0.81 0.09 250);     /* 8.40 */
  --neutral: oklch(0.60 0.012 245); --neutral-soft: oklch(0.27 0.008 245);
  --neutral-border: oklch(0.38 0.01 245);  --neutral-text: oklch(0.80 0.012 245); /* 8.07 */

  --destructive: var(--danger);
  --destructive-foreground: oklch(0.99 0 0);

  --chart-1: oklch(0.621 0.128 163.1);  /* #199e70 */
  --chart-2: oklch(0.622 0.161 255.1);  /* #3987e5 */
  --chart-3: oklch(0.622 0.173 40.1);   /* #d95926 */
  --chart-4: oklch(0.670 0.145 286.8);  /* #9085e9 */
  --chart-5: oklch(0.622 0.171 0.8);    /* #d55181 */
  --chart-6: oklch(0.670 0.143 73.2);   /* #c98500 */
  --chart-other: oklch(0.50 0.01 245);
  --chart-grid: oklch(0.27 0.008 245);
  --chart-axis: oklch(0.38 0.01 245);

  --sidebar: oklch(0.165 0.006 245);
  --sidebar-foreground: oklch(0.955 0.004 240);
  --sidebar-primary: oklch(0.73 0.14 163);
  --sidebar-primary-foreground: oklch(0.17 0.03 165);
  --sidebar-accent: oklch(0.26 0.035 163);
  --sidebar-accent-foreground: oklch(0.955 0.004 240);
  --sidebar-border: oklch(0.30 0.008 245);
  --sidebar-ring: oklch(0.72 0.14 163);
}
```

### 2.4 `@theme inline` (agregados) y base

```css
@theme inline {
  --color-canvas: var(--canvas);
  --color-panel-2: var(--panel-2);
  --color-border-strong: var(--border-strong);
  --color-fg-subtle: var(--fg-subtle);
  --color-primary-hover: var(--primary-hover);
  --color-primary-soft: var(--primary-soft);
  --color-primary-text: var(--primary-text);
  /* por cada s en success|warning|danger|info|neutral: */
  --color-success: var(--success);  --color-success-soft: var(--success-soft);
  --color-success-border: var(--success-border);  --color-success-text: var(--success-text);
  /* … idem warning/danger/info/neutral … */
  --color-chart-6: var(--chart-6);  --color-chart-other: var(--chart-other);
  --color-chart-grid: var(--chart-grid);  --color-chart-axis: var(--chart-axis);

  --font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;

  /* Sombras: solo capas flotantes */
  --shadow-overlay: 0 0 0 1px oklch(0 0 0 / 0.04), 0 8px 24px -8px oklch(0 0 0 / 0.18);
  --shadow-none: none;

  /* Motion */
  --ease-out-quick: cubic-bezier(0.23, 1, 0.32, 1);
  --duration-fast: 120ms;   /* hover, press, tab */
  --duration-base: 180ms;   /* dropdown, popover, tooltip */
  --duration-panel: 240ms;  /* dialog, sheet, drawer */
}

@layer base {
  * { @apply border-border outline-ring; }
  html { scroll-padding-top: 4rem; }                 /* = alto del header sticky */
  body { @apply bg-canvas text-foreground antialiased font-sans; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  }
}
```

Hay que **quitar** de `globals.css`: `body { bg-muted/90 }` (el canvas lo reemplaza), el `summary::after` que carga un SVG de sitepoint.com y el `@keyframes sweep`. Los dos últimos son legado de landing.

Dark: `--shadow-overlay` pasa a `0 0 0 1px oklch(1 0 0 / 0.08)` (en oscuro la sombra no se lee, alcanza con el ring).

### 2.5 Paleta de gráficos: medición

Resultado del validador (`dataviz/scripts/validate_palette.js`), pares adyacentes. La superficie es la card: `#ffffff` en claro y `#121518` en oscuro.

| Modo | Banda L | Croma ≥0.10 | CVD peor par (deutan) | Visión normal peor par | Contraste vs superficie |
|---|---|---|---|---|---|
| Claro | PASS | PASS | ámbar↔magenta **ΔE 16.3** (≥8) | **19.6** (≥15) | WARN: magenta 2.69 y ámbar 2.17 |
| Oscuro | PASS | PASS | ámbar↔magenta **ΔE 13.2** | **19.3** | PASS (las 6 ≥3:1) |

Reglas:
- **Orden fijo** 1→6, sin ciclar. Una serie 7+ va a "Otros" (`--chart-other`) o a small multiples. El color sigue a la entidad: si un filtro saca series, las que quedan no cambian de color.
- **Relief obligatorio en claro**: como magenta y ámbar están por debajo de 3:1, los gráficos llevan etiquetas directas o vista de tabla, además de la leyenda.
- **Scatter o mapas (todos los pares)**: máximo 3 series.
- Sequential: una sola rampa (`--chart-1` de claro a oscuro). Diverging: verde ↔ naranja con punto medio `--neutral-soft`.
- Los estados **no son series**: `--success/--danger` nunca se usan como "serie 4", y la serie verde nunca representa "OK".
- Grilla en `--chart-grid` (hairline). Eje en `--chart-axis`. Los textos del gráfico usan tokens de texto, nunca el color de la serie.
- Hoy `--chart-1..5` son 5 pasos del mismo verde: se reemplazan enteros.

### 2.6 Escalas

| Escala | Valores |
|---|---|
| Espaciado (base 4) | micro 4 (`gap-1`) · control 8 (`gap-2`) · panel 16 (`p-4`) · grupo 24 (`gap-6`) · sección 32 (`gap-8`). Entre grupos ≥ 2× el gap interno. |
| Alto de control | `pointer:fine`: xs 24 · sm 28 · **md 32 (default)** · lg 40. `pointer:coarse`: mínimo 44 (`pointer-coarse:h-11`). |
| Fila de tabla | compacta 32 · **default 36** · cómoda 44 (mobile/touch). |
| Radios | todo 0. `rounded-full` solo en avatar, punto de estado y switch. |
| Bordes | 1px en todo. 2px solo para la barra de acento y el outline de foco. |
| z-index | `z-10` header de tabla sticky · `z-20` header de app · `z-30` barra de selección / acciones fijas · `z-40` overlay + dialog/sheet · `z-50` popover/dropdown/tooltip (portal) · `z-60` toast. Nada de `z-[n]` arbitrario. |
| Breakpoints | viewport solo para el shell: `md` 768 (aparece el sidebar), `lg` 1024, `xl` 1280. Componentes: `@container` (`@xl` 576, `@3xl` 768, `@5xl` 1024). Sale `--breakpoint-cardMedia: 1227px`. |

---

## 3. Tipografía

**Familias** (`src/app/layout.tsx`, reemplaza a Poppins):
```ts
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400','500','600'], variable: '--font-plex-sans', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-plex-mono', display: 'swap' });
// <html className={`${plexSans.variable} ${plexMono.variable}`}>
```
Solo esos 5 pesos. No se usa 300 ni 700, para que el navegador no sintetice pesos.

**Escala** (ratio ~1.2, base 14px; en `@theme` como `--text-{rol}` con su `--line-height` y `--font-weight`):

| Rol | Clase | Tamaño / LH / peso | Notas |
|---|---|---|---|
| Hero (login, 404) | `text-display` | 32 / 1.15 / 600 | tracking −0.02em, `text-balance` |
| Título de página | `text-page-title` | 20 / 1.3 / 600 | tracking −0.01em, `text-balance` |
| Título de sección / panel | `text-section` | 15 / 1.35 / 600 | |
| Overline / label de sección | `text-overline` | 11 / 1.3 / 500 | MAYÚSCULAS, tracking +0.06em, `text-muted-foreground` |
| Cuerpo | `text-body` | 14 / 1.5 / 400 | `text-pretty` en descripciones |
| Tabla | `text-cell` | 13 / 1.4 / 400 | celdas; énfasis 500 |
| Header de tabla | `text-overline` | 11 / 1.3 / 500 | mayúsculas, muted |
| Label de form | `text-label` | 13 / 1.3 / 500 | |
| Caption / help / meta | `text-caption` | 12 / 1.4 / 400 | muted |
| Valor KPI | `text-kpi` | 28 / 1.1 / 600 | `tabular-nums`, tracking −0.02em |
| Input | — | 16 mobile / 14 desktop | `text-base md:text-sm` (evita el zoom de iOS) |

**Números y mono:**
- `tabular-nums` (con `font-variant-numeric`, no con `font-feature-settings`) en: celdas numéricas y de fecha, paginación, contadores ("12 seleccionados", "50 de 387 equipos"), KPI, ejes de gráfico y totales de factura.
- Utilidad `.data-code` = `font-mono text-[0.92em] tabular-nums slashed-zero` para legajo, CUIT/CUIL, patente/dominio, nº de comprobante, códigos internos e IDs. Los importes en tabla y en factura van en mono y alineados a la derecha. En el KPI van en Sans tabular.
- Prosa: cifras proporcionales. Usar `…`, raya (—) y "–" en rangos de fechas.
- Modo oscuro: en Plex no hace falta subir el peso. Solo el texto de 11px pasa de 500 a 600 en `.dark` si se ve flojo (verificar visualmente).

---

## 4. Componentes base

### 4.1 Button: de 11 variantes a 6

| Variante nueva | Estilo | Uso |
|---|---|---|
| `primary` | `bg-primary text-primary-foreground hover:bg-primary-hover` | **Una** por vista: la acción principal. |
| `secondary` | `bg-card border border-input text-foreground hover:bg-accent` | Acciones pares, toolbar, "Exportar", "Cancelar". |
| `ghost` | `hover:bg-accent text-foreground` | Íconos de fila, ⋯, acciones terciarias. |
| `danger` | `bg-danger text-destructive-foreground hover:bg-danger/90` | Confirmación destructiva, solo dentro de un AlertDialog. |
| `danger-ghost` | `text-danger-text hover:bg-danger-soft` | "Eliminar" en menú o fila, antes de confirmar. |
| `link` | `text-primary-text underline-offset-4 hover:underline` | Navegación inline. |

Base: `rounded-none font-medium text-[13px] gap-1.5 transition-[background-color,color] duration-(--duration-fast)` y **sin `shadow`**. Foco: el outline global de 2px (sale `ring-[3px]`). Disabled: `disabled:opacity-50` (nativo, sin tooltip). Sin `active:scale`, porque en una herramienta de uso continuo se percibe como lentitud.
Tamaños: `xs` h-6 · `sm` h-7 · `md` h-8 (default) · `lg` h-10 · `icon` size-8 · `icon-sm` size-7. Todos con `pointer-coarse:min-h-11` (y `min-w-11` en los de ícono).

**Mapeo viejo → nuevo** (alias temporales en la cva para migrar sin romper):

| Viejo | Nuevo |
|---|---|
| `default`, `brand`, `primary` (azul), `success` (esmeralda) | `primary` |
| `secondary` (violeta), `outline`, `surface`, `surfaceMuted` | `secondary` |
| `ghost` | `ghost` |
| `destructive` (`bg-red-400`) | `danger` (en AlertDialog) o `danger-ghost` (en fila/menú) |
| `link` | `link` |

### 4.2 Badge / StatusBadge

`Badge` neutro (`variant`: `outline` | `solid-neutral`) para etiquetas: tipo, categoría, cliente.
`StatusBadge` con `tone` = `success | warning | danger | info | neutral | brand`:
```
inline-flex items-center gap-1.5 h-5 px-1.5 border text-[12px] font-medium whitespace-nowrap
bg-{tone}-soft border-{tone}-border text-{tone}-text
+ ícono Lucide size-3 (strokeWidth 2) o punto `size-1.5 rounded-full bg-{tone}`
```
Siempre lleva ícono o punto + texto, nunca solo color. `brand` usa `bg-primary-soft border-primary/30 text-primary-text`.

**Mapeo estado → tono** (un único `statusToneMap` en `src/shared/utils/mappers.ts`; prohibido redefinirlo por pantalla):

| Dominio | success | warning | danger | info | neutral |
|---|---|---|---|---|---|
| Recurso (empleado/equipo) | Completo · Activo | Completo con doc vencida | Incompleto | — | Inactivo / De baja |
| Documento | Aprobado / Vigente | Por vencer | Vencido · Rechazado | Pendiente de revisión | Pendiente sin archivo · "Ya no aplica" (archivado) |
| Solicitud / OT mantenimiento | Aprobada · Finalizada | Pendiente | Rechazada · Urgente | En curso · Planificada | Borrador · Cancelada |
| Factura (ARCA) | Autorizada (CAE) | Pendiente de CAE | Rechazada / Error ARCA | Emitida en borrador | Anulada |
| Parte diario | Cerrado | Con desvíos | — | Abierto | Sin parte |

Badge viejo → nuevo: `success`→`success`, `yellow`/`warning`→`warning`, `red`/`destructive`→`danger`, `info`→`info`, `default`→`brand`, `secondary`/`outline`→`neutral`.

### 4.3 Card → Panel

```
Panel: bg-card border border-border (sin shadow, sin rounded)
PanelHeader: flex items-center justify-between gap-3 px-4 h-11 border-b border-border
  título text-section · acciones a la derecha (botones sm)
PanelBody: p-4 · PanelFooter: px-4 py-3 border-t bg-panel-2
```
Paneles sin header (DataTable): `p-0`. La toolbar de la tabla hace de header. Reemplaza `<Card><CardContent className="pt-6">` de la regla del DataTable: la regla hay que actualizarla a `<Panel>`. Nunca un panel dentro de otro: adentro se usa `Section`.

### 4.4 PageHeader

```
<header class="border-b border-border-strong bg-card">
  <div class="mx-auto max-w-(--page-max) px-4 md:px-6 py-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="min-w-0">
      [overline: módulo]            text-overline text-muted-foreground
      <h1>Título</h1>               text-page-title
      [meta: data-code + StatusBadge + "Actualizado 12/10 14:32"]  text-caption, gap-3
      [descripción opcional]        text-body text-muted-foreground max-w-prose
    </div>
    <div class="flex flex-wrap gap-2">   secondary… · primary (último a la derecha) · ⋯ "Más"</div>
  </div>
  [Tabs de la página, pegadas al borde inferior: subrayado 2px]
</header>
```
- Ocupa todo el ancho por encima del contenido. **No va dentro de una card.** El cuerpo de la página va sobre el canvas.
- Máximo 1 primary + 2 secundarias visibles. El resto va al ⋯.
- Ficha (empleado/equipo): el overline lleva el módulo, el título lleva `[legajo mono] Apellido Nombre`, la meta lleva CUIL, función y estado, y a la izquierda va una foto 48×48 cuadrada con outline `oklch(0 0 0/0.1)`. Reemplaza al hero de la ficha de GH.
- **Mobile (<md)**: título 18px. Las acciones pasan a una fila propia: el primary a ancho completo (`w-full`) y el resto en ⋯. Si la página tiene un form, el primary vive en la barra de acciones fija (4.8) y no en el header. El header **no es sticky** en mobile; las tabs sí (`sticky top-14`).

### 4.5 Section

Divisor de contenido dentro de un panel o de una página:
`<section class="space-y-3">` + encabezado `flex items-baseline justify-between border-b border-border pb-2` con `text-overline` (ej. "DATOS LABORALES") y una acción `link` opcional. El espacio entre secciones es `gap-8`. Reemplaza los `Separator` + `h3` sueltos.

### 4.6 DataTable

**Desktop** (contenedor `@container/table`; el modo tabla se activa con `@3xl/table`):

| Parte | Especificación |
|---|---|
| Contenedor | `Panel p-0`. Una sola caja con hairline y sin shadow. Scroll horizontal **dentro** del panel con sombra de borde (`mask-image` lateral) cuando hay overflow. |
| Toolbar | `h-12 px-3 flex items-center gap-2 border-b`. Izquierda: buscador (`h-8 w-64`, ícono, `Ctrl K` hint mono). Después, chips de filtro activos (`h-7 border border-input`, con `×`), cada uno con `Label: valor` y "+2" si hay varios. Botón "Filtros" (`secondary sm`, contador `tabular-nums`). Derecha: vista (columnas), densidad (segmented 32/36), Exportar. |
| Filtros | Se abren en **popover por filtro** (lazy `fetchFacet`, igual que hoy). Arriba del popover va un buscador y cada opción lleva checkbox cuadrado + label + count mono a la derecha. Ya no se pinta la fila completa de botones dashed que tiene GH. |
| Header | `sticky top-0 z-10 bg-muted` (token, **sale `bg-white dark:bg-slate-900`** de `DataTable.tsx:518`) · `h-8` · `text-overline` · `border-b border-border-strong`. El orden de columna se marca con una flecha de 12px **solo en la columna ordenada**; hover `bg-accent`. |
| Filas | 36px (`h-9`), `text-cell`, `border-b border-border`, sin zebra. Hover `bg-accent/60` sin transición. Seleccionada: `bg-primary-soft` + `shadow-[inset_2px_0_0_var(--primary)]` (la barra de acento). Números y fechas `text-right tabular-nums`; códigos con `.data-code`. Texto `truncate` con tooltip accesible por teclado. |
| Primera columna | Checkbox 16px con hit area de 24px (pseudo-elemento). Identificador (`[legajo]` mono + nombre en 500). |
| Acciones de fila | Columna fija a la derecha (`sticky right-0 bg-card`). Hasta 1 ícono `ghost icon-sm` visible + ⋯. Siempre visibles, sin depender del hover. |
| Selección | Al haber selección, la toolbar se reemplaza en el mismo lugar por una barra de selección: `bg-primary-soft border-b`, "**12** seleccionados" en tabular, "Seleccionar los 387", acciones masivas y "Limpiar". |
| Paginación | Footer `h-11 px-3 border-t bg-panel-2 text-caption tabular-nums`. Izquierda: "1–50 de 387". Derecha: select "50 / pág." + `‹ 1 2 … 8 ›` en botones `ghost icon-sm`. Desaparece el texto "Filas por página". |
| Vacío | Dentro del cuerpo, alto mínimo de 240px: EmptyState compacto (4.11). Se distingue "sin datos" de "sin resultados para los filtros", que lleva el botón "Limpiar filtros". |
| Carga | Skeleton con las mismas columnas y el mismo alto de fila, 10 filas, sin `rounded`. En refetch se mantienen los datos y se muestra una barra de 2px indeterminada en `--primary` bajo el header (sin spinner sobre la tabla). |
| Error | Callout `danger` en el cuerpo con "Reintentar". |

**Mobile** (el contenedor es más angosto que `@3xl/table`). Se renderiza la lista de tarjetas y la tabla queda `hidden` por container query. El render es **CSS**, no `useMediaQuery`, para evitar el flicker de hidratación. Las dos vistas comparten las filas, y el tamaño de página tope de 50 mantiene acotado el DOM duplicado.

| Parte | Especificación |
|---|---|
| Tarjeta | `border-b border-border px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-x-3`. Fila 1: checkbox (si hay selección) · título = `[legajo]` mono + nombre en 500, truncado · ⋯ (44×44). Fila 2: StatusBadge + 1 dato. Fila 3: `dl` de 2–3 pares `label (caption muted) / valor`. Las columnas a mostrar se configuran por tabla con `mobile: { title, status, fields: [...] }` en la definición de columnas. |
| Toque | Toda la tarjeta abre un **bottom sheet de detalle** (Drawer/vaul): handle, título, todos los campos visibles como `dl` en 1 columna (label arriba, valor abajo) y acciones al pie en una barra fija (`pb-[max(1rem,env(safe-area-inset-bottom))]`). |
| Toolbar | Fila 1: buscador a ancho completo (`h-11`). Fila 2: "Filtros (n)" + "Ordenar" + ⋯ (columnas/exportar). |
| Filtros | Bottom sheet "Filtros" con altura máxima `85dvh`. Cada filtro es un acordeón con sus opciones y counts. Footer fijo: "Limpiar" (secondary) + "Ver 120 resultados" (primary, con count). |
| Selección | Long-press o el botón "Seleccionar" muestra los checkboxes. Aparece una barra inferior `fixed bottom-0 z-30 bg-card border-t` con "12 seleccionados" y acciones (máx. 2 + ⋯), con safe-area. El toast se desplaza arriba de la barra (`offset` de sonner). |
| Paginación | "‹ 1–50 de 387 ›" centrado, botones de 44px. |

### 4.7 Dialog / Sheet / ResponsiveDialog

| Caso | Desktop | Mobile |
|---|---|---|
| Confirmación (eliminar, aprobar) | `AlertDialog` sm (400px) | El mismo, centrado, con botones apilados a ancho completo |
| Form corto (≤6 campos) | `Dialog` md (560px) | Bottom sheet (Drawer) `max-h-[92dvh]` |
| Form largo / alta de entidad | Página propia o `Sheet` lateral derecho de 640px | Pantalla completa (`h-dvh`) con header fijo (← Volver · título) |
| Detalle de registro | `Sheet` derecho de 480px | Bottom sheet |
| Visor (PDF, foto) | `Dialog` xl (min(1100px, 92vw)) | Pantalla completa |

`ResponsiveDialog` (ya existe) es la única puerta de entrada: decide entre Dialog y Drawer.
- Estilo: `bg-popover border border-border-strong shadow-(--shadow-overlay)`, sin rounded.
- Header: `px-5 h-12 border-b`, título `text-section`, botón cerrar `ghost icon-sm` con `aria-label`. Body: `p-5 overflow-y-auto overscroll-contain`. Footer: `px-5 py-3 border-t bg-panel-2 flex justify-end gap-2`.
- Overlay: `bg-black/40`, sin blur.
- Motion: opacidad + translateY 8px en 240ms ease-out. Salida en 150ms. El sheet entra por translateX/Y.
- Regla del repo: **nunca modales encadenados**.

### 4.8 Form

- Grilla por container query: `@container` en el panel y `grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-x-4 gap-y-4`. Los campos largos (dirección, observaciones) llevan `@xl:col-span-full`.
- Campo: label `text-label` arriba, control `h-8` (`h-11` con coarse), help `text-caption`. El error va abajo en `text-danger-text text-caption` con ícono, y el control lleva `border-danger` + `aria-invalid`. Los obligatorios se marcan con `*` en `text-danger-text`, que lleva `aria-hidden` (el `required` va en el input).
- Secciones con `Section` (overline + hairline). No se usan cards anidadas.
- Barra de acciones: en página, `sticky bottom-0 z-30 bg-card/95 border-t px-4 md:px-6 py-3 flex justify-end gap-2` con safe-area. Lleva "Cancelar" (secondary) y "Guardar" (primary, con estado "Guardando…"). En mobile los botones van a ancho completo y el primary queda último. A la izquierda puede ir "Cambios sin guardar" en caption.
- Input: `bg-card border border-input h-8 px-2.5 text-base md:text-sm`, sin rounded y sin shadow. En dark `bg-background` (el input queda más oscuro que el panel). Hover: `border-fg-subtle`. Foco: outline de 2px.
- El submit no se deshabilita por invalidez: se valida al enviar y el foco va al primer error.

### 4.9 Tabs y segmented

- **Tabs de página/sección**: subrayadas. `border-b border-border` en la lista. Cada trigger es `h-10 px-3 text-[13px] font-medium text-muted-foreground`; activo `text-foreground shadow-[inset_0_-2px_0_var(--primary)]`. Con count opcional en mono, `text-caption`. En mobile hacen scroll horizontal con fade lateral y no se rompen en dos líneas.
- **Segmented** (filtros de vista y densidad, rango de fechas rápido): `inline-flex border border-input h-8`. Ítems separados por `border-l`; activo `bg-foreground text-background`. Reemplaza el "pill gris con card blanca" de shadcn/GH.

### 4.10 KPI / StatCard

```
<dl class="grid grid-cols-2 @3xl:grid-cols-4 border border-border bg-card divide-x divide-y @3xl:divide-y-0 divide-border">
  <div class="p-4 space-y-1">
    <dt class="text-overline text-muted-foreground">EMPLEADOS ACTIVOS</dt>
    <dd class="text-kpi tabular-nums">583</dd>
    <dd class="text-caption text-muted-foreground"><span class="text-success-text">▲ 12</span> vs. mes anterior</dd>
    [opcional: sparkline 24px de alto en --chart-1, 1.5px, sin ejes]
  </div>
```
- Es una **tira de métricas** dentro de un único panel dividido por hairlines, no 4 cards sueltas con ícono de color (el patrón GH).
- Los íconos no son decorativos: sin ícono, o uno de 14px en muted junto al label.
- Si el KPI es clickeable (filtra la tabla), lleva hover `bg-accent` y, activo, la barra de acento superior `shadow-[inset_0_2px_0_var(--primary)]`.
- Valor no medible: "—" en muted, nunca 0 (regla aprendida en el 578).

### 4.11 EmptyState

Compacto y alineado a la izquierda, sin ilustración: ícono Lucide 20px en un cuadrado `size-9 border border-border bg-panel-2` · título `text-section` · una línea `text-body text-muted-foreground` que dice **por qué** está vacío (verificar la condición real, regla del 578) · como máximo una acción. Si filtró a cero: "Sin resultados para los filtros aplicados" + "Limpiar filtros".

### 4.12 Skeleton

`bg-muted animate-pulse rounded-none`. Reproduce la geometría exacta: tabla (header de 32px + filas de 36px), PageHeader (líneas de 11/20/12px) y KPI strip. Con reduced-motion, sin pulso.

### 4.13 Toast (sonner)

- Posición `bottom-right` en desktop y `top-center` en mobile, para no tapar la barra de selección ni las acciones fijas (regla aprendida). Ancho 360px.
- Estilo: `bg-popover border border-border-strong shadow-(--shadow-overlay)`, con la barra de acento izquierda de 2px en el color del tono (`--success/--danger/--warning/--info`) e ícono del tono.
- Éxito: se autocierra en 4s y el texto lleva el número real ("Se asignaron 12 empleados").
- Error o toast con acción: `duration: Infinity` + botón de cerrar.
- `role="status"`. Solo los errores bloqueantes llevan `alert`.

### 4.14 Tooltip

`bg-foreground text-background text-caption px-2 py-1`, sin flecha y sin rounded. Delay de 400ms la primera vez y 0 entre tooltips seguidos. Animación 120ms de opacidad. Sobre controles `disabled` nativos no se pone tooltip: el motivo va al lado.

### 4.15 DatePicker y Select con búsqueda (look único)

Los dos comparten el **trigger de campo**: `h-8 border border-input bg-card px-2.5 text-sm` con chevron o ícono a la derecha, sin rounded.
- **DatePicker** (regla del repo: escritura directa): `Input` con máscara `DD/MM/AAAA` (mono, tabular) + botón de ícono a la derecha dentro del borde que abre el popover con `Calendar`. Calendario: celdas cuadradas de 32px; día seleccionado `bg-primary text-primary-foreground`; hoy con subrayado de 2px. Rango (sin cambios funcionales): mismo look, con el tramo en `bg-primary-soft`. Hay que unificar `FormItemDatePicker`, `enhanced-datepicket` y `year-month-picker` bajo este trigger.
- **Select con búsqueda** (Combobox `cmdk`): popover del ancho del trigger. Buscador `h-9 border-b` arriba. Ítems `h-8` con check a la izquierda. Los empleados se muestran como `[legajo] Apellido Nombre` con el legajo en mono. El aviso "Mostrando 50 de 387 equipos" va arriba, junto al buscador (regla aprendida). Multi-select: chips cuadrados `h-6 border` en el trigger, "+N" si no entran.
- El Select nativo shadcn simple usa el mismo trigger.

### 4.16 Alert / Callout

`border border-{tone}-border bg-{tone}-soft text-{tone}-text px-3 py-2.5 flex gap-2.5`, con ícono de 16px. Título `font-medium`, cuerpo `text-caption` en `text-foreground/80`. Variante `inline` (sin fondo, solo ícono + texto) para avisos dentro de un form. La barra de acento de 2px a la izquierda va solo en la variante de página (banner).

---

## 5. Layout

| Elemento | Especificación |
|---|---|
| Shell | **Se conserva**: sidebar shadcn `sidebar-07` (selector de empresa + barra de acento en `NavMain`) y el header con breadcrumb. **Se ajusta**: el sidebar pasa a `bg-sidebar` = canvas con `border-r` (hoy es un plano distinto). Ítem activo: `bg-sidebar-accent` + barra de 2px. Labels de grupo en `text-overline`. Ancho 248px (16rem); colapsado de íconos 48px. |
| Header de app | `h-14 sticky top-0 z-20 bg-card/95 border-b`, con breadcrumb en `text-caption` (último nivel en 500). A la derecha: búsqueda global (`Ctrl K`), notificaciones, tema y usuario. Mobile: ☰ + título de la página actual + avatar. |
| Contenedor | `--page-max: 1440px`. Contenido `mx-auto w-full max-w-(--page-max) px-4 md:px-6 py-4 md:py-6`. Tablas muy anchas pueden usar `max-w-none` (`data-page="wide"`). |
| Ritmo | PageHeader → `gap-6` → KPI strip → `gap-6` → Panel de tabla. Dentro de los paneles, `gap-4`. |
| Grillas | Dashboard: `grid gap-6 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` (principal + lateral). Fichas: columna principal + aside de 320px en `xl`. Siempre `minmax(0,…)` / `min-w-0`. |
| Breakpoints | Viewport `md`/`lg`/`xl` solo para el shell y las barras fijas. Todo lo interno usa `@container`. Se prueba a 320px y con 200% de zoom. |
| Viewport | `viewport: { viewportFit: 'cover', themeColor: [{media light, canvas}, {media dark, canvas}] }`. Alturas con `dvh`, nunca `h-screen`. |

---

## 6. Pantallas de borde

**Login / recuperar contraseña.** Se descarta la card centrada (también es patrón GH). Layout partido en desktop:
- Izquierda, 40% (`bg-foreground text-background` en claro / `bg-card` en oscuro): wordmark, una línea de propósito ("Gestión operativa de personal, equipos y documentación") y abajo un bloque de datos en mono (versión, empresa y estado del sistema con punto success) que funciona como firma técnica.
- Derecha: form de 360px alineado arriba-izquierda con un padding de 96px. Título `text-display` 28px y campos h-10. Primary a ancho completo.
- Mobile: solo el form, con el wordmark arriba.
- Recuperar: misma estructura. El estado "Te enviamos un correo" va en un Callout info dentro del mismo lugar, sin navegar.

**404 / error.** Sobre el canvas, a la izquierda, `max-w-xl`, con un padding superior de 20vh:
- Overline mono con el código ("ERROR 404" / "ERROR 500 · ref a3f9…" con un digest copiable).
- Título `text-display` y una línea de explicación.
- Acciones: "Volver al inicio" (primary) y "Reintentar" (secondary, en error.tsx).
- Sin ilustración. `global-error` repite lo mismo con estilos inline mínimos.

**Paneles de campo** (`/operator`, `/maintenance` QR, `/clothing`): uso con guantes, al sol y con una mano.
- Sin sidebar. Header `h-14` con logo, empresa y usuario. Contenido `max-w-md mx-auto px-4`.
- Controles de 48px (`h-12`), texto base de 16px y label de 14px en 500.
- El primary vive en una barra inferior fija a ancho completo con safe-area.
- Opciones de checklist como segmented grande (`B / R / M` con ícono + texto, 48px). Seleccionado: fill del tono (success/warning/danger) con texto `*-text` sobre `*-soft` y borde de 2px del tono.
- Alto contraste por defecto: los textos secundarios usan `--foreground/80`, no `muted`.
- Pasos: indicador "Paso 2 de 4" en mono + una barra de 2px.
- La identificación del equipo (patente/interno en mono, 20px) queda fija arriba.

**PDFs (`@react-pdf/renderer`).**
- Fuentes: Plex Sans y Plex Mono registradas con `Font.register` (TTF 400/500/600 locales, no remotas).
- Paleta fija en hex (react-pdf no entiende oklch): texto `#13181c`, secundario `#5c646c`, líneas `#dce0e3`, acento `#007851`; estados texto `#236228` / `#804d0c` / `#a92321` / `#065da0`.
- Encabezado: franja de 2px en el acento arriba de todo. Logo de la empresa a la izquierda; a la derecha el título del documento (14pt 600) y el código o nº en mono. Debajo, una hairline de 0.5pt.
- Tablas con hairlines de 0.5pt, sin fondos alternados y header en 7.5pt mayúsculas.
- Importes en mono alineados a la derecha.
- Pie: página "1 / 3" en mono, fecha de emisión y nombre del sistema.
- Imágenes: JPEG aplanado con ancho y alto en puntos (regla aprendida del 554).

**Mails.**
- Tabla de 600px y fuentes de sistema con fallback (`'IBM Plex Sans', Segoe UI, Arial, sans-serif`); la webfont no se garantiza.
- Fondo `#f5f7f9`, cuerpo `#ffffff` con borde de 1px `#dce0e3`, sin rounded.
- Barra de 4px en `#007851` arriba. Logo y empresa en el header.
- Botón: celda `#007851` con texto `#f6fefa`, 44px de alto, rectangular.
- Datos clave en una tabla label/valor, con códigos en monospace (`Consolas, Menlo, monospace`).
- Estados con texto + color (el mismo hex que el PDF), nunca solo color.
- Footer en 12px `#5c646c`. Sin dark mode forzado: se agrega `color-scheme: light`.

---

## 7. Mapa GH → alphataco (checklist por vista)

| Componente en GH | Reemplazo en alphataco | Cómo verificar |
|---|---|---|
| Poppins | IBM Plex Sans + Mono | `grep Poppins src` = 0 |
| Header de DataTable `bg-white dark:bg-slate-900` h-10 | `bg-muted` h-8, overline en mayúsculas, `border-border-strong` | `DataTable.tsx:518` sin `bg-white` |
| Toolbar con fila de botones dashed por filtro | Buscador + chips de filtros activos + botón "Filtros (n)" | No queda ningún `border-dashed` en la toolbar |
| "Filas por página" + paginación completa | Footer "1–50 de 387" + "50 / pág." + paginación compacta | grep "Filas por página" = 0 |
| Filas de 40–48px | Filas de 36px, densidad elegible | |
| Tabla con scroll horizontal en mobile | Tarjetas + bottom sheet de detalle + sheet de filtros | Probar a 375px |
| `<Card>` con shadow y `pt-6` | `Panel` con hairline y sin shadow | grep `shadow` en `components/ui` y `features` |
| Dialog/Sheet con rounded + shadow-lg | `border-border-strong` + `--shadow-overlay`, header y footer con hairline | |
| 4 KPI cards con ícono de color | Tira de métricas única con divisores | Dashboard |
| Hero de la ficha de empleado | PageHeader con `[legajo]` mono, meta y foto cuadrada | Ficha empleado/equipo |
| Button `primary` azul, `secondary` violeta, `destructive` rojo | 6 variantes semánticas; una sola primary verde | grep `bg-blue-5\|bg-purple-4\|bg-red-4` = 0 |
| Badges `yellow/red/info/success` de paleta | `StatusBadge tone=` + `statusToneMap` único | grep `bg-(yellow\|red\|green\|blue)-` en badges = 0 |
| Modo oscuro `slate-*` hardcodeado | Tokens con `.dark` | grep `dark:bg-slate\|dark:text-slate` = 0 |
| `--chart-1..5` del mismo verde | 6 series validadas + "Otros" | `globals.css` |
| Tabs shadcn de pill gris | Tabs subrayadas con barra de 2px; segmented para las vistas | |
| Login con card centrada | Layout partido con firma técnica en mono | `/login` |
| Toast shadcn genérico | Toast con barra de tono y conteo real | |
| Íconos Lucide con stroke 2 por todos lados | Lucide con `strokeWidth={1.75}` en UI y 2 en badges; tamaño 16 (14 en tabla) | |

**Prueba final por vista:** si sacás el logo, ¿se reconoce que no es GH? Hay que poder señalar al menos 3 de estos elementos en pantalla: header de tabla en mayúsculas sobre muted, cifras mono/tabulares, barra de acento de 2px, tira de KPIs con divisores, esquinas rectas sin sombra.

---

## Notas de implementación y performance (vercel-react-best-practices)

- `bundle-dynamic-imports`: Recharts y el visor de PDF van con `next/dynamic` en el dashboard. Los KPIs se renderizan en el servidor y los gráficos se hidratan después.
- `rendering-hydration-no-flicker`: el cambio tabla↔tarjetas es por container query en CSS, no con `useMediaQuery` (que daría mismatch o flash). Costo: DOM doble acotado al tamaño de página (≤50).
- `rendering-content-visibility`: `content-visibility: auto` en la lista de tarjetas mobile si se permiten 100 filas.
- `server-serialization`: el `mobile.fields` de columnas no agrega datos; usa campos que ya viajan en la fila.
- Fuentes: `next/font` con 3+2 pesos y `display: swap` (`adjustFontFallback` viene por defecto). Se elimina el `url(sitepoint…)` remoto de `globals.css`.
- Motion solo sobre `transform`/`opacity`/`background-color`, nunca `transition-all` (la base actual del Button usa `transition-all`: cambiarla).

## Hallazgos de contraste del estado actual

- `--muted-foreground` claro (0.56) sobre el body `bg-muted` mide **4.15:1**. No pasa AA para texto chico. El nuevo mide 5.25–5.98.
- El fill `--primary` en oscuro (0.432) contra la card mide **2.29:1**. El texto adentro sí llegaba (7.19), pero el botón no se distinguía del panel. El nuevo mide 8.13.
- `--input` hoy es igual a `--border` (≈1.3:1) y los inputs no llegan a 3:1 (WCAG 1.4.11). El nuevo `--input` es un token propio de 3.1–3.4.
- `--primary` claro original (0.508 0.118) queda apenas fuera de sRGB. El nuevo (0.505 0.11) queda dentro de sRGB.
