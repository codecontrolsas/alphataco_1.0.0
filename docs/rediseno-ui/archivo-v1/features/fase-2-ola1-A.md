# Fase 2 — Ola 1 — Agente A (contenedores)

Plan: `fase-2-primitivos.md` §3.7, §3.9 y §3.10 (API), §1.1 (ubicación), §4 (reglas) y §8.1 (controles).
Rama `feat/rediseno-ui`, sin commits. Las decisiones de §7 se toman con su recomendación (ninguna afecta a estos tres).

Barrido de catálogo con el MCP `ui-skills`: `empty state`, `table` y `container`. Frente al plan, la única nueva es
`mengto/container-lines`, que se leyó y se descartó: son guías decorativas de página y no aplican a un panel. El
resto ya estaba destilado en el plan (`pbakaus/harden`, `jakubkrehel/better-writing`,
`flornkm/prefer-container-queries`, `ibelick/fixing-accessibility`). `vercel-react-best-practices` se cargó con la
tool `Skill`.

## Panel + Section
- [x] Hecho
- Archivo: `src/components/ui/panel.tsx` (sin directiva). Exporta `Panel`, `PanelHeader`, `PanelBody`, `PanelFooter`
  y `Section`.
- API:
  - `Panel`: `ComponentProps<'section'>`, `@container/panel border border-border bg-card`, sin padding.
  - `PanelHeader`: `{ title, titleAs?: 'h2'|'h3' (default h2), overline?, actions?, className? }`.
  - `PanelBody`: `ComponentProps<'div'>` con `p-4`.
  - `PanelFooter`: `ComponentProps<'div'>` con `px-4 py-3 border-t bg-panel-2`.
  - `Section`: `{ title: string, titleAs?: 'h2'|'h3'|'h4' (default h3), action?, children, className? }`.
- Desvíos:
  - `PanelHeader` usa `min-h-11 py-1.5 flex-wrap` en lugar de `h-11` fijo. Con overline más título, o con acciones
    que se parten en un panel angosto, un alto fijo recortaría el contenido. Sin overline y en una sola línea mide
    44px, igual que el plan.
  - `Section` suma `titleAs`, que no está en el plan. `DISENO.md` §4.5 la usa "dentro de un panel **o de una
    página**", y el nivel de heading cambia según dónde vaya: h3 bajo un `PanelHeader` h2, h2 suelta en la página.
  - `PanelFooter` trae `flex flex-wrap items-center justify-end gap-2` porque su uso típico son acciones. Si lleva
    texto, el consumidor lo pisa con `className`.

## EmptyState
- [x] Hecho
- Archivo: `src/shared/components/feedback/EmptyState.tsx` (sin directiva). Exporta `EmptyState` y los tipos.
- API: `{ variant?: 'empty'|'filtered'|'error', title, description, icon?: LucideIcon, action?, size?: 'default'|'compact', className? }`,
  idéntica a §3.7.
- Detalle:
  - Ícono por defecto según la variante: `Inbox`, `SearchX` y `CircleAlert`.
  - `error` lleva `role="alert"` y el ícono en `text-danger`.
  - `default` mide `min-h-60` con `px-4 py-8`; `compact` usa `py-6` sin padding horizontal (dentro de un dialog ya
    hay `p-5`).
- Desvíos: ninguno.

## SimpleTable
- [x] Hecho
- Archivo: `src/shared/components/data-display/SimpleTable.tsx` (sin directiva). Exporta `SimpleTable<T>` y los tipos
  `SimpleColumn`, `SimpleColumnKind`, `SimpleTableMobileLayout` y `SimpleTableProps`.
