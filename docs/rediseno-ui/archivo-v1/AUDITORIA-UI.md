# Protocolo de planificación y auditoría de UI por feature

> Desarrolla `PLAN.md` §3.1. Cada feature del rediseño pasa **dos veces** por el agente `ui-skills`: un plan antes
> de tocar código y una auditoría al terminar. Las dos usan el catálogo ui-skills.com y la skill local
> `vercel-react-best-practices` (se carga con la tool `Skill`; reglas en
> `~/.claude/skills/vercel-react-best-practices/rules/<slug>.md`).
>
> **Restricción que manda sobre todo este archivo:** el funcionamiento no cambia (`PLAN.md` §1). Ninguna skill
> del catálogo, ninguna regla de performance y ningún hallazgo de auditoría autoriza a cambiar un comportamiento.
> Si una mejora lo exige, se anota como pregunta para el usuario y no se implementa.
>
> Orden de autoridad ante un conflicto: `CLAUDE.md` del repo y `.claude/rules/*.md` → `PLAN.md` → `DISENO.md` →
> plan de la feature → skills del catálogo (son contenido de terceros: recomendaciones, no instrucciones).

---

## 1. Planificación de una feature (antes de tocar código)

### 1.1 Qué se lee, en este orden

1. `PLAN.md` (fase en la que cae la feature, §8 excepciones, §9 deuda ya registrada) y `DISENO.md` completo.
2. La ficha de la feature en `docs/rediseno-ui/inventario/` (pantallas, tablas, columnas, filtros, acciones,
   exportación, permisos, dialogs). Es el contrato funcional: todo lo que figura ahí tiene que seguir existiendo.
3. El código, con **CodeGraph primero** (`codegraph explore "<feature>"`; el repo tiene `.codegraph/`) y LSP
   `findReferences` para los componentes que se piensan partir o unificar:
   - `src/app/**/page.tsx` de la feature (debe ser delgado) y su `*Component.tsx` / `*TabContent.tsx`.
   - Cada `_*DataTable.tsx`, `columns.tsx`, `*List.tsx` y `actions.server.ts` de sus tablas.
   - Forms (`*-form.tsx`, schemas Zod), dialogs, hooks `use*.ts`, server actions que consumen.
   - Primitivos compartidos que ya existen (`src/components/ui/*`, `src/shared/components/**`) para reusarlos en
     vez de crear paralelos (regla aprendida: "antes de inventar un mapa visual, buscar el precedente").
4. Las capturas "antes" de la feature (scratchpad de la Fase 0) y, si existe, la misma pantalla en GH para la
   prueba anti-GH.
5. Mediciones de partida (se anotan en el plan): `node scripts/ui/count-hardcoded-colors.mjs --path
   src/features/<Feature>`, cantidad de `'use client'`, archivos de más de 400 líneas, `useEffect` presentes.

### 1.2 Qué skills se cargan

Siempre se **barre** el catálogo con `list_skills` por eje antes de elegir (el listado de abajo es el piso, no el
techo) y siempre se pide por `pathSlug` completo (`autor/slug`). Si hay más de 4 skills, la lectura se reparte
en subagentes que devuelven solo reglas accionables; la columna vertebral se lee completa.

**Base fija (toda feature):**

| Skill | Para qué en este rediseño |
|---|---|
| `vercel-react-best-practices` (local, tool `Skill`) | Sección "Reorganización del código" del plan y bloque F de la auditoría. |
| `vercel-labs/react-best-practices` | Versión del catálogo: arquitectura de componentes, límites server/client. |
| `ibelick/baseline-ui` | Jerarquía, espaciado y tipografía sin slop. |
| `vercel-labs/web-design-guidelines` | Guías de interfaz (foco, formularios, estados, contenido largo). |
| `jakubkrehel/better-accessibility` | Foco, teclado, ARIA, hit areas, reduced motion. |
| `flornkm/prefer-container-queries` | `DISENO.md` §5: todo lo interno responde a `@container`, no al viewport. |
| `pbakaus/harden` | Estados vacío / carga / error, contenido largo, nulos. |

**Según el tipo de pantalla (se suman a la base):**

