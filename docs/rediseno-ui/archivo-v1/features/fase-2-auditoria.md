# Fase 2 — Primitivos compartidos — auditoría

Estado: auditoría 1 cerrada en cero (S1 = 0, S2 = 0). Los S3 están corregidos y quedan S4 abiertos para `PLAN.md` §9.

### Auditoría 1 — 2026-10-08
Alcance: `git diff` y `git status` de la Fase 2 (rama `feat/rediseno-ui`, sin commits).
- Ola 0: el revestimiento de los wrappers de `src/components/ui`.
- Hooks y utilidades: `use-media-query`, `use-debounced-value`, `formatters`, `mappers` (solo lo agregado), `date-adapters`, `option-labels` y `responsive-dialog-context`.
- Ola 1: `panel`, `status-badge`, `responsive-dialog`, `confirm-dialog`, `date-picker`, `form-date-picker`, `search-select` (más `-list` y `-drawer`), `EmptyState`, `SimpleTable`, `StatCard` y `RowActions`.
- `globals.css` (`scroll-fade-x`) y `table.tsx` (sin `'use client'`).

Evidencia recibida:
- El hilo principal verificó en el navegador `ConfirmDialog`, `DatePicker`, `SearchSelect` y `ResponsiveDialog` en mobile (ver el pedido de auditoría).
- Lectura completa del código de cada archivo del alcance.
- CSS compilado con `@tailwindcss/postcss` (`optimize: true`, script descartable) para confirmar las clases nuevas:
  - `pointer-coarse:w-11` y `pointer-coarse:after:-inset-y-3` se generan;
  - el `@supports` de `scroll-fade-x` sale aplanado, también con la variante `group-data-[orientation=horizontal]/tabs:`.
- `npm run check-types`: verde antes y después de los fixes.
- `npx vitest run`: 83 archivos pasan y 15 se saltean (785 tests pasan, 104 skipped).
- No hay capturas por ancho y tema: las pantallas reales migran en las fases 3 a 7. Los primitivos tienen su página de ejemplo, excluida de git: `src/app/dashboard/dev-primitivos/`.

Skills: `vercel-react-best-practices` (tool `Skill`).
- Es una auditoría de código sobre primitivos cuyo plan ya cargó 16 skills del catálogo (`fase-2-primitivos.md`, encabezado). No se volvió a barrer el catálogo.
- Las reglas que se citan abajo se contrastaron con su archivo en `~/.claude/skills/vercel-react-best-practices/rules/`.

