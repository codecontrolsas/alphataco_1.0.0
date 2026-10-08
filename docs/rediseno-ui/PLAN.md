# Rediseño integral de la UI — Plan de trabajo

> Guía viva. Se tilda a medida que avanza. Cualquier sesión que retome el trabajo empieza leyendo este archivo,
> `DISENO.md` (lenguaje visual) e `inventario/` (lo que la app hace hoy y tiene que seguir haciendo).

Rama: `feat/rediseno-ui` (desde `main`; este repo no tiene `dev`). **Entrega única**: un solo PR a `main` al final
(decisión del usuario). Sin commits salvo pedido explícito.

---

## 1. Objetivo y restricciones

**Objetivo**
1. alphataco deja de parecerse a GH: no solo colores, también estructura, densidad, tipografía y componentes.
2. Todo el sistema responsive; las tablas en celular se ven como tarjetas.
3. En cada módulo: optimizar el código cuando se pueda y unificar las maneras de hacer las cosas.
4. Arreglos puntuales pedidos: el header de las tablas con color hardcodeado (`DataTable.tsx:518`).

**Restricción absoluta: el funcionamiento no cambia.** Mismas pantallas, columnas, filtros, acciones, permisos,
exportaciones, validaciones y datos. Si para unificar algo hay que cambiar un comportamiento, se pregunta antes.
Lo que sigue sin tocarse: lógica de negocio, server actions (salvo la migración de tablas viejas, ver Fase 5),
triggers, permisos, textos de formularios oficiales. Un bug previo que aparezca se anota en §9 y se avisa; no se
arregla en silencio.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Identidad | **Operativo y preciso**: IBM Plex Sans + Plex Mono, números tabulares, esquinas rectas, líneas finas sin sombras, densidad, barra de acento de 2px como firma. Detalle completo en `DISENO.md`. |
| Color | Se mantiene el verde de marca, ajustado (contraste correcto en oscuro). Tokens semánticos de estado (success, warning, danger, info, neutral). Paleta de gráficos de 6 series + "Otros", validada (también daltonismo). |
| Tablas en mobile | **Tarjetas** (título, estado, 3-4 datos, ⋯) + panel inferior con todos los campos y acciones + panel de filtros (incluye ordenar) + barra de selección inferior + paginación compacta. Se resuelve una vez en el DataTable compartido. |
| Tablas viejas (`BaseDataTable`, 27) | Se migran al DataTable actual (con `table-expert`); las huérfanas se borran. |
| Alcance | Dashboard completo + login/recuperar contraseña + paneles de campo (`/operator`, `/maintenance`, `/clothing`) + PDFs y mails + páginas de error/404. |
| Entrega | Todo junto al final, una rama larga con checkpoints internos. |
| Guía | Este archivo + página de seguimiento en claude.ai. |

### Decisiones menores (con valor por defecto; confirmar o cambiar)

| # | Tema | Por defecto |
|---|---|---|
| — | Estado de D1-D5 | **Aceptadas** por el usuario el 2026-10-07 junto con el plan. |
| D1 | Tablas de presentación (resúmenes, matrices, totales: no paginadas ni filtrables) | Componente `SimpleTable` estilado, no se fuerzan al DataTable. **Solo para conjuntos acotados** (ver D7). |
| D7 | **Registros que crecen con el tiempo** (pedido del usuario) | Toda lista sobre datos que se acumulan (documentos, partes y sus líneas, pedidos, historiales, comentarios, entregas, órdenes, respuestas de checklist, facturas, auditorías) va **paginada en el servidor** (DataTable con `queryFn`, o carga incremental en listas/diálogos), nunca en `SimpleTable`, ni en modo en memoria, ni trayendo todo y filtrando en el cliente. Lo mismo para los selectores de catálogos grandes (búsqueda en servidor). Clasificación de todas las listas actuales en `inventario/crecimiento.md`. |
| D2 | Columnas que el usuario ocultó en desktop | También se ocultan en la tarjeta (mismo estado, mismas preferencias). |
| D3 | Módulo piloto | Indumentaria (`/clothing` + su catálogo): chico, con tabla, y ya tiene lógica mobile para comparar. |
| D4 | Login | Layout partido con firma técnica en mono (propuesta del diseño; la card centrada actual también es patrón de GH). |
| D5 | Respaldo de la rama larga | Commits intermedios en `feat/rediseno-ui` al cerrar cada fase **solo si el usuario lo pide**. |
| D6 | **Decidida: (a) se rediseñan acá** (usuario, 2026-10-07); en cada actualización del CLI se integran los `.new`. Archivos del módulo de soporte que instala `taskapp-cli` (`src/features/Ayuda/**` salvo `AyudaComponent`, `Tickets/`, `Manual/` y los propios de alphataco; ver `.taskapp-cli-manifest.json`) | A decidir al cerrar la Fase 0: (a) rediseñarlos acá y asumir los `.new` en cada actualización del CLI, (b) dejarlos con su estilo y solo ajustar tokens, o (c) llevar el rediseño a las plantillas del CLI (afecta a todos los proyectos que lo usan). |

