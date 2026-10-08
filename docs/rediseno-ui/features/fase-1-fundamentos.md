# Fase 1 — Fundamentos (tokens, tipografía, shell, toasts, auth y errores) — plan de UI

Estado: plan
Fase del PLAN: 1 · Ficha del inventario: `docs/rediseno-ui/inventario/auth-y-errores.md` (+ recorrido de 5 módulos)
Fecha: 2026-10-07 · Autor: agente `ui-skills` · Rama: `feat/rediseno-ui` (sin commits)

Skills consultadas (barrido por MCP `ui-skills`: `typography`, `token`, `toast`, `error`, `tailwind`, `layout`,
`accessib`, `font`, `shadcn`; lectura repartida en 4 subagentes, todas resolvieron por `get_skill` con `autor/slug`):
- `vercel-react-best-practices` (local, tool `Skill`) — pasada de la sección 4: `server-hoist-static-io` (fuentes en un
  módulo), `rendering-hydration-no-flicker` (posición del toaster sin flash, tema), `rerender-derived-state-no-effect`
  (hook de viewport con `useSyncExternalStore`), `rerender-no-inline-components`, `rendering-conditional-render`
  (slots de `PageHeader`), `bundle-defer-third-party` (PostHog, pendiente fuera de alcance).
- `vercel-labs/react-best-practices` — límite server/client del shell y de `PageHeader` (server, solo primitivos).
- `emilkowalski/ask-sonner` — un solo `<Toaster/>`, traducción `toast({title,description,variant})` → `toast.*`,
  `richColors` incompatible con estilo propio, `unstyled` + `classNames`, `position` no es responsive (corte 600px),
  `resolvedTheme`, `mobileOffset`.
- `shadcn-ui/shadcn` — variantes cva con tokens semánticos, `data-slot`, sin variante "loading" en Button.
- `millionco/tailwind-token-consolidation` — auditar uso de tokens antes de borrar (`brand`, `surface*`, `chart-*`
  siguen vivos), `@theme inline` solo para valores `var()`, trampa de radios con `--radius: 0`.
- `jakubkrehel/better-colors` — un token por rol, medir contraste en los dos temas, color nunca único portador.
- `jakubkrehel/better-typography` — cargar todos los pesos usados (hoy `font-medium` 500 no existe en Poppins),
  `font-variant-numeric` vía `tabular-nums`/`slashed-zero`, `uppercase` por CSS, `antialiased` una sola vez, inputs
  16px en mobile, `text-balance`/`text-pretty`.
- `ibelick/baseline-ui` — `dvh` en vez de `h-screen`, `aria-label` en botones de ícono, sin gradientes/glow.
- `vercel-labs/web-design-guidelines` — foco visible, `scroll-padding-top` = header sticky, skip link, `autocomplete`,
  `themeColor` en `viewport`, nunca `transition: all`, sin `user-scalable=no`.
- `flornkm/prefer-container-queries` — el shell va por viewport; `PageHeader` por `@container`.
- `anthropics/frontend-design` — login: la osadía en un solo lugar (panel izquierdo), sin datos inventados en la
  "firma técnica", copy de error que dice qué hacer.
- `ibelick/fixing-metadata` — `themeColor` en `export const viewport`, `lang="es"` también en `global-error`.
- `pbakaus/harden` — errores con salida clara, `global-error` autosuficiente, skeletons con geometría real.
- `jakubkrehel/better-accessibility` — `:focus-visible` 2px, skip link, `role="status"` siempre montado, errores
  persistentes con botón de cierre, reduced motion.
- `jakubkrehel/better-layout` + `pbakaus/layout` — ritmo PageHeader → `gap-6` → contenido, 1 primary + 2 secundarias
  + ⋯, orden DOM = orden visual, `min-w-0`.

Descartadas tras el listado (no se cargaron): `zeke/swiss-design`, `elithrar/neo-industrial-design`,
`ericzakariasson/scandinavian-design`, `leonxlnx/*` (dirección estética ya fijada en `DISENO.md`); `figma/*`,
`nvillapiano/*`, `firebenders/*`, `edenspiekermann/*` (Figma); `antfu/antfu-design` (UnoCSS); `mengto/tailwindcss`,
`nextlevelbuilder/*` (genéricos, no aportan sobre `DISENO.md`); `emilkowalski/apple-design` y `mickadesign/*` (motion
que el modo instrumental no usa). Nota: el MCP devolvió de `vercel-labs/react-best-practices` solo el índice; el detalle
se tomó de la skill local.

> **Autoridad**: `CLAUDE.md` + `.claude/rules/*` → `PLAN.md` → `DISENO.md` → este plan → skills. Donde este plan se
> aparta de `DISENO.md` está marcado **[Desvío]** con el motivo.

---

## 1. Alcance

### 1.1 Archivos que se tocan (y nada más)

| Archivo | Qué |
|---|---|
| `src/app/globals.css` | Tokens completos de `DISENO.md` §2, tipografía por rol, utilidades, base; limpieza de legado. |
| `src/app/fonts.ts` **(nuevo)** | Instancias `next/font` de IBM Plex Sans/Mono (compartidas por `layout.tsx` y `global-error.tsx`). |
| `src/app/layout.tsx` | Fuentes, `viewport`, `body` sin clases, un solo `<Toaster/>`, sin `<main>` raíz. |
| `src/lib/utils.ts` | Solo la función `cn`: `extendTailwindMerge` con las clases de tamaño nuevas (ver 4.2). |
| `src/components/ui/button.tsx` | 6 variantes semánticas + alias de los 11 nombres viejos; tamaños nuevos + alias. |
| `src/components/ui/badge.tsx` | Tonos de estado con tokens + alias de los 11 nombres viejos. |
| `src/components/ui/card.tsx` | Sin `rounded-xl`, sin `shadow`, sin colores de paleta, sin `[&_*]:text-…`. |
| `src/components/ui/input.tsx`, `src/components/ui/select.tsx` | **Solo la altura** (`h-9`→`h-8`, `sm` `h-8`→`h-7`) para que no queden desalineados con el Button nuevo. **[Desvío]** del listado del PLAN: sin esto toda toolbar queda con Input 36px al lado de Button 32px. |
| `src/components/ui/sonner.tsx` | Toaster único con estilo propio (barra de tono 2px), posición por viewport, `resolvedTheme`. |
| `src/components/ui/toast.tsx`, `toaster.tsx`, `use-toast.ts` | **Se borran** al final del paso de toasts. |
| `src/components/ui/sidebar.tsx` | Solo el texto `sr-only` "Toggle Sidebar" → "Mostrar u ocultar menú" (2 lugares: líneas 277 y 289 `aria-label`). |
| `src/components/ui/ToogleDarkButton.tsx` | Quitar `text-neutral-950` del ícono Sun y `transition-all` → `transition-transform`. |
| `src/shared/components/common/DataTable/DataTable.tsx:518` | Header: `dark:bg-slate-900 bg-white` → `bg-muted`. |
| `src/shared/components/data-table/base/data-table.tsx:282` y `data-table-server.tsx:397` | Header: `bg-background dark:bg-slate-950` → `bg-muted`. |
| `src/app/dashboard/layout.tsx` | Skip link, contenedor de página responsive con `@container/page`. |
| `src/app/dashboard/loading.tsx` | Skeleton con la geometría nueva (PageHeader + panel de tabla). |
| `src/features/Layout/header/DashboardHeader.tsx` | `h-14`, `z-20`, `bg-card/95`, gutter alineado al contenido. |
| `src/features/Layout/sidebar/AppSidebar.tsx` | Header del sidebar sin tinte de marca. |
| `src/features/Layout/sidebar/components/NavMain.tsx` | Activo = `bg-sidebar-accent` + barra 2px (sin relleno sólido), label de grupo `text-overline`. |
| `src/features/Layout/sidebar/components/DashboardBreadcrumb.tsx` | `text-caption`, último nivel 500. |
| `src/shared/components/layout/PageHeader.tsx` **(nuevo)** y `PageHeaderSkeleton.tsx` **(nuevo)** | Componente de encabezado de página. |
| `src/features/TabsManager/SectionManagerServer.tsx` | Su `<h1>` + `actions` pasan a renderizarse con `PageHeader` (así los 9 módulos lo estrenan sin tocar sus archivos). |
| `src/shared/components/layout/StatusScreen.tsx` **(nuevo)** | Layout común de 404 / error / global-error. |
| `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/dashboard/error.tsx` | Rediseño sobre `StatusScreen`, mismos textos y acciones. |
| `src/features/Auth/components/AuthShell.tsx` **(nuevo)** y `src/features/Auth/fallback/AuthFormSkeleton.tsx` **(nuevo)** | Layout partido de login/recupero. |
| `src/app/login/page.tsx`, `src/features/Auth/components/LoginForm.tsx`, `LoginButton.tsx` | Login sobre `AuthShell`. En `LoginButton` solo se borra `element.style.color = 'red'` y el tamaño del botón. |
| `src/app/reset_password/page.tsx`, `update-user/page.tsx`, `confirm/page.tsx` | Sobre `AuthShell`, sin `RenderBanner`. |
| `src/features/Auth/components/RecoveryPasswordForm.tsx`, `UpdateUserPasswordForm.tsx` | Solo clases (callouts con tokens, sin `text-lg`). |
| `src/app/login/loading.tsx`, `src/app/reset_password/loading.tsx`, `confirm/loading.tsx`, `update-user/loading.tsx` | Skeleton sobre `AuthShell`. |
| `src/features/Auth/components/RenderBanner.tsx`, `AutenticationLight.tsx`, `AutenticationDark.tsx`, `RefreshComponent.tsx` | **Se borran** (únicos importadores: las 3 páginas de `reset_password`; confirmar con LSP `findReferences`). |
| 10 consumidores de `use-toast` + `MaintenanceGroupsClient.tsx` | Migración a sonner (lista exacta en 3.6). |

### 1.2 Pantallas del alcance

- `/login` (`?error=oauth`) → `src/app/login/page.tsx` → `LoginForm.tsx`.
- `/reset_password` → `RecoveryPasswordForm.tsx`; `/reset_password/update-user` → `UpdateUserPasswordForm.tsx`;
  `/reset_password/confirm` (huérfana, ver inventario).
- 404 global (`not-found.tsx`), error de app (`error.tsx`), error global (`global-error.tsx`), error y carga del
  dashboard (`dashboard/error.tsx`, `dashboard/loading.tsx`).
- Shell del dashboard (sidebar + header + contenedor) — afecta a **todas** las rutas `/dashboard/**`.
- Indirectamente: toda la app por tokens, fuente, Button, Badge, Card, Input/Select (altura) y header de tabla.

### 1.3 Tablas
No aplica como superficie propia: solo cambia el color del header en los 3 componentes de tabla compartidos. El
rediseño del DataTable es la Fase 3; las `BaseDataTable`, la Fase 5.

### 1.4 Dialogs / forms que abren estas pantallas
Ninguno (login y recupero son forms en página). Los dialogs de la app solo heredan tokens.

### 1.5 Fuera de esta fase aunque se vea en pantalla
- Paneles de campo (`/operator`, `/maintenance`, `/clothing`) — Fase 4/7. Heredan tokens y fuente.
- `Tabs`, `Dialog`, `Sheet`, `Popover`, `Tooltip`, `Alert`, `Calendar`, `Skeleton`, `Checkbox` de `components/ui`
  — Fase 2 (primitivos). Heredan tokens; siguen con su `shadow`/`ring` propios hasta entonces.
- Consumidores de Button/Badge/Card: **no se tocan** (los alias garantizan que nada rompa).
- `NavUser.tsx` y `CompanySwitcher.tsx`: no tienen colores hardcodeados (conteo = 0); solo heredan tokens.
- PostHog (`PostHogProvider`), `ContextualHelp`, `PasswordChangeAlertWrapper`: sin cambios.

---

## 2. Estado actual

### 2.1 Problemas de UI
- `src/app/layout.tsx:28`: `body` con `popinsFont.className bg-surface-muted dark:bg-slate-900`, y `globals.css:143`
  con `bg-muted/90`: dos fondos distintos para el mismo `body`; en oscuro el slate-900 no es un token.
- `src/app/layout.tsx:9-12`: Poppins 400/600/700. `font-medium` (906 usos en `src`) **no tiene 500 cargado**: hoy
  se ve en 400. Al cargar Plex 500 todo `font-medium` se va a ver más pesado (esperado, ver riesgos).
- `globals.css:151-181`: `details[open] summary ~ * { animation: sweep }`, `summary::after` con
  `url(https://uploads.sitepoint.com/…)` (request remoto en cada `<details>`), y `globals.css:183-203` reglas del
  template de landing (`.header-logo`, `.menu-scroll`, `#togglePlan`, `#checkboxLabel`) sin uso en `src`.
- `--chart-1..5` son 5 pasos del mismo verde (`globals.css:85-89`).
- `button.tsx:13,16,19,20`: `destructive` `bg-red-400`, `secondary` violeta `bg-purple-400`, `primary` azul
  `bg-blue-500`, `success` esmeralda; todas con `shadow`; base con `transition-all` y `ring-[3px]`.
- `badge.tsx:81-89`: colores de paleta (`bg-red-700`, `bg-yellow-500`, `bg-blue-500`, `bg-green-700/80`) y texto
  `text-yellow-50` sobre amarillo (contraste insuficiente).
- `card.tsx:119`: `rounded-xl … shadow`; variantes con `[&_*]:text-emerald-700` que pisan el color de todo hijo.
- `DataTable.tsx:518`: header `dark:bg-slate-900 bg-white` (pedido explícito del usuario); `data-table.tsx:282` y
  `data-table-server.tsx:397`: `bg-background dark:bg-slate-950`.
- `dashboard/layout.tsx:66`: `px-6 pb-4` fijo, sin padding superior ni `max-w`, 24px de gutter también a 375px.
- `DashboardHeader.tsx:21`: `h-16` que pasa a `h-12` al colapsar el sidebar (el alto del header cambia → no hay un
  `scroll-padding-top` estable), `z-10` (empata con headers de tabla sticky).
- `NavMain.tsx:38-62`: tab activa con **relleno sólido** `bg-brand` (rasgo GH "fondo relleno para lo activo"), barra
  de 3px, `font-semibold`; `AppSidebar.tsx:70` header con `bg-brand/5`.
