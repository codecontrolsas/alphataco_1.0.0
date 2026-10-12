# Fase 1 — Progreso de implementación

Plan: `fase-1-fundamentos.md` (§4.7). Rama `feat/rediseno-ui`, sin commits.
Conteo de partida: 2900 en 322 archivos.

## Paso 1 — Fuentes y raíz
- [x] Hecho
- Archivos: `src/app/fonts.ts` (nuevo), `src/app/layout.tsx`, `src/lib/utils.ts` (solo `cn`).
- check-types: verde.
- Verificación de `cn` (tailwind-merge extendido): `text-overline text-muted-foreground` conserva ambas; `text-caption text-sm` → `text-sm`; `text-success-text text-danger-text` → `text-danger-text`.
- Desvíos: ninguno (los dos `<Toaster>` quedan hasta el paso 6, como dice el plan).

## Paso 2 — Tokens
- [x] Hecho
- Archivos: `src/app/globals.css` (reescrito según §3.1).
- check-types: verde. `grep -c sitepoint src/app/globals.css` = 0.
- Validación extra: se compiló `globals.css` con `@tailwindcss/postcss` (script descartable en el scratchpad): 0 warnings; `text-overline`, `data-code`, `bg-canvas`, `text-page-title`, `shadow-overlay`, `bg-danger-soft`, `font-mono` (Plex Mono) y `rounded-xl` (→ `--radius-xl: 0`) se generan bien.
- Desvíos: se borró también la regla `input[type='checkbox']:checked ~ label span svg` porque estaba dentro del `@layer components` de landing que el plan manda borrar entero.

## Paso 3 — Primitivos
- [x] Hecho
- Archivos: `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx` (h-9→h-8), `select.tsx` (h-9→h-8, sm h-8→h-7).
- check-types: verde sin tocar consumidores.
- Desvíos:
  - Button: la base lleva `text-label font-medium` (el plan dice solo `text-label`). Motivo: con el `cn` extendido, un consumidor que pasa `text-xs`/`text-sm` reemplaza `text-label` (mismo grupo) y el botón perdía el peso 500 que hoy tiene por `font-medium`.
  - CardTitle: `text-section font-semibold` (el plan dice `text-section`). Mismo motivo: 86 `CardTitle` pasan `text-lg/xl/2xl…` y se quedarían en peso 400.

## Paso 4 — Header de tabla
- [x] Hecho
- Archivos: `src/shared/components/common/DataTable/DataTable.tsx:518`, `src/shared/components/data-table/base/data-table.tsx:282`, `data-table-server.tsx:397` → `sticky top-0 z-10 bg-muted`.
- check-types: verde. Grep `dark:bg-slate|bg-white` en los 3 archivos = 0.
- Desvíos: ninguno.

## Paso 5 — Shell
- [x] Hecho
- Archivos: `src/app/dashboard/layout.tsx` (skip link + `#main-content` con `@container/page`, max-w 1440, gutter 16/24), `src/features/Layout/header/DashboardHeader.tsx` (h-14, z-20, `bg-card/95`, `px-4 md:px-6`), `src/features/Layout/sidebar/components/DashboardBreadcrumb.tsx`, `src/features/Layout/sidebar/AppSidebar.tsx`, `src/features/Layout/sidebar/components/NavMain.tsx`, `src/components/ui/sidebar.tsx` (3 textos: sr-only, aria-label y title del rail), `src/components/ui/ToogleDarkButton.tsx`, `src/shared/components/layout/PageHeader.tsx` (nuevo), `src/shared/components/layout/PageHeaderSkeleton.tsx` (nuevo), `src/features/TabsManager/SectionManagerServer.tsx`, `src/app/dashboard/loading.tsx`.
- check-types: verde. Clases nuevas confirmadas en el CSS compilado (`@max-xl/ph:`, `@xl/ph:`, `max-w-(--page-max)`, `focus:z-60`, `pointer-coarse:min-h-11`, `w-[100cqw]`, `ml-[calc(50%-50cqw)]`).
- Desvíos:
  - PageHeader: el plan escribe `max-@xl/ph:text-[1.125rem]`; en Tailwind 4.2 la sintaxis es `@max-xl/ph:` (la otra no genera CSS).
  - `sidebar.tsx`: además del `sr-only` y el `aria-label`, el `title="Toggle Sidebar"` del rail también pasó a español (el plan lo prevé: "y su `title` si lo tiene").