---

## 3. Cómo se verifica cada checkpoint (protocolo fijo)

Ninguna fase se da por terminada sin pasar **todo** esto:

1. `npm run check-types` en verde y `npm test` en verde.
2. **Conteo de hardcodeados** (`node scripts/ui/count-hardcoded-colors.mjs`, Fase 0): el número nunca sube; el
   módulo trabajado queda en 0 (salvo excepciones de §8).
3. **Recorrido en navegador** (`npx next dev --webpack`, Chrome de la PC gamer), cada pantalla tocada en:
   desktop 1440px · tablet 768px · celular 375px · claro y oscuro.
4. **Ficha funcional** (`inventario/`): cada acción, filtro, columna, exportación y permiso de la pantalla se
   prueba y se tilda "después". Una ficha sin tildar = la fase no cerró.
5. **Prueba anti-GH** (`DISENO.md` §7): sin el logo, en la pantalla se reconocen al menos 3 elementos propios
   (header de tabla en mayúsculas sobre muted, cifras mono/tabulares, barra de acento de 2px, tira de KPIs con
   divisores, esquinas rectas sin sombra). Comparación lado a lado con la misma pantalla de GH.
6. `npm run manual:check` en verde (si cambia el nombre de un botón o una pantalla, se actualiza la guía).
7. Al cerrar la fase: `git merge origin/main` en la rama para que los conflictos no se acumulen.
8. **Auditoría `ui-skills`** de cada feature tocada (ver §3.1) con su informe sin hallazgos abiertos.
9. **Crecimiento (D7)**: ninguna lista de datos que crecen quedó sin paginación en servidor; verificado contra
   `inventario/crecimiento.md` y con la consulta real (`take`/`skip` o cursor en la server action).

### 3.1 Planificación y auditoría de cada feature con `ui-skills` (pedido del usuario)

Ninguna feature se rediseña "de una". Cada una pasa por el agente `ui-skills` **dos veces**, con la skill
`vercel-react-best-practices` incluida en las dos:

1. **Plan de UI (antes de tocar código).** `ui-skills` barre el catálogo, analiza las pantallas de la feature
   contra `DISENO.md` y su ficha de `inventario/`, y escribe `docs/rediseno-ui/features/<feature>.md`: cómo
   queda cada pantalla (desktop y celular), qué primitivos usa, qué código se ordena o unifica (componentes
   gigantes, duplicados, fetching, re-renders, bundle) y qué NO se toca. Se implementa contra ese plan.
2. **Auditoría (después de implementar).** `ui-skills` audita lo hecho: fidelidad al plan y a `DISENO.md`,
   accesibilidad, responsive real, prueba anti-GH, y la pasada de `vercel-react-best-practices` (waterfalls,
   server vs client, serialización, bundle, re-renders, hidratación). Los hallazgos se corrigen y se re-auditan
   hasta quedar en cero; el informe se agrega al mismo archivo de la feature.

El protocolo completo (plantilla del plan y checklist de auditoría) está en `AUDITORIA-UI.md`.

---

## 4. Fases

Tamaños relativos: S < M < L < XL. Camino crítico: 0 → 1 → 2 → 3 → 4; después 5-8 se reparten por módulo.

### Fase 0 — Línea base y red de seguridad · S
- [x] Script `scripts/ui/count-hardcoded-colors.mjs` (paleta Tailwind con todas las utilidades y `dark:`,
      blanco/negro, arbitrarios, `#hex`, `rgb(`/`hsl(`; excluye PDFs, mails, `ui/chart` e ícono de Google).
      Línea base en §10: **2900 en 322 archivos**.
- [x] `inventario/`: una ficha por pantalla (53 `page.tsx`) y por tabla (72 DataTable + 27 BaseDataTable +
      22 manuales + 5 sueltas): columnas, filtros, orden por defecto, acciones por fila, acciones masivas,
      exportación, permisos que condicionan algo, dialogs que abre. Semiautomático (script) + completado a mano.
- [x] Capturas "antes": se toman **por feature, justo antes de tocarla** (parte del plan `ui-skills`, §3.1), así
      reflejan exactamente el estado previo a cada cambio. Se guardan en el scratchpad, no en el repo.
