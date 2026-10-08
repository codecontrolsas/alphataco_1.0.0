# Fase 2 — Progreso de implementación

Plan: `fase-2-primitivos.md` (§4.7). Rama `feat/rediseno-ui`, sin commits.
Decisiones de §7: se implementan con la recomendación del plan; la 7.10 queda en (a) (el revestimiento es la ola 0).

## Ola 0

Conteo de partida (`node scripts/ui/count-hardcoded-colors.mjs`): 2711 en 298 archivos.

### Paso 1 — `use-media-query`
- [x] Hecho
- Archivos: `src/shared/hooks/use-media-query.ts` (nuevo): `useMediaQuery(query)` sobre `useSyncExternalStore`, un
  store por query en un `Map` de módulo (un solo listener de `matchMedia` por query), `getServerSnapshot = false`.
  Exporta además `MOBILE_MEDIA_QUERY = '(max-width: 767px)'`.
- check-types: verde.
- Desvíos: ninguno.

### Paso 2 — Formateadores
- [x] Hecho
- Archivos: `src/shared/utils/formatters.ts` (**ya existía**, se extiende): `Intl.NumberFormat` y `Intl.PluralRules`
  a nivel de módulo (la moneda se cachea por código en un `Map`), nuevos `formatPercent` y `formatCount(n, noun)`, y
  el tipo `CountNoun`.
- check-types: verde.
- Desvíos: el plan dice "crear" el archivo, pero ya existía (sin importadores en `src/`; los `formatNumber` que se
  ven en el grep son funciones locales de otros módulos). Se agregó lo nuevo sin cambiar la salida de
  `formatNumber`/`formatCurrency` (siguen devolviendo `-` con `null`): solo dejan de crear un `Intl.NumberFormat`
  por llamada.

### Paso 3 — Contexto de `ResponsiveDialog`
- [x] Hecho
- Archivos: `src/components/ui/responsive-dialog-context.ts` (nuevo, `'use client'`): `ResponsiveDialogSurface`,
  `ResponsiveDialogContext` (default `null`) y `useResponsiveDialogSurface()`.
- check-types: verde.
- Desvíos: ninguno.