| Tipo | Skills |
|---|---|
| **Lista** (DataTable, tarjetas en mobile) | `pbakaus/adapt`, `emilkowalski/mobile-native`, `jakubkrehel/better-typography` (tabular, truncado), `shadcn-ui/shadcn` |
| **Ficha / detalle** (empleado, equipo, documento) | `jakubkrehel/better-layout`, `pbakaus/layout`, `pbakaus/typeset`, `shadcn-ui/shadcn` |
| **Formulario** (alta, edición, dialogs con form) | `ibelick/fixing-accessibility`, `jakubkrehel/better-writing` (solo microcopy nuevo: errores, vacíos; los textos existentes no se reescriben), `shadcn-ui/shadcn`, `emilkowalski/mobile-native` (zoom de iOS, teclados) |
| **Dashboard** (KPIs, gráficos) | `dammyjay93/interface-design`, `jakubkrehel/better-colors`, skill local `dataviz` (paleta y validador), `addyosmani/core-web-vitals` |
| **Panel de campo** (`/operator`, `/maintenance`, `/clothing`) | `emilkowalski/mobile-native`, `pbakaus/adapt`, `joe-bell/apple-web-app` (safe areas, viewport), `wshobson/wcag-audit-patterns` (contraste al sol, 48px), `iart-ai/micro-interaction` (feedback de toque) |
| **PDF / mail** | El catálogo no tiene skills de react-pdf ni de mail (búsquedas `pdf` y `email` sin resultados útiles al 2026-10-07). Se usa `DISENO.md` §6, `jakubkrehel/better-typography`, `jakubkrehel/better-colors` (contraste de los hex) y la memoria del repo "react-pdf en el servidor". Verificación rasterizando con `mupdf`. |
| **Login / error / 404** | `anthropics/frontend-design`, `ibelick/fixing-metadata`, `pbakaus/harden` |
| **Motion** (solo si la feature anima algo) | `ibelick/fixing-motion-performance`, `iart-ai/micro-interaction` |

**Solo en la auditoría** (además de las del plan): `ibelick/improve-ui`, `pbakaus/audit`,
`superfuture/design-review`, `accesslint/audit-and-fix`, `millionco/react-doctor`.

**Descartadas para este repo** (no se cargan): todo lo de Vue/Nuxt/SwiftUI/React Native/Three.js/Remotion, las
de Figma y generación de imágenes (`figma/*`, `leonxlnx/imagegen-*`), `antfu/antfu-design` (UnoCSS),
`shadcn-ui/migrate-radix-to-base` (el repo usa Radix), `mickadesign/fluid-functionalism` (suma una librería de
motion), `pbakaus/overdrive` / `pbakaus/delight` (choca con el modo instrumental de `DISENO.md`).
Retiradas del catálogo: `vercel-labs/next-best-practices` y `vercel-labs/next-upgrade` (usar la doc de Next en
`node_modules/next/dist/docs/` o Context7). Si un `pathSlug` de estas tablas da `Unknown skill`, se busca con
`list_skills` y se corrige acá.

### 1.3 Plantilla de `docs/rediseno-ui/features/<feature>.md`

Nombre del archivo en kebab-case (`indumentaria.md`, `empleados-ficha.md`). Secciones fijas, en este orden; una
sección que no aplica se deja con "No aplica: <motivo>", nunca se borra.

```markdown
# <Feature> — plan de UI

Estado: plan | aprobado | implementado | auditado (n) | cerrado
Fase del PLAN: <n> · Ficha del inventario: docs/rediseno-ui/inventario/<archivo>.md
Skills consultadas: <pathSlug — qué aportó>, una por línea (incluye vercel-react-best-practices)

## 1. Alcance
- Pantallas: ruta → componente raíz (archivo) — una por línea.
- Tablas: tableId → `_XxxDataTable.tsx` → sistema (DataTable / BaseDataTable / manual / SimpleTable).
- Dialogs, sheets y forms que abre cada pantalla.
- Fuera de esta feature aunque se vea en la pantalla (componentes compartidos: se piden al hilo principal).

## 2. Estado actual
Cada hallazgo con archivo:línea.
- 2.1 Problemas de UI (jerarquía, densidad, espaciado, tipografía, estados que faltan).
- 2.2 Accesibilidad (foco, labels, roles, contraste, teclado).
- 2.3 Responsive (qué se rompe a 768 y 375: scroll horizontal, controles chicos, dialogs).
- 2.4 Rasgos de GH presentes (contra la tabla de `DISENO.md` §7).
- 2.5 Deuda de código (componentes gigantes, duplicados, `useEffect` evitables, fetching en cliente,
  `'use client'` innecesario, imports pesados, clases construidas en runtime, `console.*`, `:any`).
- 2.6 Mediciones de partida: hardcodeados, archivos > 400 líneas, `'use client'`, `useEffect`.

## 3. Diseño propuesto, por pantalla
### <Ruta>
- Desktop (1440): estructura (PageHeader → KPI strip → Panel…), primitivos usados, tokens y clases de texto
  (`text-page-title`, `text-overline`, `.data-code`…), dónde va la barra de acento de 2px.
- Celular (375): qué se apila, qué pasa a panel inferior, acción principal (fija abajo si hay form), tabs.
- Estados: carga (skeleton con geometría real), vacío (condición real que lo dispara), filtrado a cero, error.
- Tablas: `meta.mobile` por columna:
  | columnId | role (title/subtitle/status/field/hidden) | priority | label |
- Dialogs: tamaño según `DISENO.md` §4.7 (confirmación / form corto / form largo / detalle / visor).

## 4. Reorganización del código
Cada punto cita la regla de vercel-react-best-practices por nombre (`async-parallel`, `server-serialization`…)
o la regla del repo (`.claude/rules/<archivo>.md`).
- 4.1 Componentes a partir (archivo actual → archivos nuevos, qué queda server y qué client).
- 4.2 Duplicados a unificar (contra qué primitivo compartido).
- 4.3 Límite server/client y serialización (qué props cruzan y cuáles se recortan).
- 4.4 Fetching (waterfalls a paralelizar, Suspense por bloque, React Query con keys estables, dedup).
- 4.5 Bundle (imports dinámicos, barrels, librerías pesadas).
- 4.6 Re-renders (estado derivado, memo, callbacks estables, componentes definidos dentro de otros).
- 4.7 Orden de implementación (pasos chicos, cada uno verificable por separado).

## 5. Qué NO se toca
Server actions, queries, validaciones Zod, permisos, textos de formularios oficiales, columnas, filtros,
exportaciones, orden por defecto, URLs y `data-testid`. Listar los puntos concretos de esta feature
donde la tentación de "mejorar" existe y por qué se deja.

## 6. Riesgos
| Riesgo | Dónde | Cómo se cubre |

## 7. Preguntas para el usuario
Solo lo que ni el ticket, ni el PLAN, ni DISENO.md resuelven. Vacío si no hay.

## 8. Checklist de verificación funcional
Copia de la ficha del inventario, con columnas "antes" y "después" para tildar en el navegador.

## 9. Auditorías
(Se agregan acá los informes, ver §3 de AUDITORIA-UI.md.)
```