- `not-found.tsx`: blobs con blur, glass, degradé azul→violeta, `hover:scale-105`, sin modo oscuro.
- `dashboard/error.tsx`: 48 colores de paleta (naranja, azul, gris), `CardFooter` gris.
- `global-error.tsx:56`: `<NextError statusCode={0} />` (pantalla genérica sin estilos ni acciones).
- Recupero de contraseña: banner `AutenticationLight/Dark` con cita de GH, grilla + glow naranja; `RenderBanner`
  lee la cookie `theme` en el server y `RefreshComponent` hace `router.refresh()` al montar para corregirlo.
- Login: card centrada `login-03` (patrón GH, `DISENO.md` §6).

### 2.2 Accesibilidad
- `globals.css:140`: `outline-ring/50` y sin regla de `:focus-visible` propia: el foco depende de cada componente.
- `LoginButton.tsx:32`: error de validación por `style.color = 'red'` (≈4:1 sobre blanco, no es token, no se adapta
  a oscuro). Los `<p id="*_error">` no tienen `aria-live`.
- `--muted-foreground` sobre el body `bg-muted` mide 4.15:1 (falla AA, `DISENO.md` "Hallazgos de contraste").
- `--input` = `--border` (≈1.3:1): los bordes de inputs no llegan a 3:1 (WCAG 1.4.11).
- `sidebar.tsx:277,289`: nombre accesible en inglés ("Toggle Sidebar").
- Reset/confirm/update: el título es un `CardTitle` (`<div>`), no hay `<h1>`.
- No hay skip link en el shell; `layout.tsx:33` envuelve todo en `<main>` y `SidebarInset` es otro `<main>`
  (landmark anidado); los layouts de `/operator` y `/clothing` también tienen su `<main>`.

### 2.3 Responsive
- Contenedor con 24px de gutter fijo a 375px (`dashboard/layout.tsx:66`).
- `reset_password/*`: `min-h-screen` + `container` con `p-0` en mobile: el form queda pegado a los bordes.
- `not-found.tsx`/`error.tsx`: `min-h-screen` (salta con la barra de URL en iOS).

### 2.4 Rasgos de GH presentes (`DISENO.md` §7)
Poppins · Button primary azul / secondary violeta / destructive rojo · badges `yellow/red/info` de paleta · `<Card>`
con shadow y `rounded-xl` · header de tabla `bg-white dark:bg-slate-900` · login con card centrada · `dark:slate-*`
hardcodeado · `--chart-1..5` del mismo verde · toast shadcn genérico · fondo relleno en el ítem activo del sidebar.

### 2.5 Deuda de código
- Dos sistemas de toast montados a la vez (`layout.tsx:31-32`) **más** un tercer `<Toaster/>` radix en
  `MaintenanceGroupsClient.tsx:58` (en esa pantalla los toasts radix salen por duplicado). `use-toast` con
  `TOAST_LIMIT = 1` y `TOAST_REMOVE_DELAY = 1000000`.
- `ToogleDarkButton.tsx:20-24`: escribe la cookie `theme` **durante el render**; su único lector es `RenderBanner`,
  que se borra. Queda escribiendo una cookie que nadie lee → deuda para `PLAN.md` §9 (no se toca: es lógica).
- `RefreshComponent.tsx`: `useEffect` + `router.refresh()` en cada montaje (se borra con el banner).
- `src/lib/utils.ts:6-7`: el módulo de `cn` re-exporta server actions (`getActualRole`, `uploadDocument`…): barrel
  importado por casi todos los componentes cliente (`bundle-barrel-imports`). Fuera de alcance → §9.
- `PostHogProvider` carga `posthog-js` en el bundle inicial (`bundle-defer-third-party`). Fuera de alcance → §9.
- `error.tsx` / `dashboard/error.tsx`: `useEffect` + `setErrorDetails` (deriva de `window`/`navigator`; ver 4.6).

### 2.6 Mediciones de partida
Conteo (`node scripts/ui/count-hardcoded-colors.mjs`): **global 2900 en 322 archivos**. En los archivos del alcance:

| Archivo | Hardcodeados |
|---|---|
| `src/app/dashboard/error.tsx` | 48 |
| `src/components/ui/card.tsx` | 24 |
| `src/app/not-found.tsx` | 17 |
| `src/components/ui/badge.tsx` | 17 |
| `src/components/ui/button.tsx` | 10 |
| `src/features/Auth/components/RecoveryPasswordForm.tsx` | 10 |
| `src/features/Auth/components/AutenticationDark.tsx` / `AutenticationLight.tsx` | 8 / 7 |
| `src/features/Auth/components/UpdateUserPasswordForm.tsx` | 7 |
| `src/components/ui/toast.tsx` | 6 |
| `src/app/error.tsx` | 5 |
| `src/app/login/loading.tsx`, `reset_password/loading.tsx`, `confirm/loading.tsx`, `update-user/loading.tsx` | 1 c/u |
| `src/shared/components/common/DataTable/DataTable.tsx` | 2 |
| `data-table/base/data-table.tsx`, `data-table-server.tsx` | 1 c/u |
| `src/app/layout.tsx`, `src/components/ui/ToogleDarkButton.tsx` | 1 c/u |
| `src/app/reset_password/confirm/page.tsx` / `update-user/page.tsx` / `page.tsx` | 12 / 2 / 1 |
| **Total del alcance** | **184** |

Objetivo al cerrar: **todos esos archivos en 0** y global ≤ **2716** (2900 − 184).

Uso de las APIs que se aliasan (script de tags JSX multilínea, `src/**/*.tsx`):
- `<Button>` 986 tags. `variant`: `outline` 262 archivos · sin variant 166 · `ghost` 127 · `brand` 51 · `link` 25 ·
  `destructive` 19 · `default` 12 · `primary` 1 (`ModalCompany.tsx`) · `success` 1 (`DiagramFormUpdated.tsx`, dinámico)
  · dinámicos que resuelven a `outline/default/link/destructive/ghost/success/brand`. `size`: `sm` 168 · `icon` 37 ·
  `lg` 3 · `xs` 3 · `icon-sm` 1 · `default` 1. `buttonVariants({variant})` en 7 archivos (`outline`, `default`, `brand`).
  `secondary`, `surface`, `surfaceMuted` no aparecen literales pero pueden llegar por props tipadas
  (`alert-dialog.tsx`, `calendar.tsx`, `multi-select.tsx`, `action-button.tsx`) → se conservan igual.
- `<Badge>` 771 tags. `outline` 134 · `secondary` 108 · `destructive` 40 · `default` 39 · `success` 18 · `warning` 14 ·
  `yellow` 5 · `info` 2 · ~110 dinámicos por mapas tipados con `BadgeProps['variant']` (`Clothing/utils/mappers.ts`,
  `Gomeria/shared/tire-mappers.ts`, etc.) → **todos los nombres** (incluidos `red`, `ghost`, `link`) se conservan.
- `<Card>` 401 tags: **ninguno** usa `variant`, `size`, `padding`, `text_color` ni `rounded`; `cardVariants` y
  `CardProps` no se importan fuera de `card.tsx`. Se conservan igual (API intacta).
- `'use client'` en el alcance: `error.tsx`, `dashboard/error.tsx`, `global-error.tsx`, `sonner.tsx`, `NavMain.tsx`,
  `DashboardBreadcrumb.tsx`, `LoginButton.tsx`, `RecoveryPasswordForm.tsx`, `UpdateUserPasswordForm.tsx`,
  `RefreshComponent.tsx` (se borra), `ToogleDarkButton.tsx`, los 10 consumidores de toast.
- `useEffect` en el alcance: 2 en `error.tsx`, 1 en `dashboard/error.tsx`, 1 en `global-error.tsx` (todos
  sincronización con sistemas externos: logger/PostHog), 1 en `RefreshComponent.tsx` (se borra).
- Archivos > 400 líneas en el alcance: `sidebar.tsx` (shadcn, solo se toca un texto) y `DataTable.tsx` (solo la
  línea 518).
- Otros datos: `rounded-xl` 36 usos y `rounded-2xl` 5 (hoy 4px/8px; pasan a 0), `rounded-full` 211 (se queda),
  `font-bold` 175 (Plex no carga 700 → se renderiza 600 sin síntesis), `font-mono` 120 (pasan a Plex Mono).

---

## 3. Diseño propuesto, por archivo

### 3.1 `src/app/globals.css` (se reescribe entero, en este orden)

```
1. @import 'tailwindcss'; @import 'tw-animate-css';           (igual)
2. @custom-variant dark (&:is(.dark *));                       (igual)
3. @theme inline { … }        mapeos a var() (existentes + nuevos)
4. @theme { … }               valores estáticos: escala tipográfica, radios en 0, motion
5. :root { … }                DISENO.md §2.2 LITERAL + --page-max + --shadow-overlay-value
6. .dark { … }                DISENO.md §2.3 LITERAL + --shadow-overlay-value oscuro
7. @layer base { … }          base de DISENO.md §2.4 (con la corrección de reduced-motion)
8. @utility …                 text-overline, data-code
9. summary::-webkit-details-marker { display: none; }          (se conserva: el Manual la necesita en Safari)
```

**Se borra**: `body { @apply bg-muted/90 }` (l.142-144), `html { scroll-behavior: smooth }` suelto (pasa a la base
con media query), `details[open] summary ~ * { animation: sweep }` y `@keyframes sweep` (l.151-164),
`summary::after` con la URL de sitepoint y `details[open] > summary::after` (l.166-177), y todo el
`@layer components` de landing (l.183-203). Verificado: los 3 `<summary>` de `src/` (Manual: `GuideView.tsx:106`,
`ManualIndex.tsx:25`, `ManualTabContent.tsx:167`) usan `list-none`, `after:hidden` y su propio ícono, así que no
dependen de la regla borrada; `.header-logo`, `.menu-scroll`, `#togglePlan` y `#checkboxLabel` no tienen usos.
`--breakpoint-cardMedia` y `--width-sidebar-open/close` no tienen usos → se borran (`DISENO.md` §2.6).

**`@theme inline`** — se conservan TODOS los mapeos actuales (`--color-background` … `--color-sidebar-ring`,
`--color-brand*`, `--color-surface*`: `brand` tiene 50+ archivos y `surface*` 29 usos vivos) y se agregan:

```css
--color-canvas: var(--canvas);              --color-panel-2: var(--panel-2);
--color-border-strong: var(--border-strong); --color-fg-subtle: var(--fg-subtle);
--color-primary-hover: var(--primary-hover); --color-primary-soft: var(--primary-soft);
--color-primary-text: var(--primary-text);
/* por cada tono s ∈ success | warning | danger | info | neutral (20 líneas, escritas completas): */
--color-success: var(--success); --color-success-soft: var(--success-soft);
--color-success-border: var(--success-border); --color-success-text: var(--success-text);
/* … idem warning, danger, info, neutral … */
--color-chart-6: var(--chart-6); --color-chart-other: var(--chart-other);
--color-chart-grid: var(--chart-grid); --color-chart-axis: var(--chart-axis);
--font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;
--font-mono: var(--font-plex-mono), ui-monospace, monospace;
--shadow-overlay: var(--shadow-overlay-value);
```

> `--shadow-overlay` apunta a `var(--shadow-overlay-value)` y el valor vive en `:root`/`.dark`, porque `DISENO.md`
> §2.4 pide otro valor en oscuro y un literal dentro de `@theme inline` no cambiaría con `.dark`.
> La escala de sombras de Tailwind (`shadow-sm`…`shadow-xl`) **no se resetea** en esta fase: popover, dialog,
> dropdown y sheet todavía la usan (Fase 2). En esta fase solo salen las sombras de Button, Badge y Card.
> Antes de crear cada `--color-*` nuevo, confirmar que no exista un `--background-image-*` homónimo (colisión de
> `bg-X` en Tailwind v4): hoy no hay ninguno.

**`@theme`** (valores estáticos):

```css
/* Radios: todo 0. rounded-full NO sale de --radius: queda en 9999px para avatar, punto de estado y switch */
--radius-xs: 0; --radius-sm: 0; --radius-md: 0; --radius-lg: 0; --radius-xl: 0;
--radius-2xl: 0; --radius-3xl: 0; --radius-4xl: 0;

/* Escala tipográfica por rol (DISENO.md §3), en rem con base 16px */
--text-display: 2rem;       --text-display--line-height: 1.15;   --text-display--font-weight: 600;   --text-display--letter-spacing: -0.02em;
--text-page-title: 1.25rem; --text-page-title--line-height: 1.3; --text-page-title--font-weight: 600; --text-page-title--letter-spacing: -0.01em;
--text-section: 0.9375rem;  --text-section--line-height: 1.35;   --text-section--font-weight: 600;
--text-body: 0.875rem;      --text-body--line-height: 1.5;       --text-body--font-weight: 400;
--text-cell: 0.8125rem;     --text-cell--line-height: 1.4;       --text-cell--font-weight: 400;
--text-label: 0.8125rem;    --text-label--line-height: 1.3;      --text-label--font-weight: 500;
--text-caption: 0.75rem;    --text-caption--line-height: 1.4;    --text-caption--font-weight: 400;
--text-kpi: 1.75rem;        --text-kpi--line-height: 1.1;        --text-kpi--font-weight: 600;       --text-kpi--letter-spacing: -0.02em;

/* Motion */
--ease-out-quick: cubic-bezier(0.23, 1, 0.32, 1);
--duration-fast: 120ms; --duration-base: 180ms; --duration-panel: 240ms;
```

Se borran del `@theme inline` actual las líneas `--radius-sm … --radius-4xl: calc(…)` (las reemplaza el bloque de
arriba). `--radius: 0` sigue en `:root` porque lo leen `sonner.tsx` y componentes shadcn.

**`:root` y `.dark`**: copiar **literal** los bloques de `DISENO.md` §2.2 y §2.3 (valores ya medidos). Se agregan:

```css
:root {
  --page-max: 1440px;
  --shadow-overlay-value: 0 0 0 1px oklch(0 0 0 / 0.04), 0 8px 24px -8px oklch(0 0 0 / 0.18);
}
.dark {
  --shadow-overlay-value: 0 0 0 1px oklch(1 0 0 / 0.08);
}
```

`--destructive-foreground` ya viene en los bloques de DISENO: no duplicar la línea actual (l.99-100 y l.135).

**`@layer base`**:

```css
@layer base {
  * { @apply border-border outline-ring; }
  html { scroll-padding-top: 3.5rem; }                   /* = h-14 del header sticky */
  body { @apply bg-canvas text-foreground antialiased font-sans; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;           /* [Desvío] ver nota */
      transition-duration: 1ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

- **[Desvío] de `DISENO.md` §2.4**: `scroll-padding-top: 3.5rem` (no `4rem`), porque el header queda en `h-14`.
- **[Desvío]**: se agrega `animation-iteration-count: 1`. Sin eso, toda animación infinita (`animate-pulse` de los
  skeletons, `animate-spin`) queda con 1ms de duración **repitiéndose sin fin, o sea un parpadeo estroboscópico**,
  que es justo lo que reduced-motion tiene que evitar. Con `count: 1` el skeleton queda estático y el spinner quieto
  (`DISENO.md` §4.12: "con reduced-motion, sin pulso").

**`@utility`**:

```css
@utility text-overline {
  font-size: 0.6875rem; line-height: 1.3; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase;
}
@utility data-code {
  font-family: var(--font-mono); font-size: 0.92em;
  font-variant-numeric: tabular-nums slashed-zero;
}
```

`text-overline` va como `@utility` (no como `--text-overline`) porque lleva `text-transform`, que el namespace
`--text-*` no admite. En el JSX el texto se escribe en caso natural ("Módulos"), nunca en mayúsculas.

### 3.2 `src/app/fonts.ts` (nuevo) y `src/app/layout.tsx`

`src/app/fonts.ts` (sin directiva; instancias a nivel de módulo, `server-hoist-static-io`):

```ts
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap',
});
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap',
});
export const fontVariables = `${plexSans.variable} ${plexMono.variable}`;
```

Decisiones: solo los 5 pesos (sin 300 ni 700: `font-bold` cae a 600 real, sin síntesis); `preload` por defecto
(true) en las dos, porque Mono aparece arriba del pliegue en tablas (legajo, patente) y sin preload se vería el swap;
`adjustFontFallback` por defecto (true) para minimizar CLS; subset `latin` (incluye ñ y acentos).

`src/app/layout.tsx` queda así (metadata igual que hoy):

```tsx
import { Toaster } from '@/components/ui/sonner';
import { PostHogProvider } from '@/shared/providers/PostHogProvider';
import { ThemeProvider } from '@/shared/providers/theme-provider';
import type { Metadata, Viewport } from 'next';
import { fontVariables } from './fonts';
import './globals.css';

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f9' }, // --canvas claro
    { media: '(prefers-color-scheme: dark)', color: '#0c0f11' },  // --canvas oscuro
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fontVariables} suppressHydrationWarning>
      <body>
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
```

- `body` **sin clases** (las pone la base). Salen `popinsFont.className` y `bg-surface-muted dark:bg-slate-900`.
- Sale el `<Toaster />` radix y el alias `Sonner`; queda un solo `<Toaster />` (`sonner.tsx`, sin `richColors`).
- Sale el `<main>` raíz: hoy anida con el `<main>` de `SidebarInset` y con el de los layouts de `/operator` y
  `/clothing (panel)`. El landmark lo pone cada layout (`SidebarInset`, `AuthShell`, `StatusScreen`).
- Sin `maximumScale` ni `userScalable` (prohibidos por accesibilidad). Hex de `themeColor` calculados desde los oklch
  de `--canvas`.
- `metadata` no se toca (title template y `robots` no son parte de este pedido).

### 3.3 `src/lib/utils.ts` — `cn` con tailwind-merge extendido (obligatorio)

`tailwind-merge` 3.5 trata cualquier `text-<desconocido>` como **color**: `cn('text-overline', 'text-muted-foreground')`
borraría `text-overline` en silencio, y `cn('text-section', 'text-primary-text')` igual. Se reemplaza solo la
función `cn` y su import (el resto del archivo no se toca):

```ts
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'page-title', 'section', 'overline', 'body', 'cell', 'label', 'caption', 'kpi'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Verificación puntual (script descartable en el scratchpad, no commiteado): `cn('text-overline text-muted-foreground')`
conserva las dos; `cn('text-caption text-sm')` deja solo `text-sm`; `cn('text-success-text text-danger-text')` deja
`text-danger-text`.

### 3.4 Button, Badge, Card (+ altura de Input/Select)

#### 3.4.1 `src/components/ui/button.tsx`

Constantes de estilo (escritas completas, nunca armadas en runtime):

| Constante | Clases |
|---|---|
| `PRIMARY` | `bg-primary text-primary-foreground hover:bg-primary-hover` |
| `SECONDARY` | `border border-input bg-card text-foreground hover:bg-accent` |
| `GHOST` | `text-foreground hover:bg-accent` |
| `DANGER` | `bg-danger text-destructive-foreground hover:bg-danger/90` |
| `DANGER_GHOST` | `text-danger-text hover:bg-danger-soft` |
| `LINK` | `text-primary-text underline-offset-4 hover:underline` |

Base de la cva:
```
inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-none text-label
transition-[background-color,color,border-color] duration-(--duration-fast)
disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger
pointer-coarse:min-h-11
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```
Sin `outline-none` ni `ring-[3px]`: el foco lo da la regla global `:focus-visible` (outline 2px `--ring`). Sin
`shadow`, sin `transition-all`, sin `active:scale`. `text-label` = 13px / 500 (lo que pide `DISENO.md` §4.1).

**Mapa de variantes** (la cva tiene 13 claves; las viejas apuntan a la constante nueva):

| Clave | Estilo | Estado y uso actual |
|---|---|---|
| `primary` | `PRIMARY` | **nueva** (antes azul `bg-blue-500`; 1 uso, `ModalCompany.tsx`, pasa a verde) |
| `secondary` | `SECONDARY` | **nueva** (antes violeta `bg-purple-400`; sin usos literales) |
| `ghost` | `GHOST` | **nueva**, mismo nombre (127 archivos) |
| `danger` | `DANGER` | **nueva** |
| `danger-ghost` | `DANGER_GHOST` | **nueva** |
| `link` | `LINK` | **nueva**, mismo nombre (25 archivos) |
| `default` | `PRIMARY` | alias (12 archivos + defaults de `alert-dialog` + `buttonVariants`) |
| `brand` | `PRIMARY` | alias (51 archivos) |
| `success` | `PRIMARY` | alias (`DiagramFormUpdated`, `ServiceItemsSection`) |
| `outline` | `SECONDARY` | alias (262 archivos) |
| `surface` | `SECONDARY` | alias (sin usos literales) |
| `surfaceMuted` | `SECONDARY` | alias (sin usos literales) |
| `destructive` | `DANGER` | alias (19 + 4 dinámicos). Se elige `danger` (relleno) y no `danger-ghost` porque el `destructive` actual es un relleno: es el equivalente visual. `danger` vs `danger-ghost` por contexto se decide al migrar cada módulo. |

**Tamaños:**

| Clave | Clases | Estado |
|---|---|---|
| `md` | `h-8 px-3 has-[>svg]:px-2.5` | **nueva, default** (antes `default` = `h-9`) |
| `xs` | `h-6 gap-1 px-2 text-caption has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3` | mismo nombre |
| `sm` | `h-7 px-2.5 has-[>svg]:px-2` | mismo nombre (antes `h-8`) |
| `lg` | `h-10 px-4 has-[>svg]:px-3` | mismo nombre |
| `icon` | `size-8 pointer-coarse:min-w-11` | mismo nombre (antes `size-9`) |
| `icon-sm` | `size-7 pointer-coarse:min-w-11` | mismo nombre (antes `size-8`) |
| `default` | = `md` | alias |
| `icon-xs` | `size-6 pointer-coarse:min-w-11 [&_svg:not([class*='size-'])]:size-3` | alias conservado |
| `icon-lg` | `size-10 pointer-coarse:min-w-11` | alias conservado |

`defaultVariants: { variant: 'primary', size: 'md' }`, y los defaults de los parámetros del componente pasan a
`variant = 'primary'`, `size = 'md'`.

**`data-variant` canónico**: se exporta `BUTTON_VARIANT_CANONICAL` (`default|brand|success → 'primary'`,
`outline|surface|surfaceMuted → 'secondary'`, `destructive → 'danger'`, el resto igual) y el componente escribe
`data-variant={BUTTON_VARIANT_CANONICAL[variant]}`; `data-size` también canónico (`default → 'md'`). Lo usa
`PageHeader` para ensanchar el primary en mobile. Ningún selector de `src/` lee hoy `data-variant`/`data-size` de
Button (verificado: los `data-[size=…]` que existen son de `alert-dialog` y `avatar`), así que no rompe nada.
`data-slot="button"` se conserva.

**Compatibilidad confirmada**: el tipo de `variant`/`size` sigue saliendo de `VariantProps<typeof buttonVariants>`,
que ahora contiene las 13 + 9 claves. Todo `variant="outline"`, `buttonVariants({ variant: 'brand' })` y
`React.ComponentProps<typeof Button>['variant']` (`alert-dialog`, `calendar`, `carousel`, `sidebar`, `pagination`,
`action-button`, `BackButton`, `multi-select`) compila sin tocarse. `buttonVariants` sigue exportado con la misma
firma. En la Fase 9 se borran las claves alias y TypeScript marca cada uso residual.

#### 3.4.2 `src/components/ui/badge.tsx`

Base:
```
inline-flex w-fit shrink-0 items-center justify-center gap-1 min-h-5 px-1.5 py-px
border rounded-none text-caption font-medium whitespace-nowrap overflow-hidden
[&>svg]:size-3 [&>svg]:pointer-events-none transition-[color,background-color]
```
(`min-h-5` en vez de `h-5` para no recortar los badges a los que los consumidores les meten íconos más grandes.)

| Clave | Clases | Estado |
|---|---|---|
| `success` | `border-success-border bg-success-soft text-success-text` | tono success |
| `warning` | `border-warning-border bg-warning-soft text-warning-text` | tono warning |
| `yellow` | = `warning` | alias |
| `danger` | `border-danger-border bg-danger-soft text-danger-text` | **nueva** |
| `destructive` | = `danger` | alias |
| `red` | = `danger` | alias |
| `info` | `border-info-border bg-info-soft text-info-text` | tono info |
| `neutral` | `border-neutral-border bg-neutral-soft text-neutral-text` | **nueva** |
| `secondary` | = `neutral` | alias |
| `brand` | `border-primary/30 bg-primary-soft text-primary-text` | **nueva** |
| `default` | = `brand` | alias (antes relleno sólido primary) |
| `outline` | `border-border-strong bg-transparent text-foreground [a&]:hover:bg-accent` | etiqueta neutra sin fondo |
| `ghost` | `border-transparent [a&]:hover:bg-accent` | conservada |
| `link` | `border-transparent text-primary-text underline-offset-4 [a&]:hover:underline` | conservada |

**[Desvío] menor**: `DISENO.md` §4.2 mapea `outline → neutral` para `StatusBadge`. Acá `outline` queda como etiqueta con
borde y sin fondo (sigue siendo neutra) porque en los 134 archivos que lo usan hoy es una *etiqueta* (tipo,
categoría), que es justo el uso que §4.2 reserva para el `Badge` `outline`. `secondary` sí pasa al tono `neutral`.
Contraste `*-text` sobre `*-soft`: medido en `DISENO.md` §2.2/2.3 (≥ 6.17:1 claro, ≥ 7.89:1 oscuro).
Se quitan las clases de foco propias (`focus-visible:ring-[3px]`…): con `asChild` sobre un link aplica el outline
global. La API (`variant`, `asChild`, `BadgeProps`, `badgeVariants`) no cambia; `data-slot`/`data-variant` igual.
Los badges siguen siendo "solo color" en sus consumidores (falta ícono): eso lo resuelve `StatusBadge` (Fase 2) al
migrar cada módulo; no se toca acá.

#### 3.4.3 `src/components/ui/card.tsx`

Base de `cardVariants`: `border border-border bg-card text-card-foreground` (salen `rounded-xl` y `shadow`). El
`'flex flex-col gap-6 py-6'` del componente **se conserva**: los 401 usos dependen de `CardContent className="pt-6"`
y del `px-6` de header/content; la densidad de `Panel` (p-4) llega en la Fase 2 como componente nuevo, no cambiando
`Card`.

| Variante | Clases nuevas |
|---|---|
| `default` | `''` |
| `outlined` | `border-border-strong bg-transparent` (1px; sale `border-2`) |
| `filled` | `border-transparent bg-muted text-foreground` |
| `elevated` | `''` (sin sombra, `DISENO.md` §1 principio 2) |
| `ghost` | `border-transparent bg-transparent` |
| `primary` | `border-primary/30 bg-primary-soft` |
| `secondary` | `bg-panel-2` |
| `success` | `border-success-border bg-success-soft text-success-text` |
| `warning` | `border-warning-border bg-warning-soft text-warning-text` |
| `destructive` | `border-danger-border bg-danger-soft text-danger-text` |
| `text_color.success` / `.warning` / `.destructive` | `text-success-text` / `text-warning-text` / `text-danger-text` |
| `rounded.none` / `sm` / `default` / `lg` | `rounded-none` (las 4); `rounded.full` queda `rounded-full` |

Sin `[&_*]:text-…` ni `[&_.card-description]:…`: el color se hereda y un hijo con color propio lo conserva.
`CardTitle`: `leading-none font-semibold` → `text-section`. `CardDescription`, `CardHeader`, `CardContent`,
`CardFooter`, `CardAction`: sin cambios. `data-slot` en todos, igual.

#### 3.4.4 `src/components/ui/input.tsx` y `select.tsx` (solo altura) — **[Desvío]** del listado del PLAN
Sin esto, toda toolbar queda con Input/Select de 36px al lado de un Button de 32px.
- `input.tsx`: `h-9` → `h-8`. Nada más (el resto del input es Fase 2).
- `select.tsx` (`SelectTrigger`): `data-[size=default]:h-9` → `data-[size=default]:h-8` y `data-[size=sm]:h-8` →
  `data-[size=sm]:h-7`.
- Los usos con altura explícita (`className="h-10"`, `h-9`) ganan por twMerge y no se tocan.

### 3.5 Header de tabla (pedido explícito)

| Archivo:línea | Antes | Después |
|---|---|---|
| `src/shared/components/common/DataTable/DataTable.tsx:518` | `sticky top-0 z-10 dark:bg-slate-900 bg-white` | `sticky top-0 z-10 bg-muted` |
| `src/shared/components/data-table/base/data-table.tsx:282` | `sticky top-0 z-10 bg-background dark:bg-slate-950` | `sticky top-0 z-10 bg-muted` |
| `src/shared/components/data-table/base/data-table-server.tsx:397` | `sticky top-0 z-10 bg-background dark:bg-slate-950` | `sticky top-0 z-10 bg-muted` |