- [x] Las 27 `BaseDataTable`: **18 en uso (se migran) · 9 huérfanas (se borran)**. Detalle en `inventario/README.md`.
- [x] Protocolo de plan y auditoría por feature (`AUDITORIA-UI.md`).
- [x] **Checkpoint 0**: aprobado por el usuario el 2026-10-07 ("metele con tus recomendaciones"), con D6 = (a).

### Fase 1 — Fundamentos: tokens, tipografía y shell · M
_Un solo agente; toca archivos compartidos por todo el sistema._
- [x] `globals.css`: tokens de `DISENO.md` §2 (neutrales grafito, marca ajustada, `--canvas`, `--input` propio,
      5 tonos de estado × 4 tokens, `--chart-1..6` + otros, radios, `--shadow-overlay`, escalas, z-index).
      Borrar la regla `summary::after` con imagen de sitepoint y los restos del template de landing.
- [x] Tipografía: IBM Plex Sans (400/500/600) + Plex Mono (400/500) con `next/font`; utilidades `tabular` y mono.
- [x] Alias de compatibilidad: `button.tsx` (11 variantes → 6 semánticas, nombres viejos mapeados a tokens;
      sin `transition-all`), `badge.tsx` (tonos de estado), `card.tsx` (sin colores fijos ni `[&_*]:text-…`).
      Ningún consumidor se toca todavía.
- [x] `DataTable.tsx:518` y `data-table.tsx:282`: header con tokens (arreglo pedido).
- [x] Shell: contenedor de página responsive (gutter 16/24px, `max-w` opcional) en `dashboard/layout.tsx:66`;
      header y sidebar alineados a la spec; `PageHeader`.
- [x] Un solo toaster (sonner): migrar los 12 archivos de `use-toast` y borrar `toast.tsx`, `toaster.tsx`,
      `use-toast.ts`.
- [x] Login, recuperar contraseña (sacar banner partido y copy de GH), 404 y error.
- [x] **Checkpoint 1** (verificado 2026-10-07 con Chrome DevTools en esta PC: login, recupero, dashboard, Empleados, Comercial, Mantenimiento, 404; 1440/768/375; claro/oscuro; consola sin errores): login → dashboard → 5 módulos distintos a 1440 y 375px, claro y oscuro; nada roto aunque se
  vea a medio camino; conteo sin subir.

### Fase 2 — Primitivos compartidos · L
_Diseñados y auditados por `ui-skills` (con `vercel-react-best-practices`): son la base de todo lo demás._
_Cada primitivo es un archivo distinto: se pueden construir en paralelo. Se prueban en una página de ejemplo
local (no commiteada). Los consumidores se migran con su módulo, no acá._
- [x] `ResponsiveDialog` generalizado (dialog en desktop / panel inferior en mobile; tamaños; scroll; footer).
- [x] `ConfirmDialog` + `useConfirm()` (reemplaza los 57 `AlertDialog` armados a mano).
- [x] `DatePicker` único con escritura directa (moment, DD/MM/YYYY; modos fecha / mes / mes-año) + `FormDatePicker`
      para react-hook-form. **Adaptadores de formato**: cada uso conserva el tipo de valor que hoy espera su form.
- [x] `SearchSelect` único (simple y múltiple, búsqueda, async, en mobile como panel). Conserva el contrato de
      `onChange` de cada lugar (las M:M siguen mandando altas/bajas explícitas). Labels de empleados con legajo.
- [x] `StatusBadge` + `statusToneMap` único; `StatCard` / tira de KPIs; `EmptyState` (default / filtrado / error);
      `RowActions` (botones en desktop, ⋯ en mobile; los permisos se siguen decidiendo donde hoy); `Panel`;
      `SimpleTable` (D1).
- [x] **Checkpoint 2** (2026-10-08, página `dev-primitivos` en navegador 1440/390 + auditoría `fase-2-auditoria.md` en cero): cada primitivo en desktop y mobile, teclado, foco y casos límite (fecha inválida, 400
  opciones, doble envío del confirm, botones `type="button"` dentro de forms).

### Fase 3 — DataTable: desktop nuevo + modo mobile · XL
_Con `table-expert` para la lógica y `ui-skills` para el plan y la auditoría de la UI (§3.1). Archivos de `src/shared/components/common/DataTable/**`._
- [ ] `ColumnMeta` tipado (`declare module '@tanstack/react-table'`): `title`, `excludeFromExport`,
      `mobile: { role: title|subtitle|status|field|hidden, priority, label, hideLabel }`.
- [ ] Desktop según spec: toolbar (buscador + chips de filtros activos + "Filtros (n)"), header 32px en
      mayúsculas sobre muted, filas 36px, barra de selección en lugar de la toolbar, pie "1–50 de 387".
      Se conservan los `data-testid` existentes (Cypress).