### Paso 4 — Revestimiento de los wrappers base (§3.11)
- [x] Hecho
- Archivos (`src/components/ui/`): `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `popover.tsx`,
  `dropdown-menu.tsx`, `select.tsx`, `command.tsx`, `calendar.tsx`, `tooltip.tsx`, `tabs.tsx`, `skeleton.tsx`,
  `alert.tsx`, `checkbox.tsx`, `input.tsx`, `textarea.tsx`. Ningún export ni prop se quitó; ningún consumidor tocado.
- Resumen:
  - Overlays: `bg-popover border-border-strong shadow-overlay`, sin rounded; overlay `bg-black/40` sin blur; dialog y
    alert-dialog con opacidad + 8px en 240ms y salida en 150ms; sheet 240/150 (antes 500/300); menú y select solo
    opacidad (`--duration-base`, salida `--duration-fast`); popover opacidad + slide sin zoom.
  - `dialog`/`sheet`: content `p-5` (antes `p-6`), header y footer con hairline (`border-b` / `border-t bg-panel-2`),
    título `text-section font-semibold`, X como `Button ghost icon-sm` con `sr-only` "Cerrar", botón "Close" del
    footer → "Cerrar". Se conserva el remount por `key={generation}`.
  - `alert-dialog`: `size="default"` a 400px, header a la izquierda también en mobile, botones a ancho completo en
    mobile, `Action` → `primary` y `Cancel` → `secondary` por default.
  - `drawer`: `max-h-[92dvh]`, sin rounded, handle `h-1 w-10 bg-border-strong`, header a la izquierda, footer con
    safe area.
  - Ítems de menú/select/command `min-h-8` sin rounded; destructivo `text-danger-text focus:bg-danger-soft`;
    `CommandList` con `overscroll-contain`; textos sr-only de `CommandDialog` en español.
  - `calendar`: celda 32px y 44px con `pointer-coarse`, hoy subrayado 2px, rango en `primary-soft`, sin rounded ni
    `ring-[3px]` (queda el outline global).
  - `tooltip`: sin flecha ni rounded, `text-caption px-2 py-1`, 120ms de opacidad, `delayDuration` 400 por default.
  - `tabs`: `default` subrayada (`h-10 px-3 text-[13px]`, activo `shadow-[inset_0_-2px_0_var(--primary)]`, lista
    `border-b` con scroll horizontal), nueva `variant="segmented"`, `line` alias de `default`.
  - `skeleton`: `bg-muted`, `motion-reduce:animate-none`. `alert`: variantes `neutral/success/warning/danger/info/inline`
    con tokens; `default` y `destructive` quedan como alias. `checkbox`: cuadrado, hit area 24/44px por `::after`.
  - `input`/`textarea`/`select` (trigger): `bg-card dark:bg-background`, `px-2.5`, hover `border-fg-subtle`,
    `aria-invalid:border-danger`, sin `ring-[3px]` ni `outline-none` (queda el outline global de 2px).
- check-types: verde.
- CSS compilado con `@tailwindcss/postcss` (script descartable en el scratchpad): las 37 clases nuevas que no eran
  triviales se generan (variantes `group-data-[overlay-padding=default]/…`, `pointer-coarse:after:-inset-3.5`,
  `pointer-coarse:[--cell-size:--spacing(11)]`, `max-sm:*:w-full`, `…/tabs-list:not-first:border-l`,
  `focus-visible:outline-offset-[-2px]`, `pb-[max(1rem,env(safe-area-inset-bottom))]`, etc.).
- Controles §8.1 sobre los archivos tocados: `rounded-(xs|sm|md|lg|xl|[…])` / `shadow-(xs…xl)` / `ring-[3px]` = 0;
  textos "Close/Cancel/Command Palette/Search for" = 0; `replace('(text|bg|border)-` y `className={\`` = 0;
  `console.` / `any` = 0; `useEffect` solo los preexistentes (remount de dialog/alert-dialog/sheet y foco del día en
  `calendar`).
- Conteo de colores: **2707** en 297 archivos (antes 2711): salen los 4 `blue-*` de `alert.tsx`.
- Desvíos:
  - **Margen negativo condicional.** El plan pone `-mx-5 -mt-5` / `-mx-5 -mb-5` fijos en header y footer, pero 12
    dialogs (visores PDF, `LinkEmployeeCell`, `PedidoDetailDialog`, `HistoryDialog`…) y el `TicketDetailSheet`
    pasan `p-0` y arman su propio header: con margen fijo el header se saldría 20px de la caja. El content detecta
    si el consumidor pasa una clase de padding (regex hoisteada sobre `className`) y publica
    `data-overlay-padding="default|custom"`; el margen negativo solo se aplica con `default`. El padding, la hairline
    y el fondo del header/footer van siempre (el `px-6`/`p-6` del consumidor los pisa por tailwind-merge).
  - `empty:hidden` en `DialogFooter` y `SheetFooter`: `DailyReportRowForm/index.tsx:488` renderiza un
    `<SheetFooter />` vacío, que con fondo y hairline se vería como una franja gris.
  - `shadow-overlay` en vez de `shadow-(--shadow-overlay)`: es la utilidad del `@theme` de la Fase 1 (misma
    variable), la que ya usa `sonner.tsx` y la que `cn` reconoce como grupo `shadow`.
  - El trigger del `Select` queda en `text-sm` (el plan pide `text-base md:text-sm`): es un botón, iOS no hace zoom
    ahí, y `md:text-sm` pisaría el `text-xs` de 4 `SelectTrigger` (tailwind-merge no lo ve como conflicto).
  - Ítems con `min-h-8` en vez de `h-8`: un ítem de dos líneas no se recorta.
  - Tooltip: `sideOffset` por default pasa de 0 a 4 (sin flecha quedaba pegado al trigger).
  - Checkbox: el estado `indeterminate` se pinta con el mismo relleno que `checked` (antes mostraba el tilde sin
    fondo, ilegible sobre el borde).
  - Overlay `bg-black/40` en `dialog`, `alert-dialog`, `sheet` y `drawer`: es el valor del plan, pero el contador lo
    cuenta (1 por archivo), así que esos 4 wrappers no quedan en 0 como pide §8.1. Un scrim negro es correcto en los
    dos temas; si se quiere el 0, la salida es un token `--scrim` en `globals.css` (no lo agregué: fuera de los 14).
  - Lo que no cambia y conviene saber: `TabsManagerClient.tsx:94-100` (consumidor) le sigue pasando a la variante
    `default` las clases del pill viejo (`bg-muted/60 border p-[3px]`, activo `bg-background text-brand`), así que
    los `TabsManager` sin `variant="line"` van a verse híbridos (subrayado + fondo) hasta que se migre el consumidor.
    Igual con las `TabsList` que pasan `grid w-full grid-cols-N` o `bg-muted/50 rounded-lg`.

<!-- ola 0: completa -->