| ID | Sev | Bloque | archivo:línea | Regla | Hallazgo | Fix | Estado |
|---|---|---|---|---|---|---|---|
| A-01 | S2 | E4 / H3 | `src/components/ui/date-picker.tsx:122` | `rerender-derived-state-no-effect` + E4 | (Entrada 1) El texto solo se resincronizaba cuando cambiaba `value`. Un `form.reset()` que deja el mismo valor (o `null` sobre `null`) no cambia `value`, así que no se enteraba. Tras el blur el texto parcial ya se había revertido, pero quedaba pegado el aviso «No se reconoció…». Con el foco adentro quedaba además el texto parcial. | Nueva prop `resetKey`: al cambiar, el picker descarta el texto pendiente y el aviso (ajuste en render, sin efecto). `FormDatePicker` (`form-date-picker.tsx:79`) la incrementa cuando `fieldState.isTouched` pasa de `true` a `false`, cosa que solo hacen `reset()` y `resetField()`. | corregido |
| A-02 | S2 | E1 / E3 | `src/components/ui/date-picker.tsx:185` | Learned Correction «fallo silencioso» | (Entrada 2) Enter confirmaba el texto pero no frenaba el envío implícito. Con texto inválido o a medias, el form salía con el valor anterior mientras la pantalla mostraba otro. | Ver decisión de diseño abajo: si el texto no coincide con `formatDate(value)`, Enter confirma o revierte con `preventDefault`; si coincide, envía como siempre. | corregido |
| A-03 | S2 | D4 | `src/components/ui/search-select-drawer.tsx:46` | Radix Dialog a11y | (Entrada 3) `DrawerContent` sin `DrawerDescription`: Radix tira «Missing Description» dos veces, según el navegador. | `DrawerDescription` sr-only con la instrucción ("Buscá y tocá una opción…"; en plural si es múltiple). Mismo criterio que el drawer del `DatePicker`. | corregido |
| A-04 | S3 | F4 | `src/components/ui/search-select.tsx:162` | `client-swr-dedup` (React Query) | (Entrada 4) La búsqueda async heredaba `retry: 1` del `QueryClient`, así que el error y "Reintentar" tardaban un reintento en aparecer. | `retry: false` en esa query. | corregido |
| A-05 | S2 | A / C | `src/shared/components/data-display/StatCard.tsx:38` | DISENO §4.10 | (Entrada 5) `React.Children.count` cuenta los `null`/`false` de los hijos condicionales y toma un Fragment como un solo hijo. La grilla de `KpiStrip` salía con una cantidad de columnas equivocada. | `countRenderedChildren`: ignora los vacíos y entra a los Fragments en forma recursiva. | corregido |
| A-06 | S2 | C3 | `src/components/ui/search-select.tsx:440` | DISENO §2.6 (44px con `pointer: coarse`) | La ✕ de los chips de `SearchSelect` múltiple medía 20×20 también con puntero grueso. | Con `pointer-coarse`, 44px de ancho real más una extensión vertical por `::after` hasta 44px. No se extiende a los costados, para no pisar el chip vecino. | corregido |
| A-07 | S2 | A12 | `src/shared/components/data-display/SimpleTable.tsx:64-65` | DISENO §2 (escala de z-index, "nada de `z-[n]`") | La primera columna sticky usaba `z-[1]`. | `z-10`, el escalón de lo sticky de tabla. | corregido |
| A-08 | S3 | F6 | `src/app/globals.css:393` | `rendering-hydration-no-flicker` / compatibilidad | En navegadores sin `animation-timeline` (Firefox), `scroll-fade-x` corría como animación por tiempo con duración 0, y `both` dejaba fijo el último keyframe. El borde izquierdo quedaba desvanecido aunque no hubiera desborde, al revés de lo que dice el comentario. | El cuerpo de la utilidad va dentro de `@supports (animation-timeline: scroll())`. | corregido |
| A-09 | S2 | C10 | `src/components/ui/tabs.tsx:21` | DISENO §4.9 (tabs con "fade lateral") | La lista subrayada scrolleaba en horizontal sin fade. La utilidad `scroll-fade-x` existía pero ningún componente la usaba. | `group-data-[orientation=horizontal]/tabs:scroll-fade-x` en la variante subrayada. Sin desborde la timeline queda inactiva y no hay máscara, así que las tabs que entran no cambian. | corregido |
| A-10 | S3 | — | `src/components/ui/date-picker.tsx` | Plan §4.1 ("ningún archivo nuevo debería pasar de ~300 líneas") | `date-picker.tsx` tenía 526 líneas (desvío anotado en `fase-2-ola1-D.md`). | Se partió sin cambiar la lógica:<br>• `date-picker-text.ts` (124): máscara, parseo, límites y mensajes, sin React;<br>• `date-picker-month-grid.tsx` (89): grilla de meses;<br>• `date-picker.tsx` (361): interacción.<br>El tipo `DatePickerGranularity` se sigue exportando desde `date-picker.tsx`. | corregido |
| A-11 | S3 | D2 / H | `src/shared/components/data-display/RowActions.tsx:180` | Árbol de eventos de React | En el árbol de React, los ítems del menú ⋯ (en portal) y los íconos son hijos del div de `RowActions`. Su `click` subía a la fila o tarjeta del DataTable, y si esa fila abre el detalle al hacer clic, una acción del menú abría también el detalle. | `onClick={stopPropagation}` en el contenedor. La navegación de los `Link` no cambia, y `keydown` no se frena para no cortar atajos globales. | corregido |
| A-12 | S4 | F2 / F5 | `src/components/ui/search-select.tsx` | Plan §4.1 | 461 líneas (el plan sugiere ~300). Ya está partido en 3 archivos y ~100 líneas son tipos y docs. Desvío aceptado en `fase-2-ola1-E.md`. | Partir solo si crece. | abierto (§9) |
| A-13 | S4 | F7 | `src/components/ui/search-select.tsx:218` | `js-early-exit` | `indexOptions(localOptions)` normaliza todas las opciones al montar, aunque el combo nunca se abra. Con 632 empleados son ~1ms. | Si una pantalla monta muchos combos grandes, indexar recién al abrir (memo condicionado a `open`, con `rerender-lazy-state-init`). | abierto (§9) |
| A-14 | S4 | F5 | `src/shared/components/data-display/RowActions.tsx:182` | DISENO §4.14 | Hay un `TooltipProvider` por fila, así que el "0 ms entre tooltips seguidos" no cruza filas. Ya anotado en `fase-2-ola1-B.md`. | Provider global en el layout (Fase 3, junto con el DataTable). | abierto (§9) |
| A-15 | S4 | C10 | `src/shared/components/data-display/SimpleTable.tsx:325` | DISENO §4.6 | El modo `scroll` no usa `scroll-fade-x`: el fade izquierdo enmascararía la primera columna sticky. | Decidirlo en la Fase 3 con el DataTable: fade solo a la derecha, o máscara en un wrapper que excluya la columna fija. | abierto (§9) |
| A-16 | S4 | E3 | `src/components/ui/date-picker.tsx:122` | — | Remanente de A-01: un reset **programático** disparado con el foco todavía en el input, con texto a medias y sin cambio de valor ni de `touched`, deja el texto hasta el blur, que lo revierte con aviso. Por teclado ya no se llega a ese caso, porque Enter con texto pendiente no envía (A-02). | Ninguno sin una API imperativa; no vale la pena. | abierto (§9) |

