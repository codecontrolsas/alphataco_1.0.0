# Fase 2 — Ola 1 — Agente C (overlays)

Plan: `fase-2-primitivos.md` §3.1, §3.2, §4 y §8.1. Rama `feat/rediseno-ui`, sin commits.
Decisiones: 7.1 = (a) la confirmación async espera; 7.2 = (a) `useConfirm()` local que devuelve `[confirm, dialog]`.
Skills: `vercel-react-best-practices` (tool `Skill`), `ibelick/fixing-accessibility` (MCP `ui-skills`), más los
destilados que ya trae el plan (§ cabecera).

## ResponsiveDialog
- [x] Hecho
- Archivo: `src/components/ui/responsive-dialog.tsx` (reescrito).
- API: `open`, `onOpenChange`, `title: string`, `description?: ReactNode`, `children`, `footer?`, `size?`
  (`sm|md|lg|xl`, default `md`), `layout?` (`dialog|sheet`; unión discriminada: `sheet` solo admite `md|lg`),
  `mobile?` (`drawer|fullscreen`), `dismissible?` (default `true`), `hideTitle?`, `className?`. Exporta el tipo
  `ResponsiveDialogProps`.
- Superficies: `dialog` (Dialog, 400/560/800/`min(1100px,92vw)`, `max-h-[85dvh]`), `sheet` (Sheet derecha 480/640),
  `drawer` (vaul, `max-h-[92dvh]`) y `fullscreen` (Dialog a `h-dvh` con "Volver"). Header `h-12` con hairline,
  título `text-section` truncado con `title` nativo, X `ghost icon-sm` con `aria-label="Cerrar"`; descripción
  `text-caption` bajo el header; body `@container/dialog` con scroll y `overscroll-contain`; footer con hairline,
  `bg-panel-2` y safe area.
- Modo: `useMediaQuery(MOBILE_MEDIA_QUERY)`; se fija al abrir con el patrón de estado previo en render (sin
  `useEffect`) y no cambia mientras está abierto ni durante la salida.
- Publica `ResponsiveDialogContext` con valores constantes por superficie (no re-renderiza consumidores).
- `dismissible={false}`: `onOpenChange(false)` filtrado, Esc/clic afuera con `preventDefault`, vaul
  `dismissible={false}`, X y "Volver" `disabled`.
- Foco inicial: `[data-autofocus]` si existe; si no, en desktop (dialog/sheet) el primer campo del body; si no hay
  campos, el default de Radix (la X). En mobile no se enfoca un campo (abriría el teclado); el drawer usa el default de vaul.
- Compatibilidad con los 3 consumidores (sin tocarlos, check-types verde):
  - `AddTaskDialog.tsx:201` pasa `className="sm:max-w-lg"`: va al contenedor y pisa el `size` por tailwind-merge
    (mismo ancho que hoy). Sus botones viven en `children`: quedan dentro del body scrolleable.
  - `CloseWorkOrderDialog.tsx:119` y `ReturnTaskDialog.tsx:84` pasan `footer` (un `div` propio con sus botones):
    va a la barra fija.
  - Ninguno usa `description`; `title` sigue siendo `string`.
- Desvíos:
  - **Cambio de contrato previsto en el plan:** sin `footer`, el drawer ya no agrega el "Cancelar" automático
    (`AddTaskDialog` lo mostraba en mobile; tiene su propio Cancelar en cada tab y ahora además la X del header).
  - Footer mobile en `flex-col` (no `flex-col-reverse` como dice §3.1): con el orden del DOM del repo
    (Cancelar → primaria), `col-reverse` dejaría la primaria arriba; el plan pide la primaria abajo.
  - Corte del footer en `md` (768) y no en `sm`, para coincidir con el corte dialog/drawer.
  - `className` también se aplica al drawer (como hoy). `sm:max-w-lg` de `AddTaskDialog` entre 640 y 767px
    angosta el drawer igual que antes; se corrige al migrar el consumidor (Fase 7).
  - Sin texto "Guardando…" del primitivo con `dismissible={false}`: lo muestra el botón del `footer` del
    consumidor (el primitivo no conoce el submit).
  - Si el overlay se monta ya abierto durante la hidratación, el modo queda en desktop (snapshot de servidor);
    no hay ningún uso así hoy.

## ConfirmDialog + useConfirm
- [x] Hecho
- Archivo: `src/components/ui/confirm-dialog.tsx` (nuevo, `'use client'`).
- `ConfirmDialog`: `open`, `onOpenChange`, `title`, `description?`, `confirmLabel`, `cancelLabel?` ("Cancelar"),
  `destructive?`, `pendingLabel?` ("Procesando…"), `onConfirm: () => void | Promise<unknown>`, `busy?`.
- `useConfirm(): [confirm(options) => Promise<boolean>, ReactNode]`; `ConfirmOptions` = props sin
  `open/onOpenChange/busy` y con `onConfirm` opcional. `confirm` estable; un confirm nuevo cancela al pendiente.
- Async (7.1): `useTransition` + `ref` `inFlight`; botón propio (no `AlertDialogAction`) con spinner +
  `pendingLabel`, `aria-busy`; Esc, Cancelar y `onOpenChange(false)` bloqueados mientras corre; si lanza, queda
  abierto con `role="alert"` "No se pudo completar la acción. Volvé a intentar." y loguea con `Logger`; al reabrir
  arranca sin error.
- Foco: Cancelar si `destructive`, la acción si no. Al cerrar vuelve al elemento que tenía el foco al abrir (sirve
  para `useConfirm`, que no tiene trigger); si ya no está en el DOM, queda el default de Radix.
- Look: `AlertDialogContent` de la ola 0 (400px), ícono `TriangleAlert` 16px `text-danger` si es destructivo,
  footer con hairline y `bg-panel-2`, apilado a ancho completo en mobile con la acción abajo.
- Desvíos:
  - El botón de confirmar usa `aria-disabled` (con `pointer-events-none` y opacidad) en vez de `disabled` mientras
    corre: un botón `disabled` pierde el foco y lo saca del foco atrapado; el `ref` corta igual el segundo clic.
  - Sin `onConfirm`, `useConfirm` resuelve tras una microtarea (no en el mismo tick): imperceptible.

## Controles (§8.1, sobre los 2 archivos)
- `npm run check-types`: verde.
- `replace('(text|bg|border)-` / `className={\`` = 0; botones con `type` explícito; `rounded-*`/`shadow-*` = 0;
  "Close/Cancel/Are you sure" = 0; `useEffect` = 0; `console.` / `any` / `date-fns` = 0.
- `count-hardcoded-colors`: 2707 (sin cambio); los 2 archivos en 0.

## Pendientes en archivos compartidos
- Ninguno bloqueante.

<!-- estado: completo -->
