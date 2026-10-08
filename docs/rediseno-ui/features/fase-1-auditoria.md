# Fase 1 — Auditoría de la implementación

### Auditoría 1 — 2026-10-07
Alcance: working tree de `feat/rediseno-ui` sin commits (`git diff` + archivos nuevos: `src/app/fonts.ts`,
`AuthShell.tsx`, `Auth/fallback/`, `shared/components/layout/`, `scripts/ui/`).
Evidencia recibida: `fase-1-progreso.md` y lectura de código. **No hay capturas ni mediciones de DOM**: la consigna
prohíbe levantar el dev server y usar el navegador. Por eso los ítems C/D/A6 que piden recorrido quedan como
"verificación visual pendiente" y no se marcan OK (ver la lista al final).
Evidencia propia: `npm run check-types` en verde (sin salida de errores); conteo de hardcodeados; compilación de
clases con `@tailwindcss/node` contra el `@theme` real; pruebas de `extendTailwindMerge` con el config real;
contraste medido desde los oklch de `globals.css`; lectura del CSS que inyecta `sonner@2.0.7`.
Skills: `vercel-react-best-practices` (tool `Skill`), `emilkowalski/ask-sonner`, `jakubkrehel/better-accessibility`.
Barrido por MCP `ui-skills` (`list_skills`: `accessibility`, `toast`, `tailwind`).

Versiones: Next 16.1.0 · React 19.2.1 · Tailwind 4.2.0 · tailwind-merge 3.5.0 · sonner 2.0.7.

## 1. Plan vs. implementación y desvíos declarados

Lo implementado coincide con `fase-1-fundamentos.md` §3 archivo por archivo. Desvíos de `fase-1-progreso.md`:

| Desvío | Veredicto |
|---|---|
| Paso 2: se borra `input[type='checkbox']:checked ~ label span svg` (vivía dentro del `@layer components` de landing) | Aceptable: el plan manda borrar el bloque entero y la regla era de la landing. |
| Paso 3: Button base con `text-label font-medium`; CardTitle `text-section font-semibold` | Aceptable y correcto: sin el peso explícito, un `text-sm/lg` del consumidor reemplaza la clase de rol y el peso cae a 400. |
| Paso 5: `@max-xl/ph:` en vez de `max-@xl/ph:` | Aceptable: es la sintaxis de Tailwind 4.2; verificado que genera `@container ph (width < 36rem)`. |
| Paso 5: `title` del `SidebarRail` en español | Aceptable (el plan lo prevé). |
| Paso 6: llamadas de toast en una sola línea | Aceptable (prettier prohibido). |
| Paso 7: aviso oauth en `<p>`, `mt-1` en callouts, sin `w-full` en el submit de update-user | Aceptables: textos idénticos, solo ritmo. |
| Paso 8: ícono `Home` en "Volver al inicio" de `app/error.tsx` | Aceptable: sigue el pseudocódigo del plan. |
| Paso 9: conteo 2718 (meta ≤ 2716) por los 2 hex de `themeColor` | Aceptable: el `<meta theme-color>` no puede leer variables CSS. Tras esta auditoría el conteo es **2711**. |

Desvío **no declarado** encontrado: ninguno de comportamiento. Una inexactitud del plan (§3.8): dice que con
`hideTitle` + `actions` las acciones "se muestran alineadas a la derecha como antes"; antes el contenedor era
`justify-between` con un solo hijo, o sea a la izquierda. Sin impacto: el único `hideTitle` (`AyudaComponent.tsx:44`)
no pasa `actions`.

## 2. Funcionamiento: toasts y alias

- **Toasts (10 archivos, 41 llamadas)**: comparados uno por uno contra `git diff`. Títulos y descripciones idénticos
  (incluidos los template literals con conteos), mismo punto de disparo, ningún `toast` en deps de hooks. Errores →
  `toast.error(..., { duration: Infinity })`; el de Preparte conserva `duration: 10000`. Éxitos → `toast.success`,
  "Sin cambios" → `toast.info`, "No hay archivos" → `toast.warning`, informativos → `toast`. Un solo `<Toaster />`.
  OK.