**Decisión de diseño de A-02 (Enter en `DatePicker`).**

| Situación | Qué hace Enter |
|---|---|
| Sin texto pendiente: vacío con `value` nulo, o texto igual a la fecha ya emitida | Lo de siempre: envío implícito del form, que es lo que espera quien llena un form con teclado. |
| Texto a medias, inválido o fuera de rango | Resuelve el campo: si es válido lo confirma, si no lo revierte con aviso. `preventDefault`, no envía. |

Por qué no envía con texto pendiente:
- Si enviara, el payload llevaría el último valor válido mientras la pantalla muestra otro texto. Es un fallo silencioso, el mismo patrón que la Learned Correction «buscar el fallo silencioso en la rama de éxito».
- Si el usuario quería enviar, le basta un segundo Enter, ya con el campo resuelto y visible.
- La condición (`text !== formatDate(value)`) es la misma que define "pendiente" en todo el componente. No se agrega estado nuevo.

**Fuera de alcance, para la fase que corresponda** (no es Fase 2, no se tocó):
- `src/components/ui/sonner.tsx` es de la Fase 1, y tiene dos problemas para D9 / C3:
  - la ✕ del toast mide 24px también con puntero grueso;
  - los toasts de error se cierran a los 4 s (D9 pide errores sin autocierre).
  - Se resuelve en la auditoría de la Fase 1 o en la Fase 3.

**Revisado sin hallazgos:**

*Fidelidad a DISENO (bloque A)*
- A2: sin `rounded-*` salvo el punto de estado.
- A3: las únicas sombras son `shadow-overlay` en capas flotantes y las barras `inset` de 2px.
- A8: sin `transition-all` ni `active:scale`.
- A1: `count-hardcoded-colors` en `src/components/ui` da 7, todos preexistentes o excepciones ya anotadas (scrims `bg-black/40`, íconos). En `data-display` y `feedback` da 0.

*Accesibilidad (bloque D)*
- D3: todo control de solo ícono tiene `aria-label`.
- D4: `role="status"` siempre montado en `DatePicker` y `SearchSelectList`.
- D5: `*` con `aria-hidden` en `FormDatePicker`.
- D7: skeleton con `motion-reduce`, más el reset global de reduced motion en `globals.css`.