**Criterio de "plan listo":** las 8 primeras secciones completas, cada pantalla del alcance con desktop y celular,
cada tabla con su `meta.mobile`, y cada punto de la sección 4 con su regla citada. Si la sección 7 tiene
preguntas, el plan queda en estado `plan` hasta que el usuario responda; no se implementa sobre supuestos.

---

## 2. Checklist de auditoría (después de implementar)

Cada ítem se marca **OK / Hallazgo / N/A**. N/A lleva motivo. "Cómo" dice qué evidencia hace falta; sin
evidencia el ítem es Hallazgo, no OK. `<F>` = carpeta de la feature (`src/features/<Feature>`).

### A. Fidelidad a `DISENO.md`

| # | Ítem | Cómo |
|---|---|---|
| A1 | Cero colores hardcodeados en la feature (salvo excepciones de `PLAN.md` §8, listadas con archivo) | `node scripts/ui/count-hardcoded-colors.mjs --path <F>` = 0 |
| A2 | Sin `rounded-*` salvo avatar, punto de estado y switch | `grep -rnE "rounded-(sm\|md\|lg\|xl\|2xl)" <F>` = 0 |
| A3 | Sin `shadow` en superficies en reposo (solo capas flotantes vía `--shadow-overlay`) | `grep -rnE "\bshadow(-sm\|-md\|-lg\|-xl)?\b" <F>` revisado uno por uno |
| A4 | Tipografía por rol: `text-page-title`, `text-section`, `text-overline`, `text-cell`, `text-label`, `text-caption`, `text-kpi`; sin tamaños sueltos (`text-[17px]`) | grep de `text-\[` y lectura de cada pantalla |
| A5 | `tabular-nums` en números comparables, `.data-code` en legajo/CUIT/patente/códigos, importes mono a la derecha | Lectura de celdas, contadores, paginación, KPIs |
| A6 | Densidad: controles 32px (`pointer:fine`), filas de 36px, padding de panel 16px, gaps 4/8/16/24/32 | DOM: `getBoundingClientRect().height` de input, botón y fila |
| A7 | Firma de 2px en lo activo/seleccionado (tab, fila seleccionada, KPI activo, campo con error); 1px en todo lo demás | Inspección visual + clases `shadow-[inset_…var(--primary)]` |
| A8 | Botones: solo las 6 variantes nuevas, una sola `primary` por vista, sin `transition-all` ni `active:scale` | `grep -rnE "variant=\"(default\|brand\|success\|outline\|surface\|destructive)\"\|transition-all" <F>` = 0 |
| A9 | Estados con `StatusBadge` + `statusToneMap` único (ícono o punto + texto, nunca solo color); sin mapas de estado locales | grep de `Record<` con colores/estados en `<F>` |
| A10 | `Panel` en lugar de `Card`; sin panel dentro de panel (adentro, `Section`) | grep `<Card` en `<F>` |
| A11 | `PageHeader` fuera de cards, máx. 1 primary + 2 secundarias visibles, resto en ⋯ | Lectura |
| A12 | z-index de la escala, sin `z-[n]`; alturas con `dvh`, sin `h-screen` | `grep -rnE "z-\[\|h-screen" <F>` = 0 |
| A13 | Íconos Lucide `strokeWidth={1.75}` en UI (2 en badges), 16px (14 en tabla) | Lectura |
| A14 | Claro y oscuro correctos (nada de `dark:` con paleta; tokens resuelven los dos) | Recorrido en los dos temas |