Solo color: `--muted` es opaco en los dos temas (requisito de un header sticky). La altura `h-8`, el `text-overline` y
el `border-border-strong` son de la Fase 3: hoy cada `DataTableColumnHeader` fija su propio tamaño de texto y un
`text-overline` en el `<th>` quedaría a medias. Los otros 15 hardcodeados de `data-table/base/**` (`view-options`,
`filter-options`) quedan para la Fase 5 (esas tablas se migran y se borran).

### 3.6 Toasts: un solo toaster (sonner)

#### 3.6.1 `src/components/ui/sonner.tsx` (reescritura)

- `'use client'`. `const { resolvedTheme } = useTheme()` → `theme={resolvedTheme === 'dark' ? 'dark' : 'light'}`
  (no `theme`, que puede valer `'system'` y desfasarse de la clase `.dark`).
- Posición por viewport con `useSyncExternalStore` (regla del repo: nada de `useEffect` + `useState`):
  ```ts
  const NARROW_QUERY = '(max-width: 600px)'; // mismo corte que usa sonner para su layout mobile
  function subscribeNarrow(onChange: () => void) {   // a nivel de módulo
    const mql = window.matchMedia(NARROW_QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  const getNarrow = () => window.matchMedia(NARROW_QUERY).matches;
  const getNarrowServer = () => false;
  // dentro del componente:
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowServer);
  ```
  `position={isNarrow ? 'top-center' : 'bottom-right'}`. En SSR vale desktop; como el toaster arranca vacío, el
  cambio al hidratar no produce flash. Se usa 600px y no `md` (768) porque sonner ya cambia a ancho completo a 600:
  con 768 habría una franja 600–767 "arriba al centro pero con layout de escritorio".
- `offset={16}` (desktop) y `mobileOffset={{ top: 64, left: 16, right: 16 }}` (64 = header `h-14` + 8: no tapa el ☰
  ni el breadcrumb).
- `closeButton` global (todo toast se puede cerrar; requisito de los persistentes).
- `duration={4000}` (éxito se autocierra a los 4s, `DISENO.md` §4.13).
- **Sin `richColors`** (pinta fondo y borde por tipo con selectores propios y choca con la barra de tono).
- `toastOptions={{ unstyled: true, classNames: { … } }}`:

| Clave | Clases |
|---|---|
| `toast` | `group/toast relative flex w-(--width) items-start gap-2.5 border border-border-strong border-l-2 bg-popover py-2.5 pr-9 pl-3 text-popover-foreground shadow-overlay` |
| `content` | `flex min-w-0 flex-1 flex-col gap-0.5` |
| `title` | `text-body font-medium` |
| `description` | `text-caption text-muted-foreground` |
| `icon` | `mt-0.5 shrink-0 [&_svg]:size-4` |
| `closeButton` | `absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground` |
| `actionButton` | `ml-auto h-7 shrink-0 px-2.5 text-label bg-primary text-primary-foreground hover:bg-primary-hover` |
| `cancelButton` | `h-7 shrink-0 px-2.5 text-label border border-input bg-card hover:bg-accent` |
| `default` y `loading` | `border-l-border-strong` |
| `success` | `border-l-success [&_[data-icon]]:text-success` |
| `error` | `border-l-danger [&_[data-icon]]:text-danger` |
| `warning` | `border-l-warning [&_[data-icon]]:text-warning` |
| `info` | `border-l-info [&_[data-icon]]:text-info` |

- `style={{ '--width': '360px', '--border-radius': '0px' } as React.CSSProperties}`.
- Íconos: los 5 de Lucide actuales con `strokeWidth={1.75}` (`DISENO.md` §7) y `className="size-4"`; el de `loading`
  conserva `animate-spin`.
- La barra de 2px va con `border-l-2` del tono (no con `shadow-[inset…]`, que pisaría la `shadow-overlay`).
  Contraste no textual de la barra contra `--popover` (= card en claro): success 4.57 · danger 5.78 (fill) · info 4.85
  · warning 3.32 → todas ≥ 3:1 (WCAG 1.4.11). En oscuro, todas ≥ 3.88 (`DISENO.md` §2.3).
- z-index: se deja el de sonner. **[Desvío]** de `z-60` (`DISENO.md` §2.6): el toaster tiene que verse sobre un
  dialog abierto y sonner ya lo resuelve sin un `z-[n]` arbitrario.
- Región viva: sonner monta su `<section aria-live="polite">` siempre; no se toca.

> Si al verificar en el navegador `unstyled` deja algo sin estilo (ancho, apilado, swipe), **no** se agrega
> `!important`: se completa la clase que falta en `classNames`.

#### 3.6.2 Regla de traducción `use-toast` → `sonner`

`import { toast } from 'sonner'` (sin hook). Los textos **no cambian** (título y descripción se copian tal cual).

| Antes | Después |
|---|---|
| `const { toast } = useToast();` | se borra la línea y el import de `useToast` |
| `toast({ title, description, variant: 'destructive' })` | `toast.error(title, { description, duration: Infinity })` |
| `toast({ title, description, variant: 'destructive', duration: N })` | `toast.error(title, { description, duration: N })` (se respeta la duración que ya tenía) |
| `toast({ title, description })` que confirma un éxito (creado, guardado, eliminado, actualizado, "Éxito") | `toast.success(title, { description })` |
| `toast({ title, description })` informativo neutro | `toast(title, { description })` |
| `toast({ title, description })` que avisa que falta algo para seguir | `toast.warning(title, { description })` |
| `toast({ title, description })` "sin cambios" | `toast.info(title, { description })` |

`duration: Infinity` en los errores = `DISENO.md` §4.13 y WCAG 2.2.2 (`better-accessibility`). En los otros 199
archivos que ya usan `sonner` se aplica al migrar cada módulo (ítem D9 de la auditoría), no en esta fase.
Cambio menor y aceptado: `use-toast` mostraba **un** toast a la vez (`TOAST_LIMIT = 1`); sonner apila hasta 3.
Ningún flujo depende de que el anterior desaparezca.

#### 3.6.3 Los 12 archivos, llamada por llamada

| # | Archivo | Llamadas (línea actual) → traducción |
|---|---|---|
| 1 | `src/app/layout.tsx` | l.1-2 imports `Toaster as Sonner` + `Toaster` radix y l.31-32 montajes → un solo `import { Toaster } from '@/components/ui/sonner'` y un solo `<Toaster />` (ver 3.2). |
| 2 | `src/features/Mantenimiento/TiposReparaciones/MaintenanceGroupsClient.tsx` | l.3 import y l.58 `<Toaster />` radix → **se borran** (montaje duplicado; este archivo no llama `toast`). |
| 3 | `src/features/Comercial/Comerce/components/DailyReportWrapper.tsx` | l.8 `import { toast } from '@/components/ui/use-toast'` → `from 'sonner'`. l.160 "Detalle del servicio" y l.164 "Historial del servicio" → `toast(title, { description })`. Las líneas 349-453 con `title:` son de filtros, **no** toasts: no se tocan. |
| 4 | `src/features/Empresa/Clientes/components/Services/contractDocuments.tsx` | l.16 import + l.50 hook → `import { toast } from 'sonner'` y se borra l.50. l.77 "¡Éxito!" → `toast.success`. l.82 "Error" → `toast.error` persistente. l.97 "Documento eliminado" → `toast.success`. l.101 "Error" → `toast.error` persistente. l.131 "Archivos seleccionados" → `toast`. l.152 "No hay archivos" → `toast.warning`. l.161 "Error" (`result.error`) → `toast.error` persistente. |
| 5 | `src/features/Empresa/Equipos/EquipmentModels/EquipmentModelForm.tsx` | l.8 import. l.114 "Error" → `toast.error` persistente. l.121 "Modelo actualizado"/"Modelo creado" → `toast.success`. l.131 "Error" → `toast.error` persistente. |
| 6 | `src/features/Empresa/Equipos/EquipmentOwners/EquipmentOwnerForm.tsx` | l.8 import. l.141 "Titular guardado correctamente" → `toast.success`. l.152 "Error" → `toast.error` persistente. l.188 "Titular actualizado correctamente" → `toast.success`. l.198 "Error" → `toast.error` persistente. |
| 7 | `src/features/Empresa/Equipos/EquipmentSubTypes/EquipmentSubTypeForm.tsx` | l.7 import. l.240 "Subtipo de equipo guardado correctamente" → `toast.success`. l.270 "Error" → `toast.error` persistente. l.347 "Error" → `toast.error` persistente. |
| 8 | `src/features/Empresa/Equipos/EquipmentTypes/EquipmentTypeForm.tsx` | l.8 import. l.204 "Tipo de equipo guardado correctamente" → `toast.success`. l.236 "Error" → `toast.error` persistente. l.320 "Error" → `toast.error` persistente. |
| 9 | `src/features/Operaciones/Certificacion/components/BulkCertificacionModal.tsx` | l.12 import. l.35 "Error" (sin selección) → `toast.error` persistente. l.49 "Éxito" (con el conteo real) → `toast.success`. l.65 "Error" → `toast.error` persistente. |
| 10 | `src/features/Operaciones/PartesDiarios/components/BulkStatusModal.tsx` | l.12 import. l.53 "Error" → `toast.error` persistente. l.70 "Éxito" → `toast.success`. l.83 "Error" → `toast.error` persistente. (Es código muerto según `inventario/README.md`; se migra igual para poder borrar `use-toast.ts`; su borrado queda para la Fase 9.) |
| 11 | `src/features/Operaciones/Preparte/components/PreparteBulkStatusModal.tsx` | l.13 import. l.81 "Error" → `toast.error` persistente. l.99 "Pedidos confirmados" → `toast.success`. l.104 "Sin cambios" → `toast.info`. l.111 "`N` pedido(s) no se pudieron confirmar" (`duration: 10000`) → `toast.error(title, { description, duration: 10000 })`. l.126 "Pedidos reprogramados" → `toast.success`. l.144 "Éxito" → `toast.success`. l.158 "Error" → `toast.error` persistente. |
| 12 | `src/features/UserPermissionsManager/components/ModulePermissions.tsx` | l.21 import + l.81 hook → `import { toast } from 'sonner'` y se borra l.81. l.133, l.149, l.170, l.192 "Error" → `toast.error` persistente. l.163 "Permisos limpiados" y l.185 "Todos los permisos eliminados" → `toast.success`. |

Después: `grep -rnE "use-toast|components/ui/toast['\"]|components/ui/toaster" src` = 0 → borrar
`src/components/ui/toast.tsx`, `toaster.tsx` y `use-toast.ts` (confirmar con LSP `findReferences` sobre `useToast`,
`toast` de `use-toast` y `Toaster` de `toaster`). `@radix-ui/react-toast` **no** se quita de `package.json` en esta fase
(cambio de dependencias = Fase 9 con aprobación). Ninguna de esas llamadas está en una server action ni dentro de un
`useEffect` (verificado): no hay riesgo de doble disparo en StrictMode.

### 3.7 Shell del dashboard

#### `src/app/dashboard/layout.tsx` — solo `DashboardLayoutShell`
`DashboardLayout` y `DashboardWithHydration` (Suspense + prefetch de tickets) **no se tocan**.

```tsx
function DashboardLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <SupportTicketsRealtimeProvider>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:bg-card focus:px-3 focus:py-2 focus:text-label focus:border focus:border-border-strong"
        >
          Saltar al contenido
        </a>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <DashboardHeader />
          <Suspense fallback={null}>
            <PasswordChangeAlertWrapper />
          </Suspense>
          <div id="main-content" tabIndex={-1} className="@container/page min-w-0 flex-1 outline-none">
            <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SupportTicketsRealtimeProvider>
  );
}
```

- Gutter 16px (< `md`) / 24px (≥ `md`) horizontal y vertical; `max-w` 1440px centrado (`DISENO.md` §5). Es viewport
  (`md:`) a propósito: el shell va por viewport (`prefer-container-queries`).
- `@container/page` en el contenedor de ancho completo: lo usa `PageHeader` para su banda a todo el ancho (ver 3.8).
  `container-type: inline-size` aplica contención de estilo y de tamaño inline, **no** de layout: no cambia el
  containing block de los `position: fixed` internos.
- `outline-none` en `#main-content` solo porque es destino programático del skip link (no es un control).
- Tablas muy anchas que necesiten `max-w-none`: no se agrega el mecanismo `data-page="wide"` todavía (no hay
  consumidor en esta fase; lo agrega la Fase 3 si una tabla lo necesita).
- `SidebarInset` sigue siendo el `<main>` (componente shadcn) y su `bg-background` ahora es el canvas.

#### `src/features/Layout/header/DashboardHeader.tsx`
- `<header>`: `bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height]
  ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12` →
  `sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95`.
  Sale el cambio de alto al colapsar (el alto tiene que ser constante para `scroll-padding-top`). `z-20` = escala de
  `DISENO.md` (por encima de los headers de tabla `z-10`).
- Div interno: `px-4` → `px-4 md:px-6` (alineado al borde del contenido y del `PageHeader`).
- `SidebarTrigger className="-ml-1"`, `Separator`, `ContextualHelp`, `ModeToggle`: sin cambios.
- Mobile: queda ☰ + breadcrumb (que en `< md` ya muestra solo el módulo) + ayuda + tema. **[Desvío]** de
  `DISENO.md` §5 ("avatar a la derecha"): el avatar vive en `NavUser` dentro del sidebar (sheet en mobile); sumarlo al
  header duplica el componente y su fetch del perfil. Se deja anotado para la Fase 7 si el usuario lo quiere.

#### `src/features/Layout/sidebar/components/DashboardBreadcrumb.tsx`
- `<Breadcrumb>` → `<Breadcrumb className="min-w-0">`; `<BreadcrumbList>` → `className="text-caption"`.
- `BreadcrumbPage` → `className="truncate font-medium"` (último nivel en 500). El link de marca conserva `lowercase`.

#### `src/features/Layout/sidebar/AppSidebar.tsx`
- `SidebarHeader className="bg-brand/5 border-b p-2"` → `className="border-b border-sidebar-border p-2"` (sin tinte;
  el sidebar es del mismo plano que el canvas, `--sidebar` = `--canvas`).
- `<Sidebar collapsible="icon" className="border-r">`: igual (el `border-r` ya separa del contenido).
- Skeletons de fallback: `rounded-md` ya resuelve a 0; sin cambios.

