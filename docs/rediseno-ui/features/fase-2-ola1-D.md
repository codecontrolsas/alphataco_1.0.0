# Fase 2 — Ola 1 — Agente D (fechas)

Plan: `fase-2-primitivos.md` §1.1, §3.3, §4 y §8.1. Rama `feat/rediseno-ui`, sin commits.
Decisiones: 7.3 = (a) vuelve al último valor válido y avisa · 7.8 = (a) existe `iso-date-utc`.

## Adaptadores — `src/shared/utils/date-adapters.ts`
- [x] Hecho (sin directiva, puro)
- API: `toPickerDate(raw, format): Date | null` · `fromPickerDate(date, format, options?: { emptyValue })` ·
  `DATE_FORMAT_GRANULARITY` · `DEFAULT_EMPTY_VALUE` · tipos `DateFieldFormat`, `DateFieldValue`, `DateEmptyValue`.
- Formatos (entrada = lo que guarda el form → `Date` local del picker → salida):
  - `date`: `Date` (o string ISO, como aceptaba Enhanced) → `Date` medianoche local. Vacío `null`.
  - `iso-date`: `'YYYY-MM-DD'` estricto, en hora local → `'YYYY-MM-DD'`. Vacío `''`.
  - `iso-datetime`: string ISO → `toISOString()` de la medianoche local. Vacío `''`.
  - `month`: `'YYYY-MM'` estricto → `'YYYY-MM'`. Vacío `''`.
  - `month-date`: `Date` → `Date` del día 1. Vacío `null`.
  - `iso-date-utc`: `Date`/string leído por su día UTC → `new Date('YYYY-MM-DD')` (medianoche UTC). Vacío `null`.
  - `iso-date-utc-string`: string/`Date` leído por su día UTC → `'YYYY-MM-DD'`. Vacío `''`.
- Desvíos:
  - **Formato extra `iso-date-utc-string`.** `Inputs.tsx:737/803` no guarda un `Date` como `CustomerForm`: guarda el
    `'YYYY-MM-DD'` del input y lo **lee** con `new Date(v).toISOString()`. Un solo `iso-date-utc` no conserva los dos
    payloads, así que la decisión 7.8 (a) necesita dos formatos.
  - `emptyValue` va en `options` para poder distinguir `undefined` explícito de "no se pasó" (sin la opción se usa
    el vacío de hoy del formato).
  - `month-date` emite el día 1; `YearMonthPicker` emitía el día de hoy con mes/año cambiados (lo pide §3.3; los dos
    consumidores son estado de gráficos, no payloads).

## `DatePicker` — `src/components/ui/date-picker.tsx`
- [x] Hecho (`'use client'`)
- Escritura directa con máscara (barras automáticas, `7/` → `07/`, Backspace sobre barra borra el dígito, pegado de
  `07/10/2026`, `7/10/2026` y `2026-10-07`), cursor conservado escribiendo el valor en el DOM desde el handler.
  Parseo estricto con moment en el handler y en `onBlur`/Enter, nunca en efecto; año de 2 dígitos inválido.
- 7.3: inválido o fuera de rango al salir → vuelve al último valor y avisa en un `<p role="status">` siempre montado
  ("No se reconoció «31/02/2026» (escribila como DD/MM/AAAA); se mantiene 10/02/2026.").
- `onChange` solo con fecha válida en rango o `null`. Resync con el valor del padre en render (patrón "valor
  previo"), sin `key` ni `useEffect`.
- Calendario rdp 9 por `next/dynamic` (`ssr: false`) con precarga en `pointerenter`/`focus` del botón; `autoFocus`,
  `startMonth`/`endMonth` desde `yearRange` (dropdowns), `disabled` = min/max/`isDateDisabled`. Elegir un día
  devuelve el foco al input (desktop). Modo `month`: grid de 12 meses con `aria-pressed`, navegación de año y flechas.
- Mobile (`useMediaQuery(MOBILE_MEDIA_QUERY)`): drawer; `NestedRoot` de vaul si `useResponsiveDialogSurface()` es
  `drawer`. `min > max` → `logger.warn` (en handlers) e ignora los dos límites.
- Desvíos:
  - El aviso de 7.3 va siempre en el `status` propio, también dentro de un form: no es un error de validación (el
    valor que queda es válido), y meterlo en `FormMessage` exigiría `setError`, que lo dejaría como error pegado.
  - El grid de meses vive en el mismo archivo y no se carga con `dynamic` (no tiene dependencias propias; partirlo
    exigía un archivo fuera de mi lista). Solo el calendario rdp va diferido.
  - 526 líneas después del formateo automático del editor (el plan pide ~300). Se puede partir en
    `date-picker-month-grid.tsx` si se quiere: no lo hice por la regla de archivos exclusivos.
  - Input en `font-mono tabular-nums` en vez de la utilidad `data-code`: `data-code` baja la fuente a 0.92em y en
    mobile dejaría el input por debajo de 16px (zoom de iOS).

## `FormDatePicker` — `src/components/ui/form-date-picker.tsx`
- [x] Hecho (`'use client'`)
- `FormField` + `FormItem` + `FormLabel` (`*` con `aria-hidden` si `required`) + `FormControl` + `FormDescription` +
  `FormMessage`. `name: FieldPathByValue<T, DateFieldValue>`. Granularidad derivada del `format`.
- Desvíos: ninguno.

## Verificación
- `npm run check-types`: verde.
- §8.1 sobre los 3 archivos: `rounded-*`/`shadow-*` = 0, `useEffect` = 0, `date-fns` = 0, `console.`/`any` = 0,
  `replace('(text|bg|border)-` y `className={\`` = 0, los 5 `<Button>` con `type="button"` (el del trigger bajo
  `PopoverTrigger asChild` también lo declara), textos "Close/Cancel" = 0.
- Colores hardcodeados: 2707 en 297 archivos (sin cambio; los 3 archivos nuevos en 0).
- Sin navegador ni tests (fuera de alcance de la ola 1): la prueba real va en la página de ejemplo de la ola 2.

## Pendientes para la ola 2 / archivos compartidos
- Ninguno bloqueante. Ningún archivo compartido necesitó cambios.
- Ola 2: probar en teléfono real el drawer anidado, el teclado numérico y el cursor de la máscara; probar el grid de
  meses con teclado; verificar que `has-[input[aria-invalid=true]]` pinta la barra de error.

<!-- estado: completo -->