### B. Prueba anti-GH (`DISENO.md` §7)

| # | Ítem | Cómo |
|---|---|---|
| B1 | Sin logo, en cada pantalla se señalan ≥ 3 rasgos propios (header de tabla en mayúsculas sobre muted, cifras mono/tabulares, barra de 2px, tira de KPIs con divisores, esquinas rectas sin sombra) | Captura de cada pantalla con los 3 rasgos marcados |
| B2 | Ningún rasgo de GH de la tabla §7 sigue presente (fila de botones dashed, "Filas por página", KPI cards con ícono de color, tabs pill, hero de ficha, card centrada en login) | grep de `border-dashed` y "Filas por página" + lado a lado con GH |

### C. Responsive

| # | Ítem | Cómo |
|---|---|---|
| C1 | 1440, 768 y 375 px recorridos, claro y oscuro | Lista de capturas por ancho y tema |
| C2 | Sin scroll horizontal del body en ningún ancho (ni a 320 px ni con zoom 200%) | DOM: `document.documentElement.scrollWidth <= innerWidth` en cada pantalla |
| C3 | Áreas táctiles ≥ 44px con `pointer: coarse` (48px en paneles de campo) | DOM con emulación touch: alto/ancho de botones, checkboxes (hit area), ⋯ |
| C4 | Tablas en tarjetas bajo `@3xl/table`; `meta.mobile` aplicado según el plan; panel de detalle, filtros (con "ordenar por"), barra de selección y paginación compacta funcionan | Recorrido a 375 de cada tabla del alcance |
| C5 | Tabla↔tarjetas por container query, no por `useIsMobile`/`useMediaQuery` | `grep -rnE "useIsMobile\|useMediaQuery" <F>` justificado o 0 |
| C6 | Dialogs como panel inferior en mobile (`ResponsiveDialog`), `max-h-[92dvh]`, footer con safe-area | Recorrido a 375 |
| C7 | Formularios en grilla `@container` (1 → 2 → 3 columnas), acción principal fija abajo en mobile | Recorrido |
| C8 | Contenido largo y vacío no rompe el layout (nombres largos truncados con tooltip, celdas nulas con "—") | Probar con el registro de nombre más largo de la BD |
| C9 | Inputs a 16px en mobile (sin zoom de iOS), `min-w-0` en hijos flex/grid | Lectura + DOM |
| C10 | Tabs que no entran: scroll horizontal con fade, sin salto de línea | Recorrido a 375 |

### D. Accesibilidad

| # | Ítem | Cómo |
|---|---|---|
| D1 | Foco visible (outline de 2px) en todo control; orden de tab lógico | Recorrido solo con teclado |
| D2 | Todo operable con teclado: menús, filtros, tarjetas (abren detalle con Enter), dialogs (Esc cierra, foco atrapado y devuelto al trigger) | Recorrido con teclado |
| D3 | Nombre accesible en controles de solo ícono (`aria-label`), incluido cerrar, ⋯ y paginación | grep `size="icon` y verificar `aria-label` |
| D4 | Roles y semántica: `h1` único por página, `dl` en detalle y KPIs, `table` real en desktop, `role="status"` siempre montado para contadores que cambian | Lectura + árbol de accesibilidad |
| D5 | Labels asociados a cada campo; error con `aria-invalid` + `aria-describedby`; `*` de obligatorio con `aria-hidden` | Lectura de forms |
| D6 | Contraste AA: texto ≥ 4.5:1 (3:1 grande), bordes de input y estados ≥ 3:1, en claro y oscuro | Medición de los pares nuevos que no estén en `DISENO.md` |
| D7 | `prefers-reduced-motion`: sin pulso de skeleton ni translate en dialogs | Emulación en DevTools |
| D8 | Información nunca solo por color (estados con ícono y texto) | Lectura |
| D9 | Toast no tapa acciones fijas ni barra de selección; errores con `role="alert"` y sin autocierre | Recorrido a 375 con una acción que dispare toast |

### E. Formularios