- [ ] Mobile por **container query** (sin `useIsMobile`: no hay parpadeo al hidratar): `DataTableCards`,
      `DataTableCard` (reusa los `cell` con `flexRender`), `DataTableDetailSheet`, `DataTableMobileFilters`
      (mismos filtros + **ordenar por**), `DataTableSelectionBar`, paginación compacta, skeleton de tarjetas.
      Exportar, columnas y filas por página siguen disponibles (menú ⋯).
- [ ] Heurística por defecto para tablas sin anotar + `meta.mobile` a mano en las 9 anchas (Empleados ~39,
      Vehículos ~33, Otros equipos ~29, bajas ~28/25, Preparte ~23, Docs equipos ~21, Tipos docs ~14,
      Facturación ~14).
- [ ] Prop de escape `mobileLayout="table"` (deuda listada en §9 si se usa). `DOCS.md` actualizado.
- **Checkpoint 3**: 3 tablas distintas (con selección y acciones masivas / con filtros de texto y fecha / en
  memoria): URL, filtros, orden, paginación, export, preferencias guardadas, selección entre páginas — igual que
  antes — y tarjetas, panel de detalle, panel de filtros y barra de selección en 375px.

### Fase 4 — Piloto: Indumentaria · M
- [ ] Plan de UI de la feature por `ui-skills` (§3.1).
- [ ] Rediseño completo del módulo con el proceso definitivo: ficha antes/después, variantes de botón nuevas,
      primitivos, `PageHeader`, cero hardcodeados, mobile.
- [ ] Auditoría `ui-skills` + `vercel-react-best-practices` en cero.
- **Checkpoint 4**: se ajusta el proceso acá (no en el módulo 10). Este módulo es el molde de los demás.

### Fase 5 — Migración de tablas · XL
- [ ] 18 `BaseDataTable` en uso (ver `inventario/README.md`): las que se migran, recreadas con `table-expert` (Prisma, paginación server, facets lazy,
      export, `paramNamespace`, `tableId`, skeleton, permisos); las huérfanas, borradas tras confirmar importadores.
      Primero las que ya tienen una hermana nueva en el mismo módulo.
      **Validación por tabla**: con los mismos filtros, misma cantidad de registros que la vieja (contra la BD),
      mismos filtros, mismo orden, mismas acciones.
- [ ] 22 tablas manuales + 2 TanStack directo + 3 `<table>` + listas a mano: según `inventario/crecimiento.md`
      (D7): las que crecen → DataTable paginado en servidor (o carga incremental si es una lista/historial dentro de
      una ficha o diálogo); las acotadas → `SimpleTable`.
- [ ] DataTables que hoy cargan todo en memoria (`inMemory`) o traen todo al cliente: las que crecen pasan a
      paginación en servidor.
- **Checkpoint 5**: fichas tachadas, conteos iguales, check-types.

### Fase 6 — Módulos, por tandas · XL
_Cada módulo: plan de UI por `ui-skills` → implementación → auditoría `ui-skills` + `vercel-react-best-practices`
(§3.1). Un agente por módulo (los archivos de `shared/` son de solo lectura para ellos). En cada uno: variantes de botón
nuevas, `StatusBadge`, `ResponsiveDialog`/`ConfirmDialog`/`DatePicker`/`SearchSelect`, `PageHeader`, formularios
responsive, cero hardcodeados, tabs que no entren en mobile → segmented/scroll, y optimización/unificación del
código del módulo sin cambiar comportamiento._

Orden (de menor a mayor riesgo):
- [ ] 6.1 Configuración (empresa, usuarios y roles, catálogos, datos fiscales)
- [ ] 6.2 Empleados (listado, ficha, diagramas) y Selección
- [ ] 6.3 Equipos (listado, fichas, bajas, cubiertas)
- [ ] 6.4 Documentación (listas, detalle, tipos de documento)
- [ ] 6.5 Operaciones (gestor de pedidos, partes diarios, detalle del parte) — la más pesada
- [ ] 6.6 Mantenimiento (validar, taller, vista taller, nuevo pedido, desvíos, gomería)
- [ ] 6.7 Comercial y Facturación
- [ ] 6.8 Formularios y Checklists
- [ ] 6.9 Dashboard (tira de KPIs, gráficos con la paleta nueva, estadísticas)
- [ ] 6.10 Ayuda (tickets y manual)
- **Checkpoint por tanda**: protocolo §3 completo sobre todas las pantallas del módulo.

### Fase 7 — Paneles de campo · L
- [ ] Plan y auditoría `ui-skills` de cada panel (§3.1).
- [ ] `/operator`, `/maintenance` (QR del equipo: checklist, pedido, gomería) y `/clothing` si no fue el piloto.
      Controles de 48px, acción principal fija abajo, alto contraste (se usan en taller y en la calle).