- **Button**: los alias mantienen la semántica: `destructive` → `danger` (relleno rojo, 5.78:1 claro / 4.58:1
  oscuro), `default/brand/success` → primary, `outline/surface*` → secondary (borde `--input` ≥ 3.1:1). Cambio de
  `data-variant` a nombre canónico: nadie lo lee en `src/` ni `cypress/` salvo `PageHeader`. OK.
- **Badge**: `destructive/red` siguen siendo rojos (fondo suave + texto y borde rojo, 6.36:1 / 7.89:1). **Pero** los
  alias que antes eran rellenos sólidos con texto blanco (`default`, `success`, `destructive`) rompen a los
  consumidores que dependían de ese texto blanco → hallazgo F1-01 (S1), corregido.

## 3. Hallazgos

| ID | Sev | Bloque | archivo:línea | Regla | Hallazgo | Fix | Estado |
|---|---|---|---|---|---|---|---|
| A-01 | S1 | D6 / H | `src/features/Empresa/Clientes/components/CustomersList.tsx:51` | WCAG 1.4.3 | `Badge variant success/destructive` + `text-white`: con los tonos suaves nuevos queda texto blanco sobre verde/rojo claro (ilegible) | Se quita `text-white` (el tono ya trae su `*-text`) | corregido |
| A-02 | S1 | D6 | `src/features/Equipos/EquipoID/components/vehicle-checklists-tab-content.tsx:101` | WCAG 1.4.3 | `Badge default` + `bg-green-500`: el texto pasó a `--primary-text` (verde oscuro) sobre verde 500 | `variant="success"` sin clases de color (mismo significado "Bueno") | corregido |
| A-03 | S1 | D6 | `src/features/Mantenimiento/Planificacion/components/AsignarTallerDialog.tsx:253` | WCAG 1.4.3 | `Badge default` + `bg-blue-600`: texto verde sobre azul | `variant="info"` | corregido |
| A-04 | S1 | D6 | `src/features/Mantenimiento/Planificacion/components/columns.tsx:225` | WCAG 1.4.3 | Mismo caso ("Con OT") | `variant="info"` | corregido |
| A-05 | S1 | D6 | `src/features/Mantenimiento/SolicitudesMantenimiento/components/SolicitudApprovalDialog.tsx:793` | WCAG 1.4.3 | `Badge default` + `bg-green-600` cuando está aprobado | `variant={isApproved ? 'success' : …}` y sin `className` | corregido |
| A-06 | S2 | A2 / tokens | `src/app/globals.css` `@theme` | DISENO §2.6 (radios 0) | `rounded` a secas (79 usos en `src/`) seguía en `0.25rem`: Tailwind solo lo lee de `--radius` **dentro de `@theme`**, y el plan solo reseteaba `--radius-xs…4xl` | `--radius: 0` en `@theme` (verificado: `rounded` → `var(--radius)`) | corregido |
| A-07 | S3 | Tailwind v4 / cn | `src/lib/utils.ts` | consigna (extendTailwindMerge cubre las clases nuevas) | `shadow-overlay` se tomaba como color de sombra y `ease-out-quick` no chocaba con `ease-*`: `cn('shadow-overlay','shadow-lg')` dejaba las dos | Grupos `shadow: ['overlay']` y `ease: ['out-quick']` (verificado: ahora gana la última) | corregido |
| A-08 | S3 | A4 / toasts | `src/components/ui/sonner.tsx` | DISENO §3 | El `<ol data-sonner-toaster>` fija su propia `font-family` (CSS de sonner sin capa): los toasts salían en la fuente del sistema, no en Plex | `font-sans` en la clase `toast` | corregido |
| A-09 | S3 | A14 / toasts | `src/components/ui/sonner.tsx` | — | En oscuro sonner pinta el botón de cerrar con `--normal-bg: #000` (regla no condicionada por `unstyled` y sin capa, le gana a Tailwind): cuadrado negro sobre el popover | `--normal-bg/-bg-hover/-text/-border` apuntados a tokens en el `style` del toaster | corregido |
| A-10 | S3 | toasts | `src/components/ui/sonner.tsx` | — | Con `unstyled`, sonner no oculta el contenido de los toasts apilados detrás (`>* {opacity:0}` solo existe en modo estilado): un toast de atrás más alto puede asomar | `data-[expanded=false]:data-[front=false]:*:opacity-0` (verificado que compila al selector esperado) | corregido, **mirar en navegador** |
| A-11 | S3 | D4 | `src/app/operator/login/page.tsx:35`, `src/app/clothing/login/page.tsx:14,40`, `src/app/clothing/thanks/page.tsx:23` | landmark `main` | Al sacar el `<main>` del root layout, estas pantallas quedaron sin landmark principal (no tienen layout propio que lo ponga) | El `div` raíz pasa a `main` (mismas clases, mismo DOM que antes en la práctica). `/maintenance/*` ya tiene `<main>` propio | corregido |
| A-12 | S3 | D5 | `src/features/Auth/components/LoginForm.tsx:70,93` | WCAG 3.3.1 / `better-accessibility` | El error inline (`#email_error`, `#password_error`) no estaba asociado al input | `aria-describedby` en los dos inputs (ids sin cambios) | corregido |
| A-13 | S4 | toasts | sonner (CSS inyectado) | — | En oscuro sonner fuerza `[data-description]{color:#e8e8e8}` (sin capa): la descripción no queda en `muted-foreground`. Contraste OK, se pierde jerarquía | Sin `!important` (prohibido por el plan) solo se resuelve con una regla sin capa en `globals.css` o con `toast.custom` | abierto |
| A-14 | S4 | D1 / toasts | sonner (CSS inyectado) | WCAG 2.4.7 | `[data-sonner-toast]{outline:0}` sin capa anula el outline global cuando el toast recibe foco (Alt+T); queda el `box-shadow` de sonner, débil en oscuro. El botón de cerrar sí conserva el outline | Mismo camino que A-13 | abierto |
| A-15 | S4 | A2 | `src/features/Employees/Diagrams/DiagramMassiveForm.tsx:480,488` | — | `Badge` default con `style={{backgroundColor}}` + `text-white`: el fondo inline gana, pero ahora aparece el borde `primary/30` alrededor del color de la novedad; si `color` es null queda blanco sobre verde suave | Migrar al módulo (Fase de Empleados) con `border-transparent` | abierto |
| A-16 | S4 | — | `docs/rediseno-ui/features/fase-1-fundamentos.md` §3.8 | — | El plan describe mal el comportamiento previo de `hideTitle` + `actions` (ver §1) | Corregir el texto del plan | abierto |