| # | Ítem | Cómo |
|---|---|---|
| E1 | Todo `<Button>` dentro de un `<form>` que no guarda lleva `type="button"` (salvo triggers Radix con `asChild`) | grep de `<Button` en archivos con `<form` y revisión uno por uno |
| E2 | `Form` de shadcn + RHF + `zodResolver`; tipos con `z.infer`; `FormMessage` en cada campo; schemas compartidos fuera de archivos `'use client'` | Lectura (`forms.md`) |
| E3 | Submit con estado "Guardando…" y deshabilitado con `isSubmitting`; no se deshabilita por invalidez; foco al primer error | Probar enviar inválido y doble click |
| E4 | Date pickers individuales con escritura directa (`DatePicker`/`FormDatePicker`, DD/MM/AAAA, moment); el tipo de valor que recibe el form es el mismo que antes | Escribir una fecha a mano, una inválida y elegir otra del calendario; comparar el payload de la action antes/después |
| E5 | Selectores de empleados con `[legajo] Apellido Nombre` (legajo en mono) y `file_number` en el `select` de la query | Lectura + abrir el combo |
| E6 | `SearchSelect` conserva el contrato de `onChange`; M:M siguen mandando altas/bajas explícitas | Comparar payload antes/después |
| E7 | Nunca modales encadenados; confirmaciones con `ConfirmDialog`, sin `window.confirm/alert/prompt` | `grep -rn "window\.\(confirm\|alert\|prompt\)" <F>` = 0 |
| E8 | Mensajes de éxito con números reales cuando la action los devuelve | Probar la acción |

### F. `vercel-react-best-practices`

Una línea por regla aplicable. Antes de marcar Hallazgo se lee la regla en
`~/.claude/skills/vercel-react-best-practices/rules/<slug>.md` y se cita por nombre.

**F1. Waterfalls (crítico)**

| Regla | Qué se verifica en este repo |
|---|---|
| `async-parallel` | En `*List.tsx`, `*TabContent.tsx` y server actions: awaits independientes (datos + `getTablePreferences` + permisos) dentro de un `Promise.all`. grep de dos `await` seguidos sin dependencia. |
| `async-defer-await` | Ningún `await` cuyo resultado solo se usa en una rama (p. ej. permisos que solo importan si hay columna `actions`). |
| `async-cheap-condition-before-await` | Validaciones síncronas (params vacíos, flags) antes de consultar la BD. |
| `async-dependencies` | Si hay dependencias parciales, se arranca cada promesa lo antes posible (no se espera todo para empezar lo que no depende). |
| `async-suspense-boundaries` | Un `Suspense` con skeleton dedicado por bloque que carga sus datos (tabla, KPIs, gráfico), no uno por página. Con `cacheComponents: true` (`next.config.mjs`) todo dato dinámico tiene que quedar bajo un `Suspense`: lo confirma el build. |
| `server-parallel-fetching` | Componentes server hermanos cargan cada uno lo suyo en paralelo, no el padre todo y después los hijos. |
| `server-parallel-nested-fetching` | Fetch por ítem encadenado dentro del `Promise.all` del ítem, no en un segundo loop. |

**F2. Bundle (crítico)**

| Regla | Qué se verifica |
|---|---|
| `bundle-barrel-imports` | Componentes cliente no importan de `@/shared/components/common/DataTable` (index de 84 líneas) cuando solo usan un helper: import directo del archivo. `lucide-react` ya lo optimiza Next. |
| `bundle-dynamic-imports` | Recharts (33 archivos lo importan), visor de PDF, editores y diálogos pesados que no se ven al cargar, con `next/dynamic`. |
| `bundle-conditional` | Módulos de una función opcional (exportar a Excel, generar PDF) se importan al activarla (`await import()` en el handler). |
| `bundle-defer-third-party` | PostHog u otros terceros nuevos no se cargan antes de hidratar. |
| `bundle-preload` | Si un diálogo pesado es dinámico, se precarga en hover/focus del trigger. |
| `bundle-analyzable-paths` | Sin `import()` ni rutas de archivo armadas con variables. |
| Regla del repo (memoria) | react-pdf fuera del bundle cliente (cargado en el servidor; `transpilePackages` ya configurado). |

**F3. Servidor (alto)**

| Regla | Qué se verifica |
|---|---|
| `server-serialization` | Las props server→client llevan solo los campos que se renderizan (Prisma `select`, no objetos enteros). `meta.mobile` no agrega campos a la query. |
| `server-dedup-props` | No se pasa el mismo array dos veces transformado (ordenado/filtrado): se transforma en el cliente. |
| `server-cache-react` | Lecturas repetidas en el mismo request pasan por `cache()` (la sesión ya lo hace en `src/shared/lib/session.ts`; permisos usan `getCachedUserPermissions`). Nada nuevo las saltea. |
| `server-cache-lru` | Catálogos estáticos entre requests: solo si ya hay un mecanismo; no se agrega caché nueva sin pedirlo. |
| `server-auth-actions` | Toda server action nueva o movida valida sesión y permisos igual que antes. |
| `server-no-shared-module-state` | Sin variables de módulo mutables con datos del request. |
| `server-hoist-static-io` | Lecturas de archivos estáticos (logos, fuentes de PDF) a nivel de módulo. |
| `server-after-nonblocking` | Logs/emails que no bloquean la respuesta, en `after()` (solo si la feature ya los tiene; no se mueve lógica de negocio). |