### Fase 8 — PDFs y mails · M
- [ ] Tema PDF (constantes, react-pdf no entiende variables CSS) con la paleta nueva y Plex registrada; cargar
      react-pdf fuera del bundle; verificar rasterizando con `mupdf`. Documentos oficiales (RO 06-1, etc.): se
      cambia la piel, nunca se recortan secciones.
- [ ] Mails: misma paleta como constantes, fallback Arial, probados en un cliente real.

### Fase 9 — Limpieza y cierre · M
- [ ] Borrar variantes viejas de Button/Badge/Card (TypeScript marca cualquier uso residual), date pickers y
      selects duplicados, `BaseDataTable` y su carpeta, toast de shadcn, assets huérfanos de `public/`.
- [ ] Conteo de hardcodeados = 0 (salvo §8). Barrido de código muerto.
- [ ] Recorrido final completo contra `inventario/` + `npm run build` (contra la BD del compose, nunca prod) +
      imagen Docker probada.
- [ ] Actualizar `DataTable/DOCS.md`, el manual de uso (nombres de botones/pantallas que cambiaron) y las reglas
      del repo que quedan viejas (`datatable.md`: `<Card><CardContent>` → `Panel`; `BaseDataTable`; date pickers;
      toasts). Con aprobación del usuario.
- [ ] Tests: recién con el OK explícito del usuario.
- [ ] PR único a `main`.

---

## 5. Trabajo con agentes

- **Archivos compartidos, un agente por vez** (nunca en paralelo): `globals.css`, `src/components/ui/*`,
  `src/shared/components/**`, `src/app/dashboard/layout.tsx`, `src/features/Layout/**`.
- **Módulos en paralelo** recién después del Checkpoint 3: un agente por `src/features/<Módulo>/**`; si necesita
  un cambio en un primitivo, lo pide al hilo principal.
- `table-expert` para toda tarea de DataTable (Fases 3 y 5). `ui-skills` para diseño, revisión y la pasada de
  performance (Fases 1, 2, 3, 6, 7).
- Cada agente de módulo devuelve: qué tocó, qué quedó afuera, su ficha del inventario tildada y su conteo de
  hardcodeados.

---

## 6. Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| Regresión funcional al migrar las 27 tablas viejas (cambia el fetching) | Ficha por tabla, conteo de registros contra la BD, `table-expert`, prueba en navegador. |
| Perder una opción al pasar a tarjetas (ordenar, exportar, columnas, filas por página) | Todas tienen lugar en el panel de filtros o el menú ⋯; están en la ficha del Checkpoint 3. |
| Acciones de fila que no entran en un menú | `RowActions`; mientras no se migre una tabla, sus acciones se muestran tal cual en la tarjeta. |
| Cambio de formato de fecha/valor al unificar `DatePicker`/`SearchSelect` | Adaptadores por uso; no se tocan schemas Zod ni server actions. |
| `<Button>` dentro de `<form>` que dispara submit | Todo botón nuevo dentro de forms lleva `type="button"` (lo revisa el checkpoint). |
| Clases Tailwind armadas en runtime | Mapas de clases completas; grep de `replace('text-'…)` en cada checkpoint. |
| Doble DOM tabla+tarjetas | Acotado a la página (≤50 filas); medido en la tabla de 39 columnas. |
| Rama larga con conflictos | `git merge origin/main` al cerrar cada fase. |
| Contraste de líneas finas | Tokens medidos (`DISENO.md`); verificación en claro y oscuro. |

---

## 7. Fuera de alcance

Lógica de negocio, permisos, server actions (salvo Fase 5), triggers/migraciones (este plan no necesita ninguna),
textos de documentos oficiales, contenido de dominio. Los bugs de la app detectados al escribir el manual
(ver resumen del 2026-10-07) siguen siendo tickets aparte.

## 8. Excepciones permitidas al "cero hardcodeados"

Colores que son **datos** (color de rol, de tipo de diagrama, guardados en la BD), colores de marca de terceros
(ícono de Google), diagramas técnicos con color de dominio (posiciones de cubiertas) y las constantes de PDFs y
mails (que igual siguen la paleta nueva). Cada excepción se lista acá con su archivo.

## 9. Registro de deuda y hallazgos

_(Se completa durante el trabajo: usos de `mobileLayout="table"`, bugs previos encontrados, decisiones tomadas en
el camino.)_