Pendientes fuera de alcance ya registrados por el plan (§4.5), sin cambios: `src/lib/utils.ts:6-7` re-exporta server
actions desde el módulo de `cn` (`bundle-barrel-imports`); `PostHogProvider` carga `posthog-js` antes de hidratar
(`bundle-defer-third-party`). `confirm/page.tsx` lee `searchParams` de forma síncrona (rareza registrada; en Next 16
`searchParams` es una Promise, así que `error` siempre queda vacío): no se toca, ya está en §9.

## 4. Checklist

**A. Fidelidad**: A1 conteo global 2711 (bajó de 2718); en los archivos del alcance solo los 2 hex de `themeColor`.
A2 corregido (A-06). A3 sin `shadow` en Button/Badge/Card. A4 roles tipográficos usados; `text-[1.125rem]` del
`PageHeader` es el del plan. A8 Button sin `transition-all`/`active:scale`. A12 `grep z-\[|h-screen` en el alcance = 0
(`z-60` del skip link es de la escala). A14 tokens en `.dark`; `dark:` solo con tokens en `AuthShell`. A6/A7/A13 y
recorrido de temas: **pendiente de navegador**.

**C. Responsive** (lectura): banda full-bleed del `PageHeader` verificada por cálculo (`ml = 50%·C − 50cqw` deja el
borde izquierdo en 0 y el ancho = contenedor, sin desborde); `cqw` en el propio `@container/ph` se resuelve contra el
ancestro `@container/page` (un contenedor no se consulta a sí mismo). Login a 1 columna < `lg`, inputs `text-base
md:text-sm` (sin zoom iOS). `pointer-coarse:min-h-11` / `min-w-11` en Button (verificado que compila a
`@media (pointer: coarse)`). C1/C2/C3 por DOM: **pendiente de navegador**.