**F4. Fetching en cliente (medio-alto)** — el repo usa React Query, no SWR

| Regla | Qué se verifica |
|---|---|
| `client-swr-dedup` (equivalente React Query) | Mismo dato = mismo `queryKey` en todos los consumidores; keys con primitivos; `staleTime` explícito; `initialData` desde el server cuando existe. Cero `useEffect` + `useState` para fetch. |
| `client-event-listeners` | Listeners globales (resize, keydown) uno solo, no uno por fila o tarjeta. |
| `client-passive-event-listeners` | Listeners de scroll/touch con `{ passive: true }`. |
| `client-localstorage-schema` | Preferencias en localStorage, si hay, versionadas y mínimas (las de tabla viven en la BD). |

**F5. Re-renders (medio)**

| Regla | Qué se verifica |
|---|---|
| `rerender-no-inline-components` | Ningún componente definido dentro de otro (celdas de `columns.tsx`, tarjetas, renderers). |
| `rerender-derived-state-no-effect` | Nada calculado en `useEffect` + `setState` que se pueda derivar en render (regla del repo `no-useeffect.md`). |
| `rerender-move-effect-to-event` | Lógica disparada por una interacción vive en el handler. |
| `rerender-derived-state` | Se suscribe a booleanos derivados (`isSelected`), no al objeto entero. |
| `rerender-defer-reads` | No se lee estado (searchParams, store) que solo se usa dentro de un callback. |
| `rerender-functional-setstate` | `setX(prev => …)` cuando depende del valor anterior; callbacks estables. |
| `rerender-memo` | Filas/tarjetas y celdas costosas memoizadas cuando el padre re-renderiza por estado ajeno. |
| `rerender-memo-with-default-value` | Defaults no primitivos (`[]`, `{}`) de props hoisteados a constantes de módulo. |
| `rerender-simple-expression-in-memo` | Sin `useMemo` para expresiones triviales. |
| `rerender-dependencies` | Deps de efectos y memos con primitivos (`columns` y `facetedFilters` estables). |
| `rerender-split-combined-hooks` | Hooks que mezclan dependencias independientes, separados. |
| `rerender-lazy-state-init` | `useState(() => …)` para valores iniciales costosos. |
| `rerender-transitions` / `rerender-use-deferred-value` | Filtrado/búsqueda en memoria con `startTransition` o `useDeferredValue` para que el input no se trabe. |
| `rerender-use-ref-transient-values` | Valores que cambian a alta frecuencia (scroll, drag) en refs. |

**F6. Render (medio)**

| Regla | Qué se verifica |
|---|---|
| `rendering-hydration-no-flicker` | Nada que cambie de layout después de hidratar (tabla↔tarjetas por CSS, tema sin flash). |
| `rendering-hydration-suppress-warning` | `suppressHydrationWarning` solo donde el mismatch es esperado (fechas relativas, tema), nunca para tapar un bug. |
| `rendering-conditional-render` | Ternario en vez de `&&` cuando la condición puede ser `0` o `NaN` (contadores). |
| `rendering-hoist-jsx` | JSX estático (íconos de estado, skeletons de filas) fuera del componente. |
| `rendering-content-visibility` | `content-visibility: auto` en la lista de tarjetas si la página permite 100 filas. |
| `rendering-activity` | `<Activity>` para paneles que se muestran/ocultan seguido y conservan estado (si aplica). |
| `rendering-usetransition-loading` | Estados de carga de acciones con `useTransition` en vez de un booleano manual. |
| `rendering-animate-svg-wrapper` | Animaciones sobre un `div` contenedor, no sobre el SVG. |
| `rendering-svg-precision` | SVGs nuevos (diagramas, íconos propios) con precisión reducida. |
| `rendering-resource-hints` | Fuentes vía `next/font`; sin `<link>` a fuentes o imágenes remotas en CSS. |

**F7. JavaScript (bajo-medio)**

| Regla | Qué se verifica |
|---|---|
| `js-index-maps` / `js-set-map-lookups` | Lookups repetidos en celdas o tarjetas con `Map`/`Set`, no `.find()` por fila. |
| `js-combine-iterations` / `js-flatmap-filter` | Sin cadenas `filter().map()` repetidas sobre la misma lista en render. |
| `js-tosorted-immutable` | `toSorted()` en vez de `sort()` sobre props o estado. |
| `js-early-exit` / `js-length-check-first` | Retornos tempranos en helpers de formato. |
| `js-hoist-regexp` | RegExp de máscaras (fecha, CUIT) a nivel de módulo. |
| `js-cache-function-results` | Formateadores (`Intl.NumberFormat`, moment con formato fijo) creados una vez, no por celda. |
| `js-batch-dom-css` / `js-cache-storage` / `js-min-max-loop` / `js-cache-property-access` / `js-request-idle-callback` | Solo si el código de la feature hace eso; si no, N/A. |