### Hallazgos de la Fase 3
- Operaciones → Gestor de Pedidos: la cabecera "Gestión de Pedidos" (fuera del DataTable) tiene un contenedor propio `overflow-y-auto flex justify-between` que a 375px deja "Nuevo Pedido" fuera de vista (se llega con scroll horizontal). Previo; se resuelve en la Fase 6.5.
- **Bug previo (P-15)**: `DataTableFilterOptions.tsx:39-48` — al ocultar un filtro borra el param SIN namespace y navega con `router.replace` aunque la tabla esté en client-side mode: el filtro queda aplicado sin chip visible. No se arregla en el rediseño; candidato a ticket.
- **P-7 "Seleccionar los N"**: no se implementa (funcionalidad nueva).
- `exceljs` en el bundle de cliente de toda página con DataTable: el plan lo pasa a `import()` en el clic.

### Hallazgos de la Fase 2
- S4 abiertos (`features/fase-2-auditoria.md`): `search-select.tsx` 461 líneas; `indexOptions` normaliza aunque el combo no se abra; un `TooltipProvider` por fila en `RowActions` (en el dashboard ya hay uno global del sidebar); `SimpleTable` scroll sin fade (se decide en Fase 3); remanente de reset programático con foco en el DatePicker.
- Fuera de alcance de la Fase 2, de la Fase 1: la ✕ del toast mide 24px con puntero grueso y los toasts de error que no se migraron con `duration: Infinity` se cierran a los 4s. Revisar al tocar sonner.
- `src/shared/hooks/useDebounce.ts` duplica al nuevo `use-debounced-value.ts` (unificar en Fase 9).
- `dev-primitivos/` está en `.git/info/exclude` y Tailwind v4 no escanea lo excluido: una clase que solo exista ahí no se genera. Borrar la carpeta antes del PR final.

### Hallazgos de la Fase 1
- **Errores de consola previos** en Configuración → Usuarios: `Decimal` de Prisma pasado a un Client Component (`active_working_days`/`inactive_working_days`) y hydration mismatch de `moment().fromNow()` ("hace un día" vs "a day ago": el locale de moment no es el mismo en servidor y cliente). No son del rediseño.
- **Desborde horizontal a 375px** por la toolbar y la paginación del DataTable (previo); en celular amplía el layout viewport y hace que los dialogs midan más que la pantalla. Lo resuelve la Fase 3.
- **Cookie `actualCompName` muerta** (código muerto, Fase 9): los `generateMetadata` de 10 `page.tsx` de
  `/dashboard/*` la leen para el título de la pestaña, pero nada en alphataco la escribe. En un navegador que tuvo
  GH en `localhost` el título dice "… | Grupo Horizonte". Para usuarios reales cae al fallback de la BD.
- **Sidebar a 768px**: queda expandido (256px) y aprieta el contenido; evaluar colapsarlo a íconos en tablet
  cuando se rediseñe la navegación (decisión de diseño, no bug).
- **S4 abiertos de la auditoría** (`features/fase-1-auditoria.md`): A-13 descripción de toast sin atenuar en
  oscuro, A-14 foco débil del toast enfocado, A-15 borde verde en el badge de novedad de `DiagramMassiveForm`
  (se resuelve en Empleados), A-16 nota del plan.
- Pendientes de performance fuera de alcance: `src/lib/utils.ts` re-exporta server actions junto a `cn`;
  `PostHogProvider` en el bundle inicial; cookie `theme` sin lector.

### Bugs previos encontrados en la Fase 0 (no se arreglan en el rediseño; decisión del usuario si van a tickets)

Detalle por pantalla en la sección final de cada `inventario/*.md`. Agrupados:

- **Permisos que apuntan a módulos viejos** (nadie ve el control): KPIs (`dashboard:kpis:*`), "Verificar
  documentos" (`documentacion:tipos-docs-*`), Tipos de reparación y Grupos (`equipos:*`), "Pedidos de
  Mantenimiento" desde Equipos (siempre "Sin acceso"), "Eliminar ítem" del asistente de órdenes.
- **Acciones sin chequeo de permisos**: validar/rechazar/reasignar solicitudes, planificar y rechazar pedidos,
  aprobaciones del taller, "Resolver desvíos", nuevo pedido; dar de baja/activar empleado; vincular/desvincular
  empleado a usuario; subir/ver documentos de empresa; acciones de documentos en el servidor; editar tipo de
  documento; documentos de contrato; documentos de otro equipo y medidas de cubierta; unidades de medida (borrar
  con `update`); "Crear contrato" exige `update`.
- **Fallos silenciosos / datos**: el update de tipos de reparación siempre informa éxito; el form de Grupos no
  valida ni refresca; guardar un checklist que falla no muestra error; búsqueda de respuestas de checklist
  probablemente rota (`OR: []`); "Subir documento" de un tipo multirecurso lo sube a todos; el ZIP de documentos
  baja solo la página visible; el Excel de partes y de novedades ignora los filtros; un equipamiento pierde el
  vínculo al aprobarse su solicitud; QR de un vehículo recién creado apunta a `?equipment=undefined`.