## Paso 6 — Toasts
- [x] Hecho
- Archivos: `src/components/ui/sonner.tsx` (reescrito: `resolvedTheme`, posición por `useSyncExternalStore` con corte 600px, `mobileOffset`, `closeButton`, `duration 4000`, `unstyled` + `classNames`, barra de tono `border-l-2`, sin `richColors`), `src/app/layout.tsx` (un solo `<Toaster />` después de `children`), `src/features/Mantenimiento/TiposReparaciones/MaintenanceGroupsClient.tsx` (sale el `<Toaster>` radix), y los 10 consumidores: `DailyReportWrapper.tsx`, `contractDocuments.tsx`, `EquipmentModelForm.tsx`, `EquipmentOwnerForm.tsx`, `EquipmentSubTypeForm.tsx`, `EquipmentTypeForm.tsx`, `BulkCertificacionModal.tsx`, `BulkStatusModal.tsx`, `PreparteBulkStatusModal.tsx`, `ModulePermissions.tsx`.
- Borrados: `src/components/ui/toast.tsx`, `toaster.tsx`, `use-toast.ts` (grep previo: solo se importaban entre ellos; sin imports relativos ni en `cypress/`).
- Traducción (script descartable con parser de llaves balanceadas, 41 llamadas): `variant: 'destructive'` → `toast.error(title, { description, duration: Infinity })` (el de Preparte conserva `duration: 10000`); "Detalle/Historial del servicio" y "Archivos seleccionados" → `toast(...)`; "No hay archivos" → `toast.warning`; "Sin cambios" → `toast.info`; el resto (éxitos) → `toast.success`. Títulos y descripciones idénticos.
- check-types: verde. `grep -rnE "use-toast|components/ui/toast['\"]|components/ui/toaster" src` = 0.
- Desvíos: las llamadas migradas quedan en una sola línea (más de 120 columnas en algunos casos) porque está prohibido correr prettier.

## Paso 7 — Auth
- [x] Hecho
- Nuevos: `src/features/Auth/components/AuthShell.tsx`, `src/features/Auth/fallback/AuthFormSkeleton.tsx`.
- Modificados: `src/app/login/page.tsx`, `src/features/Auth/components/LoginForm.tsx`, `LoginButton.tsx` (solo se borra `element.style.color = 'red'` y `size="lg"`), `src/app/reset_password/page.tsx`, `update-user/page.tsx`, `confirm/page.tsx`, `RecoveryPasswordForm.tsx`, `UpdateUserPasswordForm.tsx` (solo clases + `buttonVariants` para el link), los 4 `loading.tsx` (login, reset_password, update-user, confirm).
- Borrados: `RenderBanner.tsx`, `AutenticationLight.tsx`, `AutenticationDark.tsx`, `RefreshComponent.tsx` (grep previo: solo se referenciaban entre ellos y desde las 3 páginas de `reset_password`, ya migradas).
- check-types: verde. Grep `RenderBanner|AutenticationLight|AutenticationDark|RefreshComponent` en `src` = 0.
- Desvíos:
  - El aviso `?error=oauth` envuelve el texto en un `<p>` al lado del ícono (texto idéntico).
  - En los callouts de `confirm` y `update-user` el párrafo secundario usa `mt-1` (antes `mt-2`/`mt-4`) para el ritmo del callout compacto.
  - El submit de `UpdateUserPasswordForm` no tenía `w-full` y no se le agregó (solo `size="lg"`, como pide el plan).

## Paso 8 — Errores
- [x] Hecho
- Nuevo: `src/shared/components/layout/StatusScreen.tsx`.
- Modificados: `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/dashboard/error.tsx`, `src/app/global-error.tsx`.
- Lógica idéntica (los `useEffect` de logger/PostHog, `setErrorDetails`, copiar, reportar, `reset`, `window.location.href = '/dashboard'`); solo cambia el JSX. `global-error` deja `NextError` y pasa a pantalla propia con "Volver al inicio" + "Intentar nuevamente" (decisión 1 de §7), importando `globals.css` y `./fonts`.
- check-types: verde.
- Desvíos: en `app/error.tsx` "Volver al inicio" suma el ícono `Home` (antes solo lo tenía `dashboard/error.tsx`), siguiendo el pseudocódigo del plan que usa el mismo bloque de acciones para los dos.

## Paso 9 — Controles de código (§8.1, solo código)
- [x] Hecho (sin `npm test`, `manual:check`, dev server ni navegador: la verificación visual la hace el usuario)
- `npm run check-types`: verde.
- `node scripts/ui/count-hardcoded-colors.mjs`: **2718 en 300 archivos** (antes 2900 en 322; paleta 2430 · blanco/negro 185 · arbitrarios 1 · #hex 87 · rgb/hsl 15). Todos los archivos de §2.6 en 0 **salvo `src/app/layout.tsx` = 2**: son los dos hex de `viewport.themeColor` que pide el propio plan (§3.2; el `<meta theme-color>` no puede leer variables CSS). La meta de ≤ 2716 no contemplaba esos 2: 2900 − 184 + 2 = 2718.
- `grep use-toast|components/ui/toast|toaster` en `src` = 0.
- `grep Poppins|popinsFont` en `src` = 0.
- `grep sitepoint|@keyframes sweep|header-logo|togglePlan` en `globals.css` = 0.
- `grep transition-all|shadow` en button/badge/card = 0.
- `grep dark:bg-slate|bg-white` en `DataTable.tsx`, `data-table.tsx`, `data-table-server.tsx` = 0. Ojo: el glob literal del plan (`data-table*.tsx`) también agarra `data-table-filter-options.tsx` y `data-table-view-options.tsx`, que siguen con `bg-white dark:bg-slate-950` (fuera de alcance: Fase 5, plan §3.5).
- `grep RenderBanner|AutenticationLight|AutenticationDark|RefreshComponent` en `src` = 0.
- `grep replace('(text|bg|border)-` en ui/Layout/Auth/layout = 0.
- `grep z-[|h-screen|min-h-screen` en los archivos del alcance = 0.
- `cn`: `text-overline` sobrevive junto a `text-muted-foreground` (verificado en el paso 1).
- Sin `console.*` ni `any` en lo agregado.

<!-- estado: completo -->
