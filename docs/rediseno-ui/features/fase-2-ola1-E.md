# Fase 2 — Ola 1 — Agente E (selectores)

Plan: `fase-2-primitivos.md` §1.1, §3.4, §4 y §8.1. Decisiones de §7 con su recomendación (7.9: el valor que devuelve
`SearchSelect` es el mismo conjunto que hoy, sin altas ni bajas). Rama `feat/rediseno-ui`, sin commits, sin tests,
sin dev server.

Skills: `vercel-react-best-practices` (tool `Skill`; reglas `rerender-use-deferred-value`, `rerender-no-inline-components`,
`rerender-memo-with-default-value`, `js-hoist-regexp`, `js-index-maps`, `client-swr-dedup`/React Query, `rendering-conditional-render`)
y `prototyperai/build-primitive` (MCP `ui-skills`, patrón C *active descendant*, hidden inputs para `<form>` nativo,
`data-*` booleanos presentes o ausentes). Barrido MCP: `combobox` (0), `select`, `primitive`; el resto ya lo destiló el plan.

## `use-debounced-value`
- [x] Hecho
- Archivo: `src/shared/hooks/use-debounced-value.ts` (nuevo, `'use client'`): `useDebouncedValue(value, delayMs)`.
  Con `delayMs <= 0` devuelve el valor tal cual (la búsqueda local no paga el timer).
- Desvíos: ya existía `src/shared/hooks/useDebounce.ts` (mismo comportamiento, sin directiva). No se toca ni se borra:
  fuera de la lista de archivos de este agente. Unificarlos queda para la Fase 9.

## `option-labels`
- [x] Hecho
- Archivo: `src/shared/utils/option-labels.ts` (nuevo, sin directiva, solo `import type` de `search-select`).
  - `getEmployeeOptionLabel(employee)` → `"[legajo] Apellido Nombre"` (texto plano, para facetas/export).
  - `toEmployeeOption(employee, extras?)` → `{ value: id, code: legajo, label: "Apellido Nombre" }`.
  - `toVehicleOption(vehicle, extras?)` → `code` = dominio (o serie), `label` = "Interno N", `keywords` con dominio,
    serie e interno. Sin interno, el dominio pasa a ser el label y no se repite como código.
  - `extras`: `description`, `group`, `disabled`, `hint`.
- Desvíos: el plan escribe `file_number`, pero la columna real es `employees.file`; varios tipos del sistema la
  exponen como `file_number`. El helper acepta las dos (`file ?? file_number`).

## `SearchSelect`
- [x] Hecho
- Archivos (nuevos, `'use client'`, sin barrel):
  - `src/components/ui/search-select.tsx`: API, raíz, trigger, chips, hidden inputs, React Query.
  - `src/components/ui/search-select-list.tsx`: buscador, línea de estado, lista, skeleton, error con "Reintentar",
    `OptionText`, el filtro local (`indexOptions`, `filterIndexed`) y `getStatusText`.
  - `src/components/ui/search-select-drawer.tsx`: panel inferior mobile (`Drawer` o `NestedRoot` de vaul).
- Comportamiento:
  - Local: `Command shouldFilter={false}`; filtro propio sobre `useDeferredValue` en `useMemo`, normaliza acentos y
    mayúsculas una vez por opción, todas las palabras deben aparecer (label, code, description, keywords) y primero
    van las que empiezan con el texto. Tope `limit` (50). Solo filtra con el panel abierto.
  - Async: `useQuery({ queryKey: [...queryKey, debounced], queryFn: ({ signal }) => search(q, signal),
    enabled: open && q.length >= minChars, placeholderData: keepPreviousData, staleTime: 60s })`, debounce 300ms.
    Lo que devuelve el servidor se muestra tal cual (solo se corta en `limit`). Los labels de lo elegido salen de
    `selectedOptions` y de las opciones elegidas en la sesión.
  - Línea de estado entre buscador y lista, fuera del scroll, `role="status"` + `aria-live="polite"` siempre montada
    (`sr-only` vacía), `tabular-nums`: "Cargando…", "Escribí al menos N caracteres.", "Buscando…", "Sin resultados para
    «x».", "No hay {noun} para elegir.", "Llegaste al máximo de N {noun}.", "Mostrando 50 de 387 equipos. Escribí para afinar."
  - Error async dentro de la lista con `role="alert"` y botón "Reintentar" (`refetch`) sin cerrar.
  - Trigger: `div` con el borde del campo (`DISENO.md` §4.15, mismas clases que `SelectTrigger`) que contiene el
    `button role="combobox"`, los chips (2 + "+N", cada uno con su `<button aria-label="Quitar «X»">`), la X de limpiar
    (`clearable`) y el chevron. Anillo de foco por `has-[…:focus-visible]` en el contenedor. Clic en el borde/chevron abre.
  - Desktop: `Popover` anclado al campo (`PopoverAnchor`), `w-(--radix-popover-trigger-width) min-w-60`, sin animación.
    Mobile (< 768px, fijado al abrir): drawer de 85dvh, buscador h-11 con `enterKeyHint="search"`, ítems 44px, footer
    "Listo (N)" en múltiple; anidado (`NestedRoot`) si `useResponsiveDialogSurface() === 'drawer'`.
  - Teclado: lo de cmdk + Radix; Backspace con el buscador vacío quita el último en múltiple.
  - Contrato de `onChange`: simple `V | null`, múltiple `V[]`; `onMax` `ignore` (default) o `replace-oldest`;
    `selectAll` sobre las habilitadas visibles respetando `max`. Las altas/bajas M:M se calculan afuera (7.9).
- Controles §8.1 sobre los 5 archivos: `check-types` verde; `console.`/`any` = 0; `rounded-*`/`shadow-*` = 0;
  `replace('(text|bg|border)-` y `className={\`` = 0; `date-fns` = 0; `useEffect` solo en `use-debounced-value.ts`;
  los 3 `<button>` y 2 `<Button>` con `type="button"`. Colores hardcodeados: 2707 (sin cambio), 0 en los archivos nuevos.
- Desvíos:
  - **API: tres props más que §3.4**: `aria-label` (sin `<FormLabel htmlFor>` el `role="combobox"` no tiene nombre; si
    falta y no hay `id`, se usa el placeholder como último recurso), y `aria-invalid` / `aria-describedby`, que
    `FormControl` de shadcn inyecta por Slot y que hay que reenviar al trigger.
  - Re-elegir la opción ya elegida en modo simple no la deselecciona: cierra. Limpiar es con `clearable` (la X).
  - `search-select.tsx` queda en ~450 líneas (el plan sugiere ~300): ya está partido en los tres archivos de §4.1;
    ~100 líneas son tipos y documentación de la API. No se parte más para no inventar un cuarto archivo.
  - El aviso de vacío y de "sin resultados" va en la línea de estado (no hay `CommandEmpty`): un solo lugar anunciado.
  - En modo local el componente igual registra un `useQuery` deshabilitado (los hooks no pueden ser condicionales).
  - Sin `next/dynamic` para la lista/drawer: se **montan** solo al abrir, pero se importan estáticamente (vaul ya
    viene en el bundle por `ResponsiveDialog`, cmdk por `command`).
- Pendientes en archivos compartidos: ninguno bloqueante. Para la Fase 9: unificar `useDebounce.ts` con
  `use-debounced-value.ts`.
- Verificación visual: pendiente (sin dev server en esta ola; va en la página de ejemplo de §4.8).

<!-- estado: completo -->
