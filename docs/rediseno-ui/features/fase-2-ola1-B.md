# Fase 2 — Ola 1 — Agente B (estado y cifras)

Plan: `fase-2-primitivos.md` §3.5, §3.6, §3.8, §4 y §8.1. Rama `feat/rediseno-ui`, sin commits.
Decisiones de §7 con la recomendación del plan (7.6 tonos, 7.7 nombre `StatusBadge`, 7.11 íconos + tooltip + ⋯).

## `statusToneMap` / `statusLabelMap` / `statusIconMap` (`mappers.ts`)
- [x] Hecho
- Archivo: `src/shared/utils/mappers.ts`. Solo se **agrega** al final (y un import de `lucide-react` arriba); nada
  existente cambia. Exporta `StatusTone`, `statusToneMap`, `StatusDomain`, `StatusOf<D>`, `statusLabelMap`,
  `statusIconMap`.
- Dominios: `resource`, `activity`, `document`, `condition`, `dailyReport`, `dailyReportRow` (los que fija §3.5).
- Tonos (7.6): documento `pendiente` neutral, `presentado` info, `vencido`/`rechazado` danger; `en_reparacion` info,
  `operativo_condicionado` warning, `en_preparacion` neutral.
- Desvíos:
  - `StatusTone` vive en `mappers.ts` (no en `status-badge.tsx`) y `status-badge.tsx` lo re-exporta: así no hay import
    circular entre el mapa y el componente.
  - `dailyReport` / `dailyReportRow` no estaban fijados: `abierto` info, `cerrado`/`cerrado_completo` success,
    `cerrado_incompleto` warning; fila: `pendiente` warning (como hoy), `sin_recursos_asignados` danger, `ejecutado`
    success, `reprogramado` info, `cancelado` neutral (DISENO: "Cancelada" neutral; hoy era destructive),
    `en_certificacion` info. Validar en 6.x (Operaciones).
  - Labels de `activity` ("Activo"/"Inactivo") van inline en `statusLabelMap` (no se creó un mapa de labels nuevo).
  - `statusIconMap` solo cubre `resource`, `document` y `condition`; `activity` y los partes llevan el punto.

## `StatusBadge` + `DomainStatusBadge`
- [x] Hecho
- Archivo: `src/components/ui/status-badge.tsx` (sin directiva).
- API: `StatusBadge({ tone, children, icon = 'dot', className })` · `DomainStatusBadge<D>({ domain, status: StatusOf<D> | null, className })`.
- Clases por tono en `Record<StatusTone, string>` completos; texto con `truncate` + `title`.
- `null` → "—" neutral con `sr-only` "Sin estado". Desconocido → valor crudo neutral + `logger.warn` una vez por
  `dominio:estado` y solo fuera de producción.
- Desvíos: `text-caption` (12px, mismo tamaño que pide DISENO `text-[12px]`, y el que usa `badge.tsx`).

## `StatCard` + `KpiStrip` + `StatCardSkeleton`
- [x] Hecho
- Archivo: `src/shared/components/data-display/StatCard.tsx` (sin directiva).
- API: `KpiStrip({ 'aria-label', children, className })` · `StatCard({ label, value, format?, unit?, delta?, hint?,
  icon?, loading?, className } & ({} | { href, active? } | { onSelect, active }))` · `StatCardSkeleton({ className })`.
- Desvíos:
  - `@container/kpi` va en un `div` que envuelve al `dl` (un elemento no puede consultar su propio contenedor).
  - Hairlines con `border-t border-l` en el `dl` + `border-r border-b` en cada cifra, en vez de `divide-x/divide-y`
    (con grillas de 2 columnas `divide` dibuja bordes dobles en el arranque de cada fila).
  - Las columnas en ancho completo salen de la cantidad de cifras (`React.Children.count`): 3→3, 4→4, 5→3/5,
    6→3/6, 7+→4. Base: 2 columnas (1 si hay una sola cifra).
  - El control clickeable (Link o button) vive **dentro del `dt`** con `after:absolute after:inset-0` (dentro de un
    `dl` el `div` solo admite `dt`/`dd`); el foco se dibuja en la celda con `has-[:focus-visible]:outline-2`.
  - `StatCard` va siempre dentro de `KpiStrip` (un KPI suelto = `KpiStrip` de una cifra).
  - El delta usa el mismo formato que el valor; signo `+`/`−` + flecha + label; delta 0 sin flecha y en muted.

## `RowActions`
- [x] Hecho
- Archivo: `src/shared/components/data-display/RowActions.tsx` (`'use client'`).
- API: `RowAction = { id, label, icon, tone?, disabled?, disabledReason? } & ({ onSelect } | { href })` ·
  `RowActions({ actions, rowLabel, inline?, layout?: 'auto' | 'menu', className })`.
- Permisos: no los consulta; renderiza lo que llega. Vacío → `null`.
- Menú: `onSelect` diferido a `onCloseAutoFocus` (con `preventDefault`, foco manual al ⋯ y recién ahí corre la
  acción, para que un `ConfirmDialog` guarde el ⋯ como elemento a devolver el foco). Danger al final tras separador.
- Desvíos:
  - `rowLabel` es la identidad de la fila ("Pérez Juan"), no la frase completa: arma "Acciones de «Pérez Juan»" (⋯)
    y "Editar «Pérez Juan»" (íconos; el tooltip muestra solo "Editar").
  - Ícono inline deshabilitado: `aria-disabled` (no `disabled`) para que siga enfocable y el motivo llegue por el
    tooltip y el nombre accesible. En el menú, el motivo va como segunda línea del ítem.
  - Sin `inline` y con más de 2 acciones → solo ⋯ (DISENO §4.6 dice "hasta 1 ícono + ⋯"; el plan §3.8 permite 2;
    manda el plan, el consumidor elige).
  - Cada `RowActions` envuelve sus tooltips en un `TooltipProvider` propio: no hay provider global (ver pendientes).

## Verificación
- `npm run check-types`: verde (la primera corrida falló solo por `search-select-list.tsx` del agente E a medio hacer;
  la segunda, verde).
- §8.1 sobre los 4 archivos: `replace('(text|bg|border)-` = 0, `className={\`` = 0, todos los `<button>/<Button>` con
  `type` (salvo `asChild` con `<Link>`), `rounded-(sm…xl)`/`shadow-(sm…xl)` = 0, `useEffect`/`console.`/`any`/`date-fns`
  = 0. Conteo de colores: 2707 (sin cambio; los archivos nuevos en 0).
- CSS compilado con `@tailwindcss/postcss` (script descartable en el scratchpad): se generan `@container kpi`,
  `@3xl/kpi:grid-cols-3`, `@5xl/kpi:grid-cols-6`, `has-[:focus-visible]:-outline-offset-2`,
  `has-[:focus-visible]:outline-ring`, `after:absolute`, `shadow-[inset_0_2px_0_var(--primary)]`, `h-[31px]`,
  `bg-neutral`, `max-w-72`, `size-11`, `border-primary/30`.

## Pendientes en archivos compartidos (no tocados)
- `TooltipProvider` global en el layout del dashboard (y de los paneles de campo): hoy no existe, por eso
  `RowActions` monta uno por fila y el "0 ms entre tooltips seguidos" de DISENO §4.14 no cruza filas.

<!-- estado: completo -->