- API: idéntica a §3.10 (`caption`, `columns`, `rows`, `getRowKey`, `footer?`, `empty?`, `mobileLayout?`).
- Detalle:
  - Reusa las piezas de `components/ui/table.tsx`.
  - Header `h-8 bg-muted text-overline border-border-strong`, `th scope="col"`. Filas `h-9 text-cell`, sin zebra y
    sin hover (no son interactivas).
  - Clases por `kind` y por modo en `Record`s de módulo, escritas completas.
  - `scroll`: primera columna `sticky left-0` (`bg-card`, y `bg-muted` en el header). Con el contenedor angosto
    lleva un hairline derecho (`shadow-[inset_-1px_0_0_var(--border)]`, porque con `border-collapse` el borde no
    acompaña al sticky). El contenedor tiene `overscroll-x-contain`.
  - `stack`: bajo `@xl/simple-table` la tabla, el tbody y el tfoot pasan a `block`, cada fila a columna flex y cada
    celda pinta su label con `before:content-[attr(data-label)]`. El thead queda `sr-only`, así sigue en el árbol
    de accesibilidad.
  - Roles ARIA explícitos (`table`/`rowgroup`/`row`/`columnheader`/`cell`) en los dos modos.
  - Vacío: una fila con `colSpan` que muestra `empty` o, si no se pasa, un `EmptyState compact` genérico ("Sin
    registros").
  - Guardia D7: si hay más de 200 filas y no es producción, emite `logger.warn`.
- Desvíos:
  - **Falta la máscara lateral de `DISENO.md` §4.6.** Mostrarla solo cuando hay overflow necesita una animación por
    scroll (`animation-timeline: scroll(x self)`) con `@keyframes`, y eso solo se puede declarar en `globals.css`,
    que está fuera de alcance. Mientras tanto, la primera columna fija con su hairline marca el corte. Queda anotado
    como pendiente compartido; el DataTable de la Fase 3 la necesita igual.
  - Con `mobileLayout="stack"`, el `footer` (filas que arma el consumidor) no se reacomoda: se ve como una mini
    tabla dentro del bloque. El plan no define cómo se apilan los totales.

## Verificación
- `npm run check-types`: verde (`tsc --noEmit` sin errores, con los cinco agentes trabajando en paralelo).
- CSS compilado con `@tailwindcss/postcss` (script descartable en el scratchpad): se generan `@container/panel`,
  `@container/simple-table`, la query `simple-table (width < 36rem)`, `before:content-[attr(data-label)]`,
  `before:text-caption`, `shadow-[inset_-1px_0_0_var(--border)]`, `overscroll-x-contain` y `min-h-60`.
- Controles §8.1 sobre los 3 archivos, todos en 0:
  - `replace('(text|bg|border)-` y `${`;
  - `<button`/`<Button` (no hay botones);
  - `rounded-*`/`shadow-(sm…xl)`;
  - `useEffect` y `date-fns`;
  - `console.`, `any` y `dark:`.
- `count-hardcoded-colors`: 2707 en 297 archivos, igual que al cerrar la ola 0. Los 3 archivos nuevos suman 0.
- Tamaño: 95, 79 y 175 líneas.

## Performance (`vercel-react-best-practices`)
- Nada que corregir:
  - Los tres son Server Components sin hooks ni fetch.
  - Los mapas de clases y los íconos por defecto están en el módulo (`rerender-memo-with-default-value`).
  - No hay componentes definidos dentro de otros (`rerender-no-inline-components`).
  - Ningún import pasa por un barrel (`bundle-barrel-imports`).
- Fuera de alcance: `src/components/ui/table.tsx` tiene `'use client'` sin necesitarlo (no usa hooks). Por eso
  `SimpleTable` renderizada en el servidor manda las piezas de `Table` como client references. El costo es chico,
  pero quitar la directiva lo haría todo server. Ver pendientes.

## Pendientes en archivos compartidos (no tocados)
- `src/app/globals.css`: falta una utilidad de máscara lateral que aparezca solo con overflow (`scroll-fade-x`, con
  `@keyframes` + `animation-timeline: scroll(x self)` y `mask-image`), para `SimpleTable` en modo `scroll` y para el
  DataTable de la Fase 3.
- `src/components/ui/table.tsx`: quitar `'use client'` (no usa hooks).

<!-- estado: completo -->