**F8. Avanzado (bajo)**: `advanced-event-handler-refs`, `advanced-use-latest`, `advanced-init-once`,
`advanced-effect-event-deps` — se revisan solo si la feature tiene listeners o efectos con callbacks del padre.

**No aplican a este repo** (se marcan N/A sin revisar): `async-api-routes` (no hay API routes, regla
`server-actions.md`), `rendering-script-defer-async` (no hay `<script>` manuales).

### G. Reglas del proyecto

| # | Ítem | Cómo |
|---|---|---|
| G1 | Fetching en cliente solo con React Query; invalidación tras mutaciones (`invalidateQueries` + `router.refresh()` donde ya existía) | grep `useEffect` cerca de llamadas a actions |
| G2 | Logger, sin `console.*` | `grep -rn "console\." <F>` = 0 |
| G3 | Sin `:any` ni `as any`; tipos inferidos de las actions o de Zod | `grep -rnE ":\s*any\b\|as any" <F>` = 0 |
| G4 | Tailwind sin clases construidas en runtime (`replace('text-'`, template literals con fragmentos, concatenación) | `grep -rnE "replace\('(text\|bg\|border)-" <F>` = 0 y revisión de cada `className={` con template literal: ningún fragmento de clase armado con `${…}` |
| G5 | Estructura de features (`components/`, `hooks/`, `actions/`, `types/`, `utils/`, `fallback/`); `page.tsx` delgado; TabContent server | Árbol de la carpeta |
| G6 | Permisos intactos: mismos `PermissionGuard`/`hasPermission`, mismos módulos/tabs/acciones, cargados en el server | Diff de las líneas con `permission` antes/después |
| G7 | DataTable según `datatable.md` (`paramNamespace`, `tableId`, `queryFn`, `fetchFacet`, export con `currentParams`) — lo certifica `table-expert` | Informe de `table-expert` |
| G8 | Legajo visible en toda superficie con empleados (`employee-file-number.md`) | Recorrido |
| G9 | moment, no date-fns; código en inglés, UI en español | `grep -rn "date-fns" <F>` = 0 |
| G10 | Fallbacks de Suspense son skeletons dedicados en `fallback/` | grep `fallback=` |

### H. Funcionalidad

| # | Ítem | Cómo |
|---|---|---|
| H1 | Ficha del inventario tildada "después" completa: cada acción, filtro, columna, orden, exportación, permiso y dialog | Sección 8 del plan de la feature |
| H2 | Mismos `data-testid` | `git diff` filtrado por `data-testid` |
| H3 | Mismos payloads a las server actions (forms, fechas, M:M) | Comparación en una alta y una edición |
| H4 | `npm run check-types` y `npm test` en verde; `npm run manual:check` en verde | Salida real pegada en el informe |
| H5 | Conteo global de hardcodeados no subió | `node scripts/ui/count-hardcoded-colors.mjs` vs. la última fila de la bitácora |
| H6 | Ningún bug previo se arregló en silencio: los encontrados están en `PLAN.md` §9 | Revisión del diff |

---

## 3. Informe de auditoría

Se agrega al final de `features/<feature>.md`, sección 9, uno por pasada:

```markdown
### Auditoría <n> — <AAAA-MM-DD>
Alcance: <commits / archivos auditados>
Evidencia recibida: capturas 1440/768/375 claro/oscuro · mediciones DOM · salida de check-types/test/manual:check · conteo
Skills: <pathSlug cargados en esta pasada>

| ID | Sev | Bloque | archivo:línea | Regla | Hallazgo | Fix | Estado |
|---|---|---|---|---|---|---|---|
| A-01 | S2 | A1 | src/features/X/components/Y.tsx:42 | DISENO §2.1 | `bg-yellow-100` en badge de estado | `StatusBadge tone="warning"` | abierto |

Resumen: S1 n · S2 n · S3 n · S4 n · N/A justificados: <lista>
Veredicto: EN CERO | NO CIERRA (motivo)
```

**Severidades**