**D. Accesibilidad**: D3 sidebar en español (`sr-only`, `aria-label`, `title`). D4 `h1` único en auth/errores y en
`PageHeader`; landmarks corregidos (A-11). D5 corregido en login (A-12). D6 contraste medido (todos los pares nuevos
pasan): `primary-foreground/primary` 5.40 · 8.45; `destructive-foreground/danger` 5.78 · 4.58; `muted-foreground`
sobre canvas/card/muted/popover ≥ 5.25 · ≥ 6.34; `primary-text` sobre card/canvas/soft/sidebar-accent ≥ 5.58 ·
≥ 7.58; `*-text/*-soft` ≥ 6.17 · ≥ 7.89; `foreground/80` en callouts ≥ 8.85; `background@80` del panel de auth 10.91
· 9.77; borde `--input` sobre card/canvas 3.36/3.12 · 3.32/3.50; `--ring` ≥ 4.08 · ≥ 7.84; barras del toast warning
3.32 (el más bajo, ≥ 3:1). D7 reduced-motion con `animation-iteration-count: 1` (sin parpadeo); sonner trae su propio
`prefers-reduced-motion`. D9 errores persistentes (`duration: Infinity`) y `closeButton` global. Skip link: verificado
que `focus:fixed` y `focus:px-3/py-2` se emiten **después** de `focus:not-sr-only` (si no, quedaría `position:
static; padding: 0`). D1/D2 por teclado: **pendiente de navegador**.

**Stacking / z-index** (lectura): toaster `z-index: 999999999` (sonner) por encima de dialogs (`z-50`) y del header
(`z-20`); headers de tabla `z-10` quedan debajo del header de la app (antes empataban en `z-10`). `container-type:
inline-size` en `#main-content` aplica contención de tamaño inline y de estilo, no de layout: no crea containing block
para `position: fixed` ni stacking context; además dialogs/popovers/sheets de Radix van por portal a `body`.

**E. Formularios**: E1 sin botones nuevos dentro de `<form>`; `GoogleButton` (`type="submit"`) y el `Toggle` de
Radix son previos y no cambian. E2/E3 sin cambios de lógica (solo clases y `size="lg"`).

**F. `vercel-react-best-practices`**
- F1 Waterfalls: `async-parallel`, `async-defer-await`, `async-dependencies`, `server-parallel-*` N/A (no hay fetching
  nuevo). `async-suspense-boundaries` OK: se conservan los Suspense del shell; se quitan lecturas dinámicas
  (`cookies()` de `RenderBanner` en 3 rutas).
- F2 Bundle: `bundle-barrel-imports` sin imports nuevos de barrels (pendiente previo en `utils.ts`, fuera de alcance).
  `bundle-dynamic-imports`/`conditional`/`preload` N/A. `bundle-defer-third-party`: sale `@radix-ui/react-toast` y
  `RefreshComponent` del cliente; PostHog sin cambios (pendiente registrado). `bundle-analyzable-paths` OK
  (`package.json` importado estático en un Server Component, no viaja al cliente).
- F3 Servidor: `server-serialization` OK (`PageHeader` recibe string + ReactNode). `server-hoist-static-io` OK
  (`fonts.ts` y `APP_VERSION` a nivel de módulo). `server-no-shared-module-state` OK (solo constantes).
  `server-auth-actions`, `server-cache-*`, `server-after-nonblocking` N/A.