*Formularios (bloque E)*
- E1: todos los `<button>`/`Button` de los primitivos llevan `type="button"`.
- Los overlays van en portal y quedan fuera del `<form>` del DOM.

*Reglas del proyecto (bloque G)*
- G2 y G3: sin `console.*` ni `any`.
- G4: sin clases armadas en runtime.
- G9: sin `date-fns` nuevo. El de `calendar.tsx` ya estaba: es la locale de react-day-picker.

*Performance (bloque F)*
- `bundle-dynamic-imports` y `bundle-preload`: el calendario rdp se carga con `next/dynamic` y se precarga en hover/focus del botón.
- `client-event-listeners`: `use-media-query` comparte un solo `matchMedia` por query.
- `rendering-hydration-no-flicker`: el modo Dialog/Drawer se fija al abrir y el snapshot de SSR es desktop.
- `rerender-derived-state-no-effect`: los ajustes de estado van en render (`ConfirmDialog`, `ResponsiveDialog`, `DatePicker`, `FormDatePicker`).
- `rerender-use-deferred-value`: lo usa el filtro local.
- `js-cache-function-results`: los `Intl` se crean a nivel de módulo en `formatters.ts`.
- `js-hoist-regexp`: aplicado.
- `server-serialization`: `Panel`, `EmptyState`, `StatusBadge`, `StatCard` y `SimpleTable` no tienen directiva, y `table.tsx` ya no es client.
- `server-no-shared-module-state`: el `Set` de `status-badge.tsx` solo deduplica warnings de desarrollo, no guarda datos de request (aceptado).

**N/A justificados:**
- B (anti-GH), C1/C2 (recorridos por ancho) y H1/H2: sin pantallas migradas en esta fase.
- F1/F3 de servidor: los primitivos no hacen fetch, salvo la query de `SearchSelect`, que es del cliente.
- `async-api-routes` y `rendering-script-defer-async`: no aplican al repo.

Archivos tocados por esta auditoría:
- `src/components/ui/date-picker.tsx`, más dos archivos nuevos: `date-picker-text.ts` y `date-picker-month-grid.tsx`.
- `src/components/ui/form-date-picker.tsx`.
- `src/components/ui/search-select.tsx` y `src/components/ui/search-select-drawer.tsx`.
- `src/components/ui/tabs.tsx`.
- `src/app/globals.css`.
- `src/shared/components/data-display/StatCard.tsx`, `SimpleTable.tsx` y `RowActions.tsx`.

Ningún consumidor fuera del alcance. La página `dev-primitivos` no necesitó cambios: la API no cambió, solo se agregó `resetKey`, que es opcional.

Para re-mirar en el navegador:
1. `DatePicker` dentro de un form:
   - escribir `07/1` y apretar Enter: no envía y revierte con aviso;
   - con una fecha completa, Enter envía;
   - escribir a medias, salir del campo y tocar "Reset" (mismo valor o `null`): el aviso desaparece.
2. `SearchSelect` en mobile: ya no aparece el warning «Missing Description» en la consola, y con un async que falle, "Reintentar" aparece enseguida.
3. `KpiStrip` con una cifra condicional en `false` y otras dentro de un Fragment: las columnas cuentan solo las cifras reales.
4. Chips de `SearchSelect` múltiple con emulación touch: la ✕ mide 44×44 (`getBoundingClientRect` del botón más el `::after`) y no pisa el chip de al lado.
5. Tabs que desbordan a 375px: fade en el borde con pestañas ocultas (Chrome/Edge). En Firefox, sin máscara.
6. `RowActions` dentro de una fila clickeable: elegir un ítem del ⋯ no abre el detalle de la fila.

Resumen: S1 0 · S2 7 (corregidos) · S3 4 (corregidos) · S4 5 (abiertos, para `PLAN.md` §9).
Veredicto: EN CERO.

<!-- estado: completo -->