- **Probablemente roto en la UI**: gomería por QR (`DialogTitle` sin `Dialog`); "Seleccionar por característica"
  no hace nada; botón "Imprimir" sin acción; `/reset_password/confirm` queda en "Procesando…"; botón "Mecánico" del
  login QR igual a "Invitado"; hooks después de un `return` en `WorkOrderDetail.tsx`.
- **Formularios**: obligatorios mal marcados en el form de vehículo; valores internos de enums en la vista de la
  ficha de empleado; "Cancelar" no descarta cambios; legajo ausente en el header de la ficha y en Diagramas
  cargados; "máximo 30 días" sin validar; "Actualizar" de Cargar Diagrama no se deshabilita.
- **Ya se corrigen solos con el rediseño** (son de UI, no de funcionamiento): `date-fns` (5 archivos), `use-toast`
  viejo, fechas sin escritura directa, 4 filtros visibles en vez de 3, filtros que faltan por columna, textos con
  copy de GH o de otro formulario, 404 y login QR sin modo oscuro, buscador oculto en tablas que lo soportan.

- **Posible fuga entre empresas** (prioritario, fuera del rediseño): `getMaintenanceOrdersForOtherEquipment` no
  filtra por `company_id`; `getPreparteKpiData` incluye prepartes con `company_id IS NULL`.

### Crecimiento de datos (D7) — resultado de `inventario/crecimiento.md`

182 superficies: **13 de riesgo alto**, 59 medio, 110 bajo. Las 18 `BaseDataTable` paginan en el navegador (ninguna
en servidor); 64 de 72 DataTables paginan bien. Riesgo alto: partes diarios de Comercial sin filtro obligatorio,
grilla y carga masiva de diagramas (traen el historial completo de cada empleado), diagramas de la ficha del
empleado, respuestas de formularios, equipos con desvíos, conteo de respuestas en Formularios, facetas que cuentan
en JS, export de reportes de diagramas sin ventana de fechas, y dos stores globales (`getStoreDocuments`,
`getStoreEmployees`) que cargan todo y nadie lee. Datos que se cortan en silencio: OT del operario (`take: 50`),
tickets (`limit: 200`), ZIP de documentos (solo la página). Se corrigen en la fase del módulo de cada uno (sin
cambiar qué se ve, solo cómo se consulta).

### Decisiones tomadas en el camino

- **Equipos → Mantenimiento** está viva (monta 5 tablas viejas en uso): se rediseña y se migra igual que el resto,
  aunque el manual no la documente.

## 10. Bitácora