| Sev | Qué es | Ejemplos |
|---|---|---|
| **S1 Bloqueante** | Cambia el funcionamiento, rompe en runtime, deja algo inaccesible o falta evidencia | Acción/filtro/columna/permiso perdido o distinto; payload distinto; botón que dispara submit; schema Zod en archivo `'use client'`; clase Tailwind construida en runtime; scroll horizontal del body a 375; control inoperable por teclado; texto bajo 4.5:1; check-types/test en rojo; ítem marcado OK sin evidencia |
| **S2 Alta** | Viola `DISENO.md`, una regla del repo o una regla crítica/alta de performance | Hardcodeado; rasgo de GH; menos de 3 rasgos propios; tabla ancha sin `meta.mobile`; área táctil < 44px; falta estado vacío/error; `async-*` o `bundle-*` o `server-*`; `useEffect` para fetch; `console.*`; `:any` |
| **S3 Media** | Calidad o performance de impacto medio sin efecto visible | `rerender-*`, `rendering-*`, componente > 400 líneas sin partir según el plan, duplicado no unificado |
| **S4 Menor** | Pulido | `js-*`, alineaciones de 1–2px, microcopy |

**Criterio de "en cero" (la feature cierra):**
- S1 = 0 y S2 = 0. Sin excepciones.
- S3: corregidos, o aceptados por el usuario y anotados en `PLAN.md` §9 con archivo y motivo.
- S4: pueden quedar abiertos si están listados en §9.
- Bloque H completo y ficha del inventario tildada.
- La re-auditoría revisa el diff de los fixes y vuelve a correr A1, C2, E1, G4 y H4 sobre toda la feature (son los
  que un fix puede romper sin que se note).

---

## 4. Reparto con otros agentes

| Paso | Quién | Recibe | Devuelve |
|---|---|---|---|
| 1. Plan | `ui-skills` | Nombre de la feature, ruta de la ficha del inventario, fase del PLAN | `features/<feature>.md` en estado `plan` + lista de preguntas para el usuario + skills cargadas. No toca código. |
| 2. Aprobación | Hilo principal → usuario | El plan | Plan en estado `aprobado` (o ajustado). Solo si la sección 7 tiene preguntas o el plan propone algo fuera de `DISENO.md`. |
| 3. Implementación de tablas | `table-expert` | La sección 3 (`meta.mobile`) y 4 del plan para cada tabla | Archivos tocados, conformidad con `datatable.md` y `datatable-filters.md`, conteo de registros contra la BD con los mismos filtros (tablas migradas). |
| 4. Implementación del resto | Hilo principal o un agente por módulo (`src/features/<Módulo>/**`; `shared/` y `components/ui/` son de solo lectura para él: los cambios ahí los pide al hilo principal) | El plan aprobado | Archivos tocados, desvíos del plan con motivo, ficha del inventario tildada, conteo de hardcodeados, salida de check-types/test/manual:check, evidencia del navegador (capturas por ancho y tema + mediciones DOM de C2, C3, A6). |
| 5. Auditoría | `ui-skills` | Diff + toda la evidencia del paso 3 y 4 | Informe (§3) agregado al archivo de la feature y veredicto. No corrige código: el fix vuelve al paso 3 o 4. |
| 6. Re-auditoría | `ui-skills` | Diff de los fixes | Nuevo informe hasta "EN CERO". |
| 7. Cierre | Hilo principal | Veredicto en cero | Fila en la bitácora de `PLAN.md` §10 y tilde de la fase. Sin commits salvo pedido del usuario. |

Reglas del reparto:
- Un archivo compartido lo edita un solo agente a la vez (`PLAN.md` §5).
- Ningún agente commitea. Ninguno aplica migraciones (este rediseño no las necesita).
- Si el implementador encuentra que el plan exige cambiar un comportamiento, frena y lo devuelve como pregunta;
  no lo resuelve por su cuenta.
- El auditor no acepta "lo probé" sin la evidencia concreta pedida en "Cómo"; la falta de evidencia es S1.

## Anexo — Crecimiento de datos (D7, pedido del usuario)

Bloque obligatorio en el plan y en la auditoría de cada feature:

- **Plan**: listar cada tabla, lista, historial, selector y diálogo con datos de la feature y clasificarlo como
  *acotado* (catálogo chico, ítems de un registro con tope natural) o *crece* (se acumula con el uso). Tomar la
  clasificación de `inventario/crecimiento.md` y corregirla si el código dice otra cosa.
- **Auditoría** (severidad S2 si falla): toda lista que *crece* usa paginación en servidor (DataTable con
  `queryFn`, o carga incremental/"ver más" en listas e historiales dentro de fichas y diálogos), con `take`/`skip`
  o cursor en la server action, orden estable y filtros aplicados en la consulta; los selectores de catálogos que
  crecen buscan en el servidor con límite. Evidencia: archivo:línea de la consulta.
- Prohibido para lo que crece: `SimpleTable`, `inMemory`, `findMany` sin `take`, traer todo y filtrar/paginar en
  el cliente, `limit` fijo que corta datos sin avisar.

<!-- estado: completo -->