- F4 Cliente: `client-event-listeners` OK (un solo `matchMedia` por el único toaster, vía `useSyncExternalStore`
  con `subscribe`/`getSnapshot` de módulo). `client-passive-event-listeners`, `client-localstorage-schema` N/A.
- F5 Re-renders: `rerender-derived-state-no-effect` OK en `sonner.tsx` (sin `useEffect`+`useState`); en
  `error.tsx`/`dashboard/error.tsx` el efecto que arma `errorDetails` se conserva con la justificación del plan §4.6
  (depende de `window`/`navigator`/`Date`; N/A con motivo). `rerender-no-inline-components` OK. Resto N/A.
- F6 Render: `rendering-hoist-jsx` OK (`TOASTER_ICONS`, `ROWS`, constantes de clases). `rendering-conditional-render`
  OK (ternarios a `null`). `rendering-hydration-no-flicker` OK (posición del toaster cambia tras hidratar con el
  toaster vacío; tema por `next-themes`). `rendering-hydration-suppress-warning` solo en `<html>`.
  `rendering-resource-hints` OK (`next/font`, preload). Resto N/A.
- F7/F8: N/A (sin loops ni listeners en lo tocado).

**G. Reglas del repo**: G2 sin `console.*` en lo tocado; G3 sin `any` agregado (los `any` que aparecen en
`src/app/dashboard/forms/**` son previos y no están en el diff); G4 sin clases armadas en runtime (todas las
constantes de Button/Badge/Card/NavMain/sonner escritas completas; `grep replace('(text|bg|border)-` y template
literals con `${}` en `className` del alcance = 0); G9 sin `date-fns`; G10 skeletons dedicados (`AuthFormSkeleton`,
`PageHeaderSkeleton`).

**H. Funcionalidad**: H2 `data-testid` intactos (login). H4 `npm run check-types` en verde; `npm test` y
`npm run manual:check` no se corrieron (fuera de lo pedido en esta pasada). H5 conteo 2711 ≤ 2718. H6 los bugs previos
vistos (`searchParams` síncrono, cookie escrita en render del `ModeToggle`) no se tocaron.

## 5. Para mirar en el navegador (no verificable leyendo código)

1. Toasts: apilar 3 (p. ej. dos errores persistentes y un éxito) y confirmar que los de atrás no asoman (A-10); botón
   de cerrar en oscuro (A-09); fuente Plex en el toast (A-08); a 375 px arriba al centro sin tapar el ☰.
2. Badges corregidos: Clientes (Activo/Inactivo), checklists del equipo ("Bueno"), Planificación ("Con OT" y el
   diálogo de asignar taller), aprobación de solicitudes ("Aprobado").
3. Esquinas: cualquier `rounded` a secas que antes tuviera 4px ahora es recto (A-06).
4. `PageHeader`: banda a todo el ancho a 1440 / 768 / 375 sin scroll horizontal del body, alineada con el breadcrumb.
5. Skip link con Tab desde la barra de direcciones; foco visible en botones (sin el ring de 3px anterior).
6. Login/recupero en claro y oscuro; 404, error de app y del dashboard.

Resumen: S1 5 · S2 1 · S3 6 · S4 4 — corregidos: S1 5/5, S2 1/1, S3 6/6. Abiertos: S4 A-13, A-14, A-15, A-16 (para
`PLAN.md` §9). N/A justificados: F1 salvo suspense, F2 dinámicos, F3 auth/cache/after, F4 storage/passive, F7, F8
(sin código de ese tipo en el alcance); `error.tsx` efecto conservado (plan §4.6).
Veredicto: **EN CERO** en S1/S2 por código. La verificación visual (C1–C3, D1–D2, A6–A7, A14) queda pendiente en el
navegador del usuario.

<!-- estado: completo -->