| Fecha | Fase | Qué se hizo | Conteo hardcodeados |
|---|---|---|---|
| 2026-10-08 | 3 | **Pausa pedida por el usuario.** Auditoría `fase-3-auditoria.md` cortada a mitad (puede estar incompleta: relanzar según RETOMAR). Dev server y compose detenidos; tarea horaria de retomar cancelada. Pendiente de verificar en navegador: export Excel, detalle de tarjeta, Ausencias en dialog, costo del DOM doble, Cypress de Preparte. | 2707 |
| 2026-10-08 | 3 | Ola 2 integrada y verificada en navegador (Preparte 1440/375: selección→barra con "Cambiar estado", tarjetas, sheet de filtros con URL namespaced y conteo correcto, chip; Empleados: selección entre páginas, pie "1–10 de 108"). Fixes al verificar: checkbox marcado invisible en dark, título de tarjeta partido, ⋯ recortado con "Filtros (1)", select de filas truncado. Auditoría `ui-skills` en curso (`fase-3-auditoria.md`). | 2707 |
| 2026-10-08 | 3 | Ola 1 (B1 toolbar, B2 filtros hook+cuerpo+chip, B3 desktop/pie/estados, B4 tarjetas/detalle/selección) y ola 2b (`meta.mobile` en 9 tablas; "Cambiar estado" de Preparte duplicado transitorio en `selectionActions`) completas, check-types verde. Arranca la ola 2: integración en `DataTable.tsx` (`table-expert`). | 2707 |
| 2026-10-08 | 3 | Ola 0 verificada en navegador a 375px: sin desborde de página en Usuarios, Empleados y Gestor de Pedidos; tabla en dialog sin colapsar. Fix al verificar: grupo izquierdo de la toolbar con base `flex-[1_1_16rem]` (se encogía y se montaba sobre Excel/Filtros). Arrancan en paralelo ola 1 (B1-B4) y ola 2b (C1-C3) con `table-expert`. | 2707 |
| 2026-10-08 | 3 | Plan `features/fase-3-datatable.md` completo (ejecuta `table-expert`). Decisiones §7 con recomendación salvo P-7 (no se hace: funcionalidad nueva) y P-15 (bug previo a §9). Arranca la ola 0 (tipos, `mobile-columns`, raíz contenida, fade). | 2707 |
| 2026-10-08 | 2 | **Fase 2 cerrada.** Auditoría `ui-skills` en cero (S2 7 y S3 4 corregidos: reset del DatePicker, Enter con texto pendiente no envía, DrawerDescription, retry:false, conteo de KpiStrip, ✕ de chips 44px, sticky z-10, fade en tabs, `@supports` del fade, date-picker partido en 3 archivos, stopPropagation en RowActions). Re-verificado en navegador. Arranca la Fase 3 (plan `ui-skills` + `table-expert`). | 2707 |
| 2026-10-08 | 2 | Ola 1 completa (5 agentes, check-types verde). Pendientes compartidos aplicados (`scroll-fade-x` en globals.css, `table.tsx` sin `use client`). Página de ejemplo local (`dev-primitivos`, en `.git/info/exclude`) recorrida en navegador: confirm async/doble envío, DatePicker (escritura/inválida/calendario), SearchSelect (sin acento, aviso fuera del scroll, drawer anidado en mobile) OK. Auditoría `ui-skills` en curso (`fase-2-auditoria.md`) con 5 bugs de entrada. | 2707 |
| 2026-10-08 | 2 | Ola 0 completa y verificada en navegador (confirmación a 1440/375, tabs, selects). Hallazgo: a 375px las tablas con toolbar/paginación anchas desbordan la página (previo; se resuelve en la Fase 3, que pasa a prioridad). Arranca la ola 1: 5 agentes en paralelo (`fase-2-ola1-A..E.md`). | 2707 |
| 2026-10-08 | 2 | Plan `features/fase-2-primitivos.md` completo (10 primitivos + revestimiento de 14 wrappers como ola 0; 11 decisiones en §7 tomadas con la recomendación). Arranca la ola 0 (un agente); progreso en `features/fase-2-progreso.md`. | 2711 |
| 2026-10-07 | 1 | **Fase 1 cerrada.** Verificación en navegador OK; ajustes al verificar: spinner del toast de carga centrado en todo el aviso (contenedor del ícono `relative size-4`) y título del recupero partido en título + bajada (mismo texto). Arranca la Fase 2 (plan `ui-skills`). | 2711 (298 archivos) |
| 2026-10-07 | 1 | Auditoría `ui-skills` en cero (`fase-1-auditoria.md`): S1 5 · S2 1 · S3 6 corregidos; 4 S4 abiertos (A-13..A-16). Falta solo la verificación en navegador (sin Chrome conectado). | 2711 |
| 2026-10-07 | 1 | Implementación Fase 1 completa (pasos 1-8 + controles de código; `fase-1-progreso.md`). check-types verde. Auditoría `ui-skills` en curso (`fase-1-auditoria.md`). Verificación en navegador pendiente: no hay Chrome conectado. | 2718 (300 archivos; los 2 de más son los hex de `themeColor`, pedidos por el plan) |
| 2026-10-07 | 1 | Plan `features/fase-1-fundamentos.md` completo (sin preguntas bloqueantes; las 3 decisiones a validar se toman con la recomendación del plan). Arranca la implementación de la Fase 1 (pasos 1-8 de §4.7), progreso en `features/fase-1-progreso.md`. | 2900 |
| 2026-10-07 | 1 | Checkpoint 0 aprobado; D6 = (a). Arranca la Fase 1: plan `ui-skills` en `features/fase-1-fundamentos.md`. | 2900 |
| 2026-10-07 | 0 | Clasificación de crecimiento (D7): 182 superficies, 13 de riesgo alto (`inventario/crecimiento.md`). | 2900 |
| 2026-10-07 | 0 | Inventario completo: 13 archivos, 159 secciones, 2346 checks. BaseDataTable: 18 a migrar / 9 a borrar. Protocolo `AUDITORIA-UI.md`. **Checkpoint 0 presentado al usuario** (+ D6). | 2900 |
| 2026-10-07 | 0 | Script de conteo y línea base. Inventario funcional por módulo en curso (`inventario/`). | **2900** (322 archivos) |
| 2026-10-07 | Plan | Usuario aprueba el plan y D1-D5; agrega plan + auditoría `ui-skills` por feature (§3.1). | — |
| 2026-10-07 | Plan | Exploración (diseño actual, comparación con GH, inventario), lenguaje visual (`DISENO.md`) y este plan. | ≈1010 (229 archivos) — a medir en Fase 0 |