#### `src/features/Layout/sidebar/components/NavMain.tsx` (solo las constantes de clases y el label)
`MODULE_BUTTON` (reemplaza el actual):
```ts
const MODULE_BUTTON = cn(
  'relative transition-colors',
  'before:pointer-events-none before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-sidebar-primary before:opacity-0',
  'hover:bg-sidebar-accent/60',
  'data-[active=true]:before:opacity-100',
  'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
  'data-[active=true]:hover:bg-sidebar-accent',
  '[&>svg]:text-muted-foreground',
  'data-[active=true]:[&>svg]:text-primary-text'
);
```
`SUB_ITEM_BUTTON` (sin relleno sólido; la barra de 2px marca la hoja activa):
```ts
const SUB_ITEM_BUTTON = cn(
  'relative transition-colors',
  'before:pointer-events-none before:absolute before:inset-y-1 before:-left-px before:w-0.5 before:bg-sidebar-primary before:opacity-0',
  'hover:bg-sidebar-accent/60',
  'data-[active=true]:before:opacity-100',
  'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
  'data-[active=true]:hover:bg-sidebar-accent',
  '[&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-primary-text'
);
```
- El ítem de módulo **sin sub-items** (l.305-310) deja de sumar el relleno sólido: se borra el `cn(MODULE_BUTTON,
  'data-[active=true]:bg-brand …')` y queda `className={MODULE_BUTTON}`.
- `SidebarGroupLabel className="text-sidebar-foreground/50 text-[11px] font-semibold tracking-[0.12em] uppercase"` →
  `className="text-overline text-muted-foreground"`.
- `BADGE_CLASS`: `bg-destructive text-destructive-foreground pointer-events-none` → `bg-danger
  text-destructive-foreground pointer-events-none tabular-nums` (mismo color, token canónico).
- El texto "Sin acceso" (l.273-276): `text-sidebar-foreground/70` → `text-muted-foreground`; textos iguales.
- Hover sin color de marca (el verde queda para lo activo y el foco: "el color significa algo").
- Contraste del activo: `--sidebar-accent-foreground` sobre `--sidebar-accent` = 15.4:1 claro (DISENO); barra
  `--sidebar-primary` contra `--sidebar-accent` ≥ 3:1 (mismo verde que primary, 5.49 contra blanco).

#### `src/components/ui/sidebar.tsx` y `ToogleDarkButton.tsx`
- `sidebar.tsx`: `<span className="sr-only">Toggle Sidebar</span>` → "Mostrar u ocultar menú"; `aria-label="Toggle
  Sidebar"` del `SidebarRail` → `aria-label="Mostrar u ocultar menú"` (y su `title` si lo tiene). Nada más.
- `ToogleDarkButton.tsx`: en el `Sun`, quitar `text-neutral-950` y cambiar `transition-all` → `transition-transform` en
  los dos íconos. La escritura de la cookie `theme` durante el render **no se toca** (lógica; queda en §9).

### 3.8 `PageHeader` (nuevo)

**Dónde vive**: `src/shared/components/layout/PageHeader.tsx` (+ `PageHeaderSkeleton.tsx` en la misma carpeta). Es
**Server Component** (sin `'use client'`, sin hooks): puede usarse desde páginas server y desde client components.

**API**:
```ts
interface PageHeaderProps {
  title: React.ReactNode;          // h1
  overline?: React.ReactNode;      // módulo / contexto, en text-overline
  meta?: React.ReactNode;          // fila de datos: data-code, StatusBadge, "Actualizado …"
  description?: React.ReactNode;   // una línea de ayuda
  media?: React.ReactNode;         // foto 48×48 de fichas (empleado/equipo)
  actions?: React.ReactNode;       // en orden: secundarias…, primary ÚLTIMO, ⋯ al final
  tabs?: React.ReactNode;          // tabs de la página, pegadas al borde inferior
  className?: string;
}
```
No recibe `primaryAction`/`secondaryActions` separados: los consumidores ya arman sus botones (permisos incluidos) y
partirlos obligaría a tocar a cada uno. La regla "1 primary + 2 secundarias, el resto en ⋯" es del consumidor y la
verifica la auditoría (A11).

**Marcado**:
```tsx
<header
  data-slot="page-header"
  className={cn(
    '@container/ph -mt-4 w-[100cqw] ml-[calc(50%-50cqw)] border-b border-border-strong bg-card md:-mt-6',
    className
  )}
>
  <div className="mx-auto flex max-w-(--page-max) flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-4 md:px-6">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {media ?? null}
      <div className="min-w-0 space-y-1">
        {overline ? <p className="text-overline text-muted-foreground">{overline}</p> : null}
        <h1 className="text-page-title text-balance max-@xl/ph:text-[1.125rem]">{title}</h1>
        {meta ? <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">{meta}</div> : null}
        {description ? <p className="max-w-prose text-body text-pretty text-muted-foreground">{description}</p> : null}
      </div>
    </div>
    {actions ? (
      <div className="flex w-full flex-wrap items-center gap-2 @xl/ph:w-auto [&>[data-slot=button][data-variant=primary]]:w-full @xl/ph:[&>[data-slot=button][data-variant=primary]]:w-auto">
        {actions}
      </div>
    ) : null}
  </div>
  {tabs ? <div className="mx-auto max-w-(--page-max) px-4 md:px-6">{tabs}</div> : null}
</header>
```

- **Banda a todo el ancho**: el `PageHeader` vive dentro del contenedor con `max-w` y gutter; la banda `bg-card` se
  extiende al ancho del `@container/page` con `w-[100cqw] ml-[calc(50%-50cqw)]` (técnica full-bleed con unidades de
  container query) y `-mt-4 md:-mt-6` la pega al header de la app. Su contenido interno vuelve a centrarse con
  `max-w-(--page-max)` y el mismo gutter, así que el `h1` queda alineado con el breadcrumb y con el contenido.
  **Condición**: el `PageHeader` tiene que ser el primer elemento de la página y no estar dentro de otro
  `@container` ni de un ancestro con `overflow-hidden` (verificado: los 9 `*Component.tsx` que usan
  `SectionManagerServer` lo envuelven en un `<div>` sin clases o con `className=""`).
- Ritmo: el padre (`flex-col gap-6`) da los 24px entre `PageHeader` y contenido; adentro, `space-y-1` (4px) y
  `gap-y-3` (12px): cumple "entre grupos ≥ 2× el gap interno".
- Mobile (`< @xl/ph` = 576px de ancho del header): título 18px, acciones en una fila propia a ancho completo y el
  primary a ancho completo (`data-variant=primary` canónico del Button, ver 3.4.1). Orden DOM = orden visual
  (título → acciones), sin `order` ni `flex-row-reverse`.
- No es sticky (ni en desktop ni en mobile, `DISENO.md` §4.4).
- Slots opcionales con ternario a `null` (`rendering-conditional-render`).
- `PageHeaderSkeleton`: misma banda (`w-[100cqw] ml-[calc(50%-50cqw)] -mt-4 md:-mt-6 border-b border-border-strong
  bg-card`) con `Skeleton` de 11px (`h-3 w-20`), 20px (`h-5 w-56`) y 12px (`h-3 w-40`), `space-y-1.5`.

**Dónde se usa en esta fase**: solo en `src/features/TabsManager/SectionManagerServer.tsx` (el `<h1>` común de los 9
módulos + Empleados + Selección):

```tsx
return (
  <div className="flex h-full flex-col gap-6">
    {!activeTab.hideTitle ? (
      <PageHeader title={activeTab.label} actions={actions ?? undefined} />
    ) : actions ? (
      <div className="flex items-center justify-end gap-2">{actions}</div>
    ) : null}
    {activeTab.content}
  </div>
);
```

- Mismo comportamiento que hoy: con `hideTitle` (hoy solo `AyudaComponent.tsx:44`) no hay título; si además hay
  `actions` se muestran alineadas a la derecha como antes. Sin overline en esta fase (`SectionManagerServer` no
  conoce el nombre del módulo; se agrega por prop cuando cada módulo se migre en la Fase 6).
- El caso "Sin acceso" del mismo archivo: `text-muted-foreground` ya es token; sin cambios.
- Las páginas que no usan `SectionManagerServer` (fichas de empleado/equipo, detalle de documento, etc.) adoptan
  `PageHeader` en su fase de módulo.

### 3.9 Login y recupero de contraseña

#### `src/features/Auth/components/AuthShell.tsx` (nuevo, Server Component)

```tsx
interface AuthShellProps { children: React.ReactNode }

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="relative hidden flex-col justify-between bg-foreground p-10 text-background shadow-[inset_0_2px_0_var(--primary)] lg:flex dark:bg-card dark:text-foreground">
        <Link href="/" className="text-section lowercase">{BRAND_NAME}</Link>
        <p className="max-w-sm text-page-title text-balance">
          Gestión operativa de personal, equipos y documentación
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-caption tabular-nums opacity-80">
          <dt>Versión</dt><dd>{APP_VERSION}</dd>
        </dl>
      </aside>
      <div className="flex min-w-0 flex-col px-4 py-10 sm:px-10 lg:px-24 lg:py-24">
        <Link href="/" className="mb-10 text-section lowercase text-primary-text lg:hidden">{BRAND_NAME}</Link>
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </main>
  );
}
```

- Proporción 40/60 (`2fr`/`3fr`), barra de acento de 2px arriba del panel (firma, `DISENO.md` §1 principio 6).
  Panel `bg-foreground text-background` en claro, `bg-card text-foreground` en oscuro: tokens, sin cookie de tema
  (sale el `RenderBanner` que leía la cookie `theme` en el server y el `RefreshComponent` que lo parchaba).
- `APP_VERSION`: `import pkg from '../../../../package.json'` resuelto en el server (`pkg.version`, hoy `0.1.1`);
  el componente es server, el JSON no viaja al cliente. **[Desvío]** de `DISENO.md` §6: la "firma técnica" lleva solo
  la versión. "Empresa" no existe antes del login y "estado del sistema con punto success" no tiene fuente real:
  mostrarlo sería un dato inventado (`frontend-design`: nada de datos falsos). Se agrega cuando exista un health
  check.
- Copy nuevo **solo** en el panel ("Gestión operativa de personal, equipos y documentación", de `DISENO.md` §6):
  reemplaza la cita heredada de GH. Ningún texto de formulario cambia.
- Form alineado arriba a la izquierda, 360px, padding 96px en `lg` (`DISENO.md` §6). Mobile: solo el form con el
  wordmark arriba; `px-4` (no pegado al borde).
- **[Desvío]** menor: título del form en `text-display` (32px) y no 28px: `text-[1.75rem]` junto a `text-display`
  haría que twMerge descarte la clase de rol (con su peso y tracking). 32px entra en el form de 360px.

#### `src/app/login/page.tsx`
```tsx
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <LoginForm error={error} />
    </AuthShell>
  );
}
```
Sale el wrapper `bg-muted … max-w-sm` y el link de marca (lo pone `AuthShell`). Se actualiza el comentario JSDoc.

#### `src/features/Auth/components/LoginForm.tsx`
- Sin `Card`/`CardHeader`/`CardContent` (DISENO: la card centrada es patrón GH). Estructura:
  `<div className="flex flex-col gap-8">` → `<div className="space-y-2">` con
  `<h1 className="text-display text-balance">¡Es un placer verte de nuevo!</h1>` y
  `<p className="text-body text-muted-foreground">Ingresá con tu correo y contraseña</p>` → aviso oauth → `<form>`.
- Aviso `?error=oauth`: `rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive` →
  `role="alert" className="flex gap-2.5 border border-danger-border bg-danger-soft px-3 py-2.5 text-caption
  text-danger-text"` + ícono `CircleAlert` `size-4 shrink-0 strokeWidth={1.75} aria-hidden`. Texto igual.
- Separador "O continuá con": `bg-card` del `<span>` → `bg-background` (el form ya no está sobre una card; `--background`
  = canvas). Texto igual. Se mantiene solo si `isGoogleLoginEnabled`.
- `Input`: `className="h-10"` en los dos (DISENO §6 "campos h-10"); ids, names, types, placeholders, `autoComplete`
  y `data-testid` **iguales**.
- Labels: sin cambios de texto. Link "¿Olvidaste tu contraseña?": `ml-auto text-sm underline-offset-4 hover:underline`
  → `ml-auto text-caption text-primary-text underline-offset-4 hover:underline`.
- `<p id="email_error" className="text-sm" />` → `<p id="email_error" aria-live="polite" className="min-h-4 text-caption
  text-danger-text" />` (igual `password_error`). **Los ids no cambian** (los escribe `LoginButton` por `getElementById`).
- Pie: `text-muted-foreground text-center text-xs text-balance` → `text-caption text-muted-foreground text-pretty`
  (alineado a la izquierda como el resto del form). Texto igual.

#### `src/features/Auth/components/LoginButton.tsx`
- Se borra **solo** la línea `element.style.color = 'red';` (l.32): el color lo da la clase `text-danger-text` del `<p>`.
  La validación, los `getElementById`, el `toast.promise` y los textos quedan idénticos.
- `<Button className="w-full" …>` → `<Button size="lg" className="w-full" …>` (h-10, DISENO §6). `formAction`,
  `disabled={pending}`, `data-testid` iguales.
- `GoogleButton.tsx`: sin cambios (variant `outline` → `secondary` por alias; `w-full`).

#### `src/app/reset_password/page.tsx`, `update-user/page.tsx`, `confirm/page.tsx`
Estructura común (sin `section`/`container`/`RenderBanner`/link de marca propio):
```tsx
<AuthShell>
  <div className="space-y-2">
    <h1 className="text-display text-balance">…título actual, mismo texto…</h1>
    {/* update-user: <p className="text-body text-pretty text-muted-foreground">…descripción actual…</p> */}
  </div>
  <div className="mt-8">…form o callouts…</div>
</AuthShell>
```
- `CardTitle`/`CardDescription` (que son `<div>`) → `h1`/`p`. Textos idénticos (incluida la descripción de
  update-user con "6 caracteres", que es una rareza registrada y no se corrige acá).
- `confirm/page.tsx`: la lectura síncrona de `searchParams` **no se toca** (rareza registrada). Sus dos cajas pasan a
  callouts con tokens: rojo → `border border-danger-border bg-danger-soft px-3 py-2.5` con título `text-label
  text-danger-text` y texto `text-caption text-foreground/80`; azul → mismo patrón con `info`. El link "Solicitar
  nuevo enlace" (`bg-blue-600 … rounded`) → `className={buttonVariants({ variant: 'primary', className: 'mt-4' })}`.
  Se quita `text-center` (todo alineado a la izquierda). Textos iguales.

#### `src/features/Auth/components/RecoveryPasswordForm.tsx` (solo clases)
- Caja de éxito (l.49-63): `text-center p-6 bg-green-50 border border-green-200 rounded-lg` → `role="status"
  className="space-y-2 border border-success-border bg-success-soft px-3 py-2.5"`; "✓ Solicitud enviada
  exitosamente" (`text-green-600 font-medium text-lg mb-2`) → `text-label text-success-text`; párrafo `text-green-700
  mb-4` → `text-caption text-foreground/80`; "¿No recibiste el email?" `text-gray-600 text-sm` → `text-caption
  text-muted-foreground`; botón "Reenviar" `text-blue-600 hover:text-blue-800 font-medium` → `font-medium
  text-primary-text hover:underline underline-offset-4`. **[Desvío]** menor: `DISENO.md` §6 sugiere callout `info`;
  se usa `success` porque el texto existente dice "enviada exitosamente" y lleva "✓".
- `FormLabel className="text-lg"`, `Input className="text-lg"`, `FormDescription className="text-lg"` → se quita
  `text-lg` (defaults del form) y el `Input` lleva `className="h-10"`.
- Botón submit: `<Button type="submit" … className="w-full">` → agrega `size="lg"`. Texto, spinner y disabled iguales.
- Link "¿Recordaste tu contraseña? Iniciar sesión": contenedor `text-center text-sm text-gray-600` → `text-caption
  text-muted-foreground`; `<a>` `text-blue-600 hover:text-blue-800 font-medium` → `font-medium text-primary-text
  underline-offset-4 hover:underline`. Sigue siendo `<a href="/login">` (no se cambia a `Link`: no es parte del pedido).

#### `src/features/Auth/components/UpdateUserPasswordForm.tsx` (solo clases)
- Caja "Enlace inválido o expirado" (l.69-74): mismo callout `danger` que confirm; el `<a href="/reset_password">`
  con `bg-blue-600 text-white rounded…` → `className={buttonVariants({ variant: 'primary', className: 'mt-4' })}`.
- `text-lg` fuera de los 2 `FormLabel`, 2 `Input` y 2 `FormDescription`; `Input` con `h-10`. Toggle de ojo, estados,
  `aria-label` dinámico y textos iguales. Submit con `size="lg"`.

#### Se borran
`RenderBanner.tsx`, `AutenticationLight.tsx`, `AutenticationDark.tsx`, `RefreshComponent.tsx` (confirmar con LSP
`findReferences` que sus únicos importadores son las 3 páginas de `reset_password`, ya migradas).

#### Loadings de auth
`src/features/Auth/fallback/AuthFormSkeleton.tsx` (nuevo, server): `h1` simulado (`Skeleton h-8 w-72`), descripción
(`h-4 w-56`), y `fields` filas de label (`h-3 w-16`) + input (`h-10 w-full`), más el botón (`h-10 w-full`), con la
misma separación que el form (`gap-8` / `space-y-2`), dentro de `role="status"` + `<span className="sr-only">Cargando…</span>`.

| Archivo | Nuevo contenido |
|---|---|
| `src/app/login/loading.tsx` | `<AuthShell><AuthFormSkeleton fields={2} /></AuthShell>` |
| `src/app/reset_password/loading.tsx` | `<AuthShell><AuthFormSkeleton fields={1} /></AuthShell>` |
| `src/app/reset_password/update-user/loading.tsx` | `<AuthShell><AuthFormSkeleton fields={2} /></AuthShell>` |
| `src/app/reset_password/confirm/loading.tsx` | `<AuthShell><AuthFormSkeleton fields={0} /></AuthShell>` |

Resuelve la rareza "el skeleton de `/login` imita el layout partido viejo": ahora el layout real también es partido.

### 3.10 404 y errores

#### `src/shared/components/layout/StatusScreen.tsx` (nuevo, sin hooks ni directiva)
```tsx
interface StatusScreenProps {
  code: string;                    // overline mono: "ERROR 404", "ERROR 500"
  title: React.ReactNode;          // h1
  description: React.ReactNode;
  children?: React.ReactNode;      // bloques extra (detalle, callouts)
  actions: React.ReactNode;        // botones; primary primero
  as?: 'main' | 'section';         // 'main' fuera del shell, 'section' dentro del dashboard
  className?: string;
}
```
Marcado: `<Comp className={cn('mx-auto w-full max-w-xl space-y-6 px-4', className)}>` →
`<p className="font-mono text-overline text-muted-foreground">{code}</p>` +
`<h1 className="text-display text-balance">` + `<p className="text-body text-pretty text-muted-foreground">` +
`{children}` + `<div className="flex flex-wrap gap-2">{actions}</div>`. Alineado a la izquierda, sin ilustración.

#### `src/app/not-found.tsx` (server)
`<StatusScreen as="main" code="ERROR 404" className="min-h-dvh pt-[20vh]" title="¡Ups! Página no encontrada"
description="Lo sentimos, parece que la página que estás buscando no existe o ha sido movida."
actions={<Button asChild><Link href="/dashboard">Volver al Dashboard</Link></Button>} />`.
Salen blobs, blur, glass, degradé, `hover:scale-105`, `min-h-screen`. El "404" grande pasa al overline mono
"ERROR 404". Funciona en claro y oscuro (tokens; antes no tenía oscuro). Textos y destino iguales.

#### `src/app/error.tsx` (client) y `src/app/dashboard/error.tsx` (client)
Lógica **idéntica** (los `useEffect` de logger/PostHog, `setErrorDetails`, `copyErrorToClipboard`,
`sendErrorByEmail`, toasts, `reset`, `window.location.href = '/dashboard'`). Cambia solo el JSX:

```
<StatusScreen
  as={app ? 'main' : 'section'}
  className={app ? 'min-h-dvh pt-[20vh]' : 'pt-12'}
  code="ERROR 500"
  title={app ? 'Algo salió mal' : 'Error en el Dashboard'}
  description={…texto actual de cada uno…}
  actions={<>
    <Button onClick={() => (window.location.href = '/dashboard')}>[Home] Volver al inicio</Button>   ← primary
    <Button variant="secondary" onClick={reset}>[RefreshCw] Intentar nuevamente</Button>
  </>}
>
  1. Callout de detalle: border border-danger-border bg-danger-soft px-3 py-2.5
     - "Detalles del error:" / "Mensaje de error:" en text-label text-danger-text
     - {error.message} en text-caption text-foreground/80 break-words
     - si hay digest: "ID de error:" / "ID de referencia:" + <code className="data-code">{digest}</code>
  2. "Información técnica completa:" (text-label) + <pre className="max-h-48 overflow-auto border border-border
     bg-panel-2 p-3 font-mono text-caption text-muted-foreground whitespace-pre-wrap break-words">
  3. Fila de herramientas: <Button variant="secondary" size="sm"> Copiar error · Reportar al equipo (spinner igual)
  4. Solo dashboard: callout info "¿Qué puedes hacer?" (border-info-border bg-info-soft; título text-label
     text-info-text; lista text-caption text-foreground/80 list-disc ps-4) con las 3 viñetas actuales.
</StatusScreen>
```

- `app/error.tsx` se renderiza dentro del root layout (sin shell): `as="main"`, alto completo con `dvh`.
  `dashboard/error.tsx` se renderiza dentro del `<main>` de `SidebarInset`: `as="section"`, sin alto completo (el
  shell sigue vivo).
- Orden de botones según `DISENO.md` §6: "Volver al inicio" primary, "Intentar nuevamente" secondary. Íconos Lucide
  `strokeWidth={1.75}` con `aria-hidden`. Sale el naranja (`bg-orange-600`) y todo `gray/blue/orange`.
- Los textos de los botones y bloques son los actuales (inventario); el overline "ERROR 500" es el único texto nuevo.

#### `src/app/global-error.tsx` (client, reemplaza el root layout)
```tsx
'use client';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/shared/components/layout/StatusScreen';
import posthog from 'posthog-js';
import { useEffect } from 'react';
import { fontVariables } from './fonts';
import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { /* captureException igual que hoy */ }, [error]);
  return (
    <html lang="es" className={fontVariables}>
      <body>
        <StatusScreen as="main" className="min-h-dvh pt-[20vh]" code={error.digest ? `ERROR 500 · ref ${error.digest}` : 'ERROR 500'}
          title="Algo salió mal"
          description="Lo sentimos, ha ocurrido un error inesperado. Nuestro equipo ha sido notificado y estamos trabajando para solucionarlo."
          actions={<>
            <Button asChild><a href="/dashboard">Volver al inicio</a></Button>
            <Button variant="secondary" onClick={reset}>Intentar nuevamente</Button>
          </>}
        />
      </body>
    </html>
  );
}
```
- Importa `globals.css` y las fuentes de `./fonts` porque el root layout no está (los tokens y Plex siguen andando).
  Sin `ThemeProvider` → siempre tema claro (aceptado; es la pantalla de último recurso).
- `<a href>` y no `Link`: sin el árbol del router conviene una navegación completa.
- Sale `NextError`. **Decisión tomada con `DISENO.md` §6** ("global-error repite lo mismo"): se agregan "Volver al
  inicio" y "Intentar nuevamente" y se reutilizan los textos de `app/error.tsx`. Es UI de una pantalla que hoy no
  tiene ninguna acción; no altera ningún flujo de negocio. Queda listado en "Decisiones" por si el usuario prefiere
  conservar la pantalla genérica.

### 3.11 `src/app/dashboard/loading.tsx`
```tsx
<div role="status" className="flex flex-col gap-6">
  <span className="sr-only">Cargando…</span>
  <PageHeaderSkeleton />
  <div className="border border-border bg-card">
    <div className="flex h-12 items-center gap-2 border-b border-border px-3">
      <Skeleton className="h-8 w-64" /> <Skeleton className="ml-auto h-8 w-24" />
    </div>
    <div className="h-8 bg-muted" />
    {ROWS.map((r) => <div key={r} className="flex h-9 items-center gap-4 border-b border-border px-3">
      <Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-20" />
    </div>)}
  </div>
</div>
```
`ROWS` = constante de módulo `[0..9]` (10 filas, `rendering-hoist-jsx`). Es el loading de **todo** `/dashboard/**`
sin loading propio, así que reproduce la página más común (encabezado + panel de tabla con header de 32px y filas de
36px, `DISENO.md` §4.12), no la forma del Dashboard principal. Deja de importar `KpiCardsSkeleton` y
`SectionSkeleton` (siguen existiendo; los usa el Dashboard principal en `PrincipalSkeleton`/`PrincipalTabContent`).

### 3.12 Celular (375px) y tablet (768px), resumen
- Shell: sidebar como sheet (comportamiento shadcn actual), header `h-14` con ☰ + módulo + ayuda + tema, gutter 16px.
- `PageHeader`: título 18px, acciones en fila propia, primary a ancho completo.
- Login/recupero: una columna, wordmark arriba, form a ancho completo con `px-4`, inputs y botón de 40px (44px con
  `pointer: coarse` por el `min-h-11` del Button; los inputs `h-10` quedan en 40px — ver riesgos), texto de input 16px
  (`text-base md:text-sm` ya está en `input.tsx`: sin zoom de iOS).
- 404/errores: una columna, `max-w-xl`, botones que envuelven (`flex-wrap`), `<pre>` con scroll propio y `break-words`.
- Toasts: arriba al centro, a 64px del borde superior, ancho completo menos 16px por lado.
- Tablet 768: sidebar fijo aparece (`md`), gutter 24px, `PageHeader` con acciones a la derecha si el header mide
  ≥ 576px.

---

## 4. Reorganización del código

### 4.1 Componentes a partir / crear
- `AuthShell` (server) reemplaza 4 archivos (`RenderBanner` server + `AutenticationLight` + `AutenticationDark` +
  `RefreshComponent` client): se elimina una lectura de `cookies()` por request en 3 rutas y un `router.refresh()` por
  montaje (`server-serialization`, `rerender-move-effect-to-event`: el refresh era un efecto para corregir un estado
  que ahora se resuelve con CSS).
- `StatusScreen` (sin directiva) unifica 404, error de app, error del dashboard y global-error: 4 layouts duplicados
  → 1 (`rerender-no-inline-components`: los bloques internos son JSX, no componentes definidos adentro).
- `PageHeader` / `PageHeaderSkeleton` (server). `AuthFormSkeleton` (server).
- `src/app/fonts.ts`: instancias de fuentes a nivel de módulo compartidas por `layout.tsx` y `global-error.tsx`
  (`server-hoist-static-io`).

### 4.2 Duplicados a unificar
- 3 toasters montados (radix en `layout.tsx`, sonner en `layout.tsx`, radix en `MaintenanceGroupsClient.tsx`) → 1.
  2 APIs de toast → 1 (`sonner`). Se borran `toast.tsx`, `toaster.tsx`, `use-toast.ts`.
- Dos fondos de `body` (`globals.css:143` y `layout.tsx:28`) → 1 (`bg-canvas` en la base).
- Mapas de variantes de Button/Badge/Card: 11 estilos de botón → 6, 11 de badge → 7 (+ alias). Se preparan los tonos
  que `StatusBadge` va a consumir en la Fase 2 (no se crea `StatusBadge` acá).
- `cn` pasa a conocer la escala tipográfica (evita que cada consumidor pelee con twMerge).

### 4.3 Límite server/client y serialización (`server-serialization`, `server-dedup-props`)
- `PageHeader`, `StatusScreen`, `AuthShell`, `AuthFormSkeleton`, `PageHeaderSkeleton`: **server / sin directiva**. No
  agregan ningún componente cliente nuevo.
- `SectionManagerServer` sigue server; `PageHeader` recibe `title` (string) y `actions` (ReactNode ya armado): no se
  serializa ningún objeto nuevo.
- `sonner.tsx` sigue siendo la única isla cliente nueva de comportamiento (ya lo era).
- `package.json` en `AuthShell`: lectura en el server, no viaja al cliente (solo el string de la versión en el HTML).
- `global-error.tsx` importa `globals.css` y `fonts.ts`: no suma JS (CSS y CSS variables).

### 4.4 Fetching (`async-parallel`, `async-suspense-boundaries`)
- Sin cambios de fetching. El shell conserva su Suspense con prefetch de tickets y los Suspense de `CompanySwitcher`,
  `NavMain`, `NavUser`, `DashboardBreadcrumb` y `ContextualHelp` (requeridos por `cacheComponents: true`).
- Se **quita** una lectura dinámica: `RenderBanner` hacía `await cookies()` en `/reset_password/*`. Las 3 páginas de
  recupero quedan sin datos dinámicos propios (salvo `searchParams` donde ya estaba).
- `login/page.tsx` sigue esperando `searchParams` (ya estaba; requerido para `?error=oauth`).

### 4.5 Bundle (`bundle-barrel-imports`, `bundle-defer-third-party`)
- Se elimina del bundle cliente `@radix-ui/react-toast` (toaster radix + `use-toast`) y `RefreshComponent`.
- `extendTailwindMerge` reemplaza a `twMerge` sin costo extra (misma librería).
- `AuthShell` importa `Link` y `BRAND_NAME` (ya en el bundle). Íconos Lucide por nombre (Next optimiza
  `lucide-react`).
- **Pendiente fuera de alcance** (no se toca, va a §9 del PLAN):
  - `src/lib/utils.ts:6-7` — el módulo de `cn` re-exporta server actions (`getActualRole`, `uploadDocument`,
    `getAllDocumentsByIdDocumentTypeCientSide`): cualquier componente cliente que importa `cn` arrastra esos módulos
    como referencias de server action. Regla `bundle-barrel-imports`. Fix sugerido: mover esos re-exports a su
    feature y que `utils.ts` solo exporte utilidades puras. Afecta a cientos de importadores → tarea propia.
  - `src/shared/providers/PostHogProvider.tsx` — `posthog-js` entra en el bundle inicial del root layout. Regla
    `bundle-defer-third-party`. Fix sugerido: inicializar con `import('posthog-js')` diferido en el efecto.

### 4.6 Re-renders e hidratación
- `sonner.tsx`: `useSyncExternalStore` con `subscribe`/`getSnapshot`/`getServerSnapshot` a nivel de módulo (callbacks
  estables, `rerender-dependencies`); sin `useEffect` + `useState` (`rerender-derived-state-no-effect`, regla del
  repo `no-useeffect.md`). Un solo listener de `matchMedia` (`client-event-listeners`).
- Tema: `next-themes` ya inyecta su script antes de hidratar; `suppressHydrationWarning` sigue solo en `<html>`
  (`rendering-hydration-suppress-warning`). `resolvedTheme` en el toaster es `undefined` en SSR → se usa `'light'` y,
  como el toaster arranca vacío, no hay flash (`rendering-hydration-no-flicker`).
- Fuentes por `next/font` con variables CSS en `<html>`: el `className` es determinístico (sin mismatch).
- `dashboard/loading.tsx`: filas desde una constante de módulo (`rendering-hoist-jsx`).
- `error.tsx` / `dashboard/error.tsx`: el `useEffect` + `setErrorDetails` se **conserva**. Regla
  `rerender-derived-state-no-effect` revisada: el detalle depende de `window.location`, `navigator.userAgent` y
  `new Date()`; calcularlo en render produciría contenido distinto entre el render de error en el server (si lo hay)
  y el cliente. Moverlo al handler de "Copiar" dejaría el `<pre>` vacío. Se deja como está y se justifica en la
  auditoría (N/A con motivo).
- `NavMain`: solo cambian constantes de clases (siguen siendo constantes de módulo).

### 4.7 Orden de implementación (cada paso cierra con `npm run check-types` y una mirada en el navegador)

1. **Fuentes y raíz**: crear `src/app/fonts.ts`; `layout.tsx` (fuentes, `viewport`, `body` sin clases, sin `<main>`;
   los dos `<Toaster>` todavía quedan hasta el paso 6). `cn` con `extendTailwindMerge`.
2. **Tokens**: reescribir `globals.css` (3.1). Verificar en el navegador que el canvas, las cards, los dropdowns y el
   sidebar se ven en claro y oscuro, y que `grep -c "sitepoint" src/app/globals.css` = 0.
3. **Primitivos**: `button.tsx`, `badge.tsx`, `card.tsx`, altura de `input.tsx`/`select.tsx`. `check-types` tiene que
   pasar **sin tocar ningún consumidor** (si falla, el alias está mal, no el consumidor).
4. **Header de tabla**: las 3 líneas de 3.5.
5. **Shell**: `dashboard/layout.tsx` (skip link + contenedor), `DashboardHeader`, `DashboardBreadcrumb`, `AppSidebar`,
   `NavMain`, `sidebar.tsx` (textos), `ToogleDarkButton`. Después `PageHeader` + `PageHeaderSkeleton` y su conexión en
   `SectionManagerServer`. Después `dashboard/loading.tsx`.
6. **Toasts**: reescribir `sonner.tsx`; migrar los archivos 3 a 12 de 3.6.3; sacar el `<Toaster>` radix de
   `layout.tsx` y de `MaintenanceGroupsClient.tsx`; grep = 0; borrar `toast.tsx`, `toaster.tsx`, `use-toast.ts`.
7. **Auth**: `AuthShell`, `AuthFormSkeleton`; `login/page.tsx`, `LoginForm`, `LoginButton`; las 3 páginas de
   `reset_password`; `RecoveryPasswordForm`, `UpdateUserPasswordForm`; los 4 `loading.tsx`; borrar `RenderBanner`,
   `AutenticationLight`, `AutenticationDark`, `RefreshComponent`.
8. **Errores**: `StatusScreen`; `not-found.tsx`, `error.tsx`, `dashboard/error.tsx`, `global-error.tsx`.
9. **Verificación completa** (sección 8): check-types, test, manual:check, conteo, recorrido 1440/768/375 claro/oscuro.

---

## 5. Qué NO se toca

- **Ningún consumidor** de Button, Badge ni Card (los alias cubren los 13/14 nombres). Tampoco `alert-dialog`,
  `calendar`, `pagination`, `carousel`, `multi-select`, `action-button` (usan los tipos de Button tal cual).
- **Textos**: ningún texto de formulario, toast, botón ni error cambia. Únicos textos nuevos: la línea de propósito y la
  versión en el panel del login (reemplazan la cita de GH), el overline "ERROR 404"/"ERROR 500", "Saltar al
  contenido", "Cargando…" (sr-only) y el `aria-label` en español del sidebar. Se conservan las rarezas de copy
  registradas: "Iniciar Sesion"/"Iniciando Sesion..." sin tilde, "6 caracteres" en update-user, "Volver al Dashboard".
- **Lógica**: `LoginButton` (validación por `getElementById`, ids `email_error`/`password_error`, `toast.promise`,
  mensajes de `banned`), `login-actions`, `resetPasswordAction`, `updatePasswordAction`, `sendErrorReport`, los
  `useEffect` de logger/PostHog, `reset()`, `window.location.href = '/dashboard'`, la lectura síncrona de
  `searchParams` en `confirm/page.tsx` (bug registrado), la cookie `theme` que escribe `ModeToggle`.
- **`data-testid`**: `login-email-input`, `login-password-input`, `login-submit-button` y todos los de las tablas.
- **Navegación**: `?tab=`, `navigationLinks`, permisos de `NavMain`/`SectionManagerServer`, badges de tickets.
- **Shell**: `DashboardLayout`/`DashboardWithHydration` (prefetch y Suspense), `SidebarProvider` (estado, cookie,
  Ctrl+B), `CompanySwitcher`, `NavUser`, `ContextualHelp`, `PasswordChangeAlertWrapper`.
- **Tablas**: solo el color del `<th>`. Paginación, toolbar, filtros, export, densidad: Fase 3/5.
- **Primitivos de Fase 2**: `Dialog`, `Sheet`, `Popover`, `Tabs`, `Tooltip`, `Alert`, `Calendar`, `Skeleton`, resto de
  `Input`/`Select` (solo cambia la altura). La escala de `shadow-*` de Tailwind.
- **Dependencias**: `package.json` no cambia (Plex sale de `next/font/google`; `@radix-ui/react-toast` se queda hasta
  la Fase 9).
- Tentaciones identificadas y descartadas: corregir "6 caracteres" de update-user, arreglar `confirm/page.tsx`, pasar
  los `<a href>` de auth a `Link`, sacar la cookie `theme` de `ModeToggle`, agregar `robots: noindex` o un title
  template a `metadata`, mover el detalle del error fuera del `useEffect`, unificar `KpiCardsSkeleton`. Todo queda en
  §9 o en su fase.

---

## 6. Riesgos

| Riesgo | Dónde | Cómo se cubre |
|---|---|---|
| `twMerge` borra las clases de rol (`text-overline`, `text-section`…) al combinarlas con un color | `cn` en toda la app | Paso 1: `extendTailwindMerge` con el grupo `font-size`. Verificación puntual de 3.3 antes de seguir. |
| `rounded-xl` (36) y `rounded-2xl` (5) pasan de 4/8px a 0 | Toda la app | Es lo buscado (`DISENO.md` §1.3). `rounded-full` (211) no cambia: algunos no son avatar/punto/switch → se corrigen en su módulo. |
| `--radius-*` con `calc` negativo | `globals.css` | Se reemplazan por 0 literales (no `calc`). |
| `font-medium` (906 usos) hoy se ve en 400 porque Poppins no cargaba 500; con Plex 500 se ve más pesado | Toda la app | Esperado y correcto. Se revisa en el recorrido que nada quede "todo en negrita"; si una pantalla abusa de `font-medium`, se anota para su módulo. |
| `font-bold` (175) sin peso 700 | Toda la app | Se renderiza en 600 real (regla de matcheo de CSS), sin síntesis porque 600 está cargado. Verificar en una celda `font-bold` que no se vea "falso negrita". |
| Ancho de texto distinto (Plex es más angosta que Poppins) | Botones de ancho fijo, truncados | Recorrido de 5 módulos; nada debería desbordar (los textos se achican). |
| Hidratación / CLS de fuentes | `<html>` | `next/font` con `display: swap` + `adjustFontFallback` (default) + preload. Medir CLS en el login con DevTools (≤ 0.1). |
| Button `default` 36→32px, `sm` 32→28px, `icon` 36→32px | Toolbars, filas, headers | Input/Select bajan a 32/28 en el mismo paso (3.4.4). Los inputs con `h-9`/`h-10` explícito quedan más altos que el botón vecino: se anotan en el recorrido para su módulo. |
| `pointer-coarse:min-h-11` en todo Button | Mobile/tablet táctil | Es la regla (`DISENO.md` §2.6). Los `size="xs"`/`icon-xs` dentro de chips o celdas crecen a 44px en touch: revisar las 3 pantallas con `xs` a 375px; si rompen, anotarlo para su módulo (no quitar la regla). |
| Alias de variantes con significados distintos | `primary` era azul, `secondary` violeta, `success` esmeralda | Mapeo explícito de 3.4.1. Varias "primary" por vista (alias `default`+`brand`) hasta migrar cada módulo: aceptado en Fase 1. |
| `destructive` → relleno `danger` en filas/menús donde debería ser `danger-ghost` | 23 usos | Visualmente equivalente al estado actual; la elección por contexto es de cada módulo. |
| Contraste: `--input` más oscuro hace visibles todos los bordes de control; `--muted-foreground` más oscuro | Toda la app | Es la corrección de `DISENO.md` (≥3:1 en controles, ≥4.5:1 en texto). Medir 3 pares nuevos no listados en DISENO: texto de toast sobre popover, `text-danger-text` del login sobre canvas, badge `outline` (`border-border-strong` es decorativo). |
| `text-danger-text` sobre `--canvas` (errores del login fuera de una card) | Login | DISENO lo mide sobre `danger-soft` (6.36) y card; sobre canvas (L 0.975) queda ≥ 6:1. Verificar con la herramienta de contraste de DevTools. |
| Banda full-bleed del `PageHeader` con `cqw` | Páginas con `SectionManagerServer` | Requiere que no haya otro `@container` ni `overflow-hidden` entre `#main-content` y el header (verificado en los 9 módulos). Probar a 1440, 1920 y 2560 con sidebar abierto y colapsado: la banda debe tocar los dos bordes del área de contenido y el `h1` alinear con el breadcrumb. |
| `container-type: inline-size` en `#main-content` | Contenido de todas las páginas | No crea containing block para `fixed` (solo contención de estilo y tamaño inline). Verificar que dialogs, sheets y barras `fixed` de páginas siguen ubicándose respecto del viewport. |
| Toaster `unstyled` incompleto | Todos los toasts | Revisar success/error/warning/info/loading/promise/con acción en claro y oscuro, desktop y 375px; completar `classNames` sin `!important`. |
| Toast arriba en mobile tapando el header | 375px | `mobileOffset.top = 64`. |
| Cypress busca el toast de preparte por texto (`cypress/e2e/operations/preparte.cy.ts:216`) | E2E | El texto no cambia y el toast sigue visible en desktop. Correr ese spec si el entorno E2E está disponible (con OK del usuario, regla de tests). |
| Toasts apilados (antes 1 a la vez en `use-toast`) | 10 archivos migrados | Aceptado; ningún flujo depende de que se reemplacen. |
| Borrar `use-toast.ts` con un importador olvidado | Build | grep + LSP `findReferences` antes de borrar; `check-types` lo marca. |
| Reduced motion | Global | Regla con `animation-iteration-count: 1` (ver 3.1). Probar con la emulación de DevTools que el skeleton no parpadea. |
| Quitar el `<main>` raíz | `/maintenance`, `/clothing/login`, `/operator/login` no tienen `<main>` propio | Pierden el landmark (hoy lo tenían anidado). Se anota en §9 para la Fase 7 (paneles de campo); no afecta funcionamiento. |
| `global-error` sin tema oscuro | Pantalla de último recurso | Aceptado (sin `ThemeProvider` no hay clase `.dark`). |
| `sidebar.tsx` es un archivo shadcn | Futuras actualizaciones del componente | El cambio es solo de texto; se documenta para no perderlo si se re-instala el componente. |

---

## 7. Preguntas para el usuario

Ninguna bloqueante: todas las opciones se decidieron con `DISENO.md` y se listan como **[Desvío]** o en "Decisiones"
(abajo) para validar en la revisión. Las tres que más conviene mirar:
1. `global-error` pasa de la pantalla genérica de Next a una propia con "Volver al inicio" e "Intentar nuevamente"
   (3.10). Si se prefiere no agregar acciones, queda solo el texto.
2. La firma técnica del login muestra únicamente la versión (no "empresa" ni "estado del sistema", que no tienen
   fuente real) (3.9).
3. El header de la app en mobile no suma avatar (el usuario sigue en el sidebar) (3.7).

### Decisiones tomadas (resumen)
- Alias de Button: `destructive → danger` (relleno); `default|brand|success → primary`; `outline|surface|surfaceMuted →
  secondary`. Tamaño por defecto `md` (32px).
- Alias de Badge: `default → brand` (suave), `secondary → neutral`, `outline` = etiqueta con borde sin fondo,
  `yellow → warning`, `red|destructive → danger`.
- Card conserva su espaciado (`gap-6 py-6 px-6`); solo pierde radio, sombra y colores fijos.
- Input/Select bajan a 32/28px junto con el Button.
- Header de tabla: solo `bg-muted` en esta fase.
- Toaster: corte mobile 600px (el de sonner), `closeButton` global, errores migrados con `duration: Infinity`, sin
  `richColors`, z-index de sonner.
- `PageHeader` server, banda full-bleed con `cqw`, conectado solo en `SectionManagerServer`.
- Contenedor de página: `max-w` 1440, gutter 16/24, sin modo `wide` todavía.
- Login: título 32px (`text-display`), panel 40% con barra de 2px, recupero con callout `success`.
- Errores: "Volver al inicio" primary + "Intentar nuevamente" secondary (`DISENO.md` §6).
- `dashboard/loading.tsx`: geometría de PageHeader + panel de tabla.
- Reduced motion con `animation-iteration-count: 1`; `scroll-padding-top: 3.5rem`.

---

## 8. Checklist de verificación funcional

### 8.1 Controles de código (pegar la salida real en la auditoría)

| Control | Esperado | Antes | Después |
|---|---|---|---|
| `npm run check-types` | verde | | |
| `npm test` | verde (incluye `sidebar.utils.test.ts` y `tabs-visibility.test.ts`) | | |
| `npm run manual:check` | verde | | |
| `node scripts/ui/count-hardcoded-colors.mjs` | ≤ 2716; cada archivo de 2.6 en 0 | 2900 | |
| `grep -rnE "use-toast\|components/ui/toast['\"]\|components/ui/toaster" src` | 0 | 12 archivos | |
| `grep -rn "Poppins\|popinsFont" src` | 0 | 2 | |
| `grep -n "sitepoint\|@keyframes sweep\|header-logo\|togglePlan" src/app/globals.css` | 0 | 4 | |
| `grep -rnE "transition-all\|shadow" src/components/ui/{button,badge,card}.tsx` | 0 | varios | |
| `grep -rnE "dark:bg-slate\|bg-white" src/shared/components/common/DataTable/DataTable.tsx src/shared/components/data-table/base/data-table*.tsx` | 0 | 3 | |
| `grep -rn "RenderBanner\|AutenticationLight\|AutenticationDark\|RefreshComponent" src` | 0 | 6 | |
| `grep -rnE "replace\('(text\|bg\|border)-" src/components/ui src/features/Layout src/features/Auth src/shared/components/layout` | 0 | | |
| `grep -rnE "z-\[\|h-screen\|min-h-screen" ` en los archivos del alcance | 0 | varios | |
| `cn` (3.3): `text-overline` sobrevive junto a `text-muted-foreground` | sí | | |

### 8.2 Ficha `inventario/auth-y-errores.md` (tildar en el navegador)

| Ítem | Antes | Después |
|---|---|---|
| `/` redirige a `/dashboard`; sin sesión → `/login` | [ ] | [ ] |
| **Login** — componente raíz `login/page.tsx` → `LoginForm` (ahora sobre `AuthShell`, layout partido) | [ ] | [ ] |
| Título "¡Es un placer verte de nuevo!" + "Ingresá con tu correo y contraseña" | [ ] | [ ] |
| Pie "¿No tenés cuenta? El alta la hace un administrador de tu empresa." | [ ] | [ ] |
| Campo Email (`id/name=email`, `type=email`, placeholder `ejemplo@correo.com`, `autoComplete=email`, `data-testid="login-email-input"`) | [ ] | [ ] |
| Campo Contraseña (`id/name=password`, `type=password`, placeholder `Tu contraseña`, `autoComplete=current-password`, `data-testid="login-password-input"`) | [ ] | [ ] |
| Link "¿Olvidaste tu contraseña?" → `/reset_password` | [ ] | [ ] |
| Botón "Iniciar Sesion" (`formAction`, ancho completo, `data-testid="login-submit-button"`, "Cargando..." y deshabilitado mientras `pending`) | [ ] | [ ] |
| Validación cliente: "Email inválido" en `#email_error`; reglas de contraseña (8–50, mayúscula, minúscula, número, especial) en `#password_error`, ahora en `text-danger-text` | [ ] | [ ] |
| `toast.promise`: "Iniciando Sesion..." → "¡Bienvenido!" + `/dashboard`; error `banned` → "Tu acceso ha sido revocado…"; otros mensajes del server | [ ] | [ ] |
| Botón Google + separador "O continuá con" solo si `isGoogleLoginEnabled`; error → `toast.error` | [ ] | [ ] |
| `/login?error=oauth`: aviso "No pudimos iniciar sesión con Google…" (ahora callout danger con `role="alert"`) | [ ] | [ ] |
| `login/loading.tsx` (skeleton, ahora partido igual que la página) | [ ] | [ ] |
| **Recuperar** — `reset_password/page.tsx` → `RecoveryPasswordForm` sobre `AuthShell` (sin banner ni cita de GH) | [ ] | [ ] |
| Título "¿Olvidaste tu contraseña? No te preocupes, te ayudaremos a restablecerla." | [ ] | [ ] |
| Campo Email (placeholder `email@hotmail.com`, descripción "Ingresa tu email para recibir un enlace seguro…"), "Email inválido" | [ ] | [ ] |
| Botón "Enviar enlace de recuperación" ("Enviando..." con spinner y deshabilitado) | [ ] | [ ] |
| Link "¿Recordaste tu contraseña? Iniciar sesión" → `/login` | [ ] | [ ] |
| `toast.promise` con los 3 textos (loading/éxito uniforme/error) | [ ] | [ ] |
| Respuesta uniforme (no revela si el mail existe) | [ ] | [ ] |
| Estado post-envío: "✓ Solicitud enviada exitosamente" + "Hemos enviado un enlace seguro a **{email}**…" + "Reenviar" vuelve al form con el email cargado | [ ] | [ ] |
| `reset_password/loading.tsx` | [ ] | [ ] |
| **Confirmar** — `/reset_password/confirm`: título "Procesando solicitud..." + caja "Verificando enlace..." (y la rama `invalid_token` con "Solicitar nuevo enlace", aunque hoy no se alcanza por la rareza) | [ ] | [ ] |
| `confirm/loading.tsx` | [ ] | [ ] |
| **Nueva contraseña** — `update-user` sobre `AuthShell`; usada por recuperación e invitación | [ ] | [ ] |
| Título "Establece tu nueva contraseña" + descripción larga (texto igual, con "6 caracteres") | [ ] | [ ] |
| Sin `token` o con `error`: caja "Enlace inválido o expirado" + "Pedí un enlace nuevo…" + "Solicitar nuevo enlace" → `/reset_password` | [ ] | [ ] |
| Campos Contraseña / Confirmar (`new-password`, placeholders, descripciones, toggle de ojo compartido con `aria-label` dinámico) | [ ] | [ ] |
| Validaciones (`passwordSchema` en los dos + "Las contraseñas no coinciden.") | [ ] | [ ] |
| Botón "Cambiar contraseña" ("Cambiando contraseña..." deshabilitado); `toast.promise` + `/login` | [ ] | [ ] |
| `update-user/loading.tsx` | [ ] | [ ] |
| **404** — "ERROR 404" (overline), "¡Ups! Página no encontrada", "Lo sentimos, parece que la página…", "Volver al Dashboard" → `/dashboard`; ahora con modo oscuro | [ ] | [ ] |
| **Error de app** — `logger.error('Application Error')` + `posthog.captureException` al montar | [ ] | [ ] |
| "Algo salió mal" + descripción; "Detalles del error:" + mensaje + "ID de error" (si hay digest) | [ ] | [ ] |
| "Información técnica completa:" (`<pre>` con mensaje, digest, stack, timestamp, UA, URL) | [ ] | [ ] |
| "Copiar error" → portapapeles + "Error copiado al portapapeles" | [ ] | [ ] |
| "Reportar al equipo" → `sendErrorReport({source: 'Aplicacion'})`, "Enviando reporte..." y los 3 toasts | [ ] | [ ] |
| "Intentar nuevamente" → `reset()`; "Volver al inicio" → recarga completa a `/dashboard` | [ ] | [ ] |
| **Error global** — `posthog.captureException(…, {$exception_type:'Global Error', digest})`; ahora pantalla propia con "Volver al inicio" / "Intentar nuevamente" (probar lanzando un error en el root layout en dev) | [ ] | [ ] |
| **Error del dashboard** — `logger.error('Dashboard Error')` (sin PostHog); "Error en el Dashboard" + "Ha ocurrido un error inesperado en esta sección del dashboard"; "Mensaje de error:" + "ID de referencia" | [ ] | [ ] |
| "Información técnica completa:" con `=== ERROR EN DASHBOARD ===` | [ ] | [ ] |
| "Copiar error" (+ "Puedes pegarlo en un email o mensaje"; fallo → "No se pudo copiar el error"); "Reportar al equipo" (`source: 'Dashboard'`) | [ ] | [ ] |
| Callout "¿Qué puedes hacer?" con las 3 viñetas | [ ] | [ ] |
| "Intentar nuevamente" (`reset()`) y "Volver al inicio" (ícono Home, recarga completa); el sidebar y el header siguen visibles | [ ] | [ ] |
| **Carga del dashboard** — skeleton en toda ruta `/dashboard/**` sin loading propio (ahora PageHeader + panel de tabla) con "Cargando…" para lectores de pantalla | [ ] | [ ] |

### 8.3 Toasts migrados (provocar al menos uno de cada archivo)

| Archivo | Acción para dispararlo | Esperado | Después |
|---|---|---|---|
| `contractDocuments.tsx` | Comercial → Contratos → documentos: subir sin archivo / subir / eliminar | warning "No hay archivos", success, success; error persistente con cierre | [ ] |
| `EquipmentModelForm.tsx` | Configuración → Equipos → Modelos: crear y editar | success "Modelo creado/actualizado" | [ ] |
| `EquipmentOwnerForm.tsx` | Titulares: guardar | success "Titular guardado correctamente" | [ ] |
| `EquipmentSubTypeForm.tsx` | Subtipos: guardar | success | [ ] |
| `EquipmentTypeForm.tsx` | Tipos: guardar | success | [ ] |
| `BulkCertificacionModal.tsx` | Comercial → Partes diarios: certificar en lote | success "Éxito" con el conteo | [ ] |
| `PreparteBulkStatusModal.tsx` | Operaciones → Preparte: confirmar en lote | success "Pedidos confirmados" / info "Sin cambios" | [ ] |
| `ModulePermissions.tsx` | Usuarios → permisos: limpiar permisos | success "Permisos limpiados" | [ ] |
| `DailyReportWrapper.tsx` | Comercial → parte: "Detalle del servicio" | toast neutro | [ ] |
| `MaintenanceGroupsClient.tsx` | Configuración → Mantenimiento → Grupos: guardar | **un solo** toast (antes salía duplicado) | [ ] |
| General | Un toast en desktop y uno en 375px, claro y oscuro | bottom-right / top-center a 64px; barra de 2px del tono; botón cerrar; error no se autocierra | [ ] |

### 8.4 Recorrido login → dashboard → 5 módulos (1440 / 768 / 375 · claro / oscuro)

Cada celda se tilda cuando: no hay scroll horizontal del body (`document.documentElement.scrollWidth <= innerWidth`),
el skip link aparece con Tab y lleva al contenido, el foco se ve (outline 2px verde), los botones/inputs de la toolbar
están alineados, el header de tabla es `bg-muted`, el `PageHeader` toca los dos bordes del área y su `h1` alinea con el
breadcrumb, y la funcionalidad de la pantalla responde (abrir un filtro, paginar, abrir un dialog, guardar algo).

| Pantalla | 1440 claro | 1440 oscuro | 768 claro | 768 oscuro | 375 claro | 375 oscuro |
|---|---|---|---|---|---|---|
| `/login` (con y sin `?error=oauth`) | | | | | | |
| `/reset_password` (form y estado enviado) | | | | | | |
| `/dashboard` (Dashboard principal) | | | | | | |
| `/dashboard/employee` (Empleados, tabla con selección) | | | | | | |
| `/dashboard/equipment` (Equipos) | | | | | | |
| `/dashboard/document` (Documentación) | | | | | | |
| Mantenimiento (una tab con `BaseDataTable`, p. ej. Equipos → Mantenimiento) | | | | | | |
| Comercial → Facturación (badges de estado) | | | | | | |
| 404 (`/dashboard/no-existe`) | | | | | | |
| Error del dashboard (forzado en dev) | | | | | | |

Mediciones DOM a anotar en la auditoría: alto de `<header>` de la app (56), de un Button default (32; 44 con touch
emulado), de un Input (32), del `PageHeader` y su ancho vs. `#main-content`; CLS del login (≤ 0.1);
`getComputedStyle(document.body).fontFamily` incluye "IBM Plex Sans".

### 8.5 Prueba anti-GH (`DISENO.md` §7) en la Fase 1
En `/dashboard/employee` sin logo se deben poder señalar: header de tabla sobre muted, esquinas rectas sin sombra en
cards y botones, barra de acento de 2px en el sidebar, y Plex. En `/login`: layout partido con firma mono (no card
centrada).

---

## 9. Auditorías

(Se agregan acá los informes, ver §3 de `AUDITORIA-UI.md`.)

---

## Anexo — Crecimiento de datos (D7)

| Superficie de esta fase | Clasificación | Motivo |
|---|---|---|
| Menú del sidebar (`NavMain`) | acotado | Módulos y tabs del `permissions-map` (catálogo fijo). |
| Selector de empresa (`CompanySwitcher`) | acotado | Empresas del usuario (hoy 4 en total). |
| Breadcrumb | acotado | 2 niveles. |
| Toasts | acotado | Sonner muestra 3 y descarta el resto. |
| Login / recupero / errores | No aplica | No listan datos. |
| Header de las tablas compartidas | No aplica en esta fase | Solo cambia el color; la paginación de cada tabla se audita en las Fases 3 y 5. |

Ninguna superficie de la Fase 1 lista datos que crecen: no hay consultas nuevas ni cambios en `take`/`skip`.

<!-- estado: completo -->
