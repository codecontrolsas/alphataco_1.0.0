# Fase 2 — Primitivos compartidos — plan de UI

Estado: plan. Las decisiones de §7 no bloquean la ola 0 ni la construcción; sí la migración de consumidores en 6.x.
Fase del PLAN: 2 · Ficha del inventario: transversal (consumidores por módulo en §8.3)
Fecha: 2026-10-07 · Autor: agente `ui-skills` · Rama: `feat/rediseno-ui` (sin commits)

Skills consultadas: barrido con el MCP `ui-skills` (`list_skills`) por `dialog`, `combobox` (0 resultados), `date`,
`empty state`, `accessib`, `component`, `form`, `mobile`, `keyboard`, `table`, `dashboard` e `interaction`. Todas se
pidieron con `get_skill` y su `autor/slug` completo. Las dos que estructuran el plan las leí completas; las otras 14
las leyeron 3 subagentes, que devolvieron solo las reglas que se pueden aplicar.
- `vercel-react-best-practices` (local, tool `Skill`): reglas citadas en §4. `rerender-use-deferred-value` (filtro
  local de `SearchSelect`), `rerender-derived-state-no-effect` y `rerender-move-effect-to-event` (parseo de la fecha
  en el handler, nunca en un efecto), `rendering-hydration-no-flicker` (la decisión Dialog/Drawer), `bundle-conditional`
  y `bundle-dynamic-imports` (calendario y lista solo al abrir), `rerender-memo-with-default-value`,
  `rerender-no-inline-components`, `rendering-conditional-render`, `rendering-usetransition-loading` (confirm async),
  `advanced-use-latest` (callbacks del confirm), `js-hoist-regexp` (máscara de fecha), `js-cache-function-results`
  (formateadores), `server-serialization` (props de los primitivos server).
- `prototyperai/build-primitive` (leída completa): árbol de roles ARIA (combobox+listbox, alertdialog, dialog), patrón
  *active descendant* para el combobox, controlado/no controlado, `data-*` como ganchos de estilo, checklist de foco
  (inicial, atrapado, devuelto). Se descarta lo que es de Base UI y su convención `hover-only:`.
- `jakubkrehel/break` (leída completa): define la página de ejemplo (§4.8). Una ruta descartable con el componente real
  importado, un escenario por fila en contenedores de ancho fijo, una sola carga, y las roturas anotadas en la página.
- `shadcn-ui/shadcn`: ConfirmDialog sobre `AlertDialog`; Title obligatorio (sr-only si va oculto); `asChild` en
  triggers Radix; Button sin `isLoading` (spinner + `disabled`); ítems siempre dentro de su Group. Propone `Field`,
  `InputGroup` y `Empty`, que no están instalados (decisión 7.4).
- `jakubkrehel/better-accessibility`: en el combobox el foco queda en el input; foco devuelto **sin trigger** en
  `useConfirm()` (hay que guardar `document.activeElement`); `role="status"` siempre montado; hit area de 24px mínimo
  y 44px con `pointer: coarse`; el placeholder nunca hace de label.
- `ibelick/fixing-accessibility`: `aria-expanded`/`aria-controls` en los triggers, `aria-busy` mientras carga, foco
  inicial en "Cancelar" en un confirm destructivo, `th scope` en `SimpleTable`, nada que aparezca solo con hover.
- `emilkowalski/emil-design-eng`: lo que se abre cientos de veces por día (menú ⋯, combobox) no se anima; overlays de
  menos de 300ms con salida más rápida; nunca escalar desde 0; con reduced motion se queda solo la opacidad.
- `pbakaus/harden`: probar con 1 carácter, 100+ caracteres y millones; tope de 50 opciones con aviso; abortar los
  requests al desmontar; vacío separado en "sin datos", "sin resultados" y "error"; el texto inválido no se pierde.
- `emilkowalski/mobile-native`: `dvh`, inputs de 16px en mobile, `inputMode="numeric"` y `enterKeyHint`, safe area
  en el footer del Drawer, `overscroll-behavior: contain`, decidir por capacidad y nunca por user agent, verificar
  en un teléfono real lo que la emulación no reproduce.
- `flornkm/prefer-container-queries`: el cambio Dialog/Drawer va por **viewport** (es shell: el overlay ocupa la
  pantalla). Todo lo de adentro (tira de KPIs, RowActions, EmptyState) va por `@container` con nombre.
- `jakubkrehel/better-writing` (solo para microcopy **nuevo**): botones con verbo + objeto, nunca "Aceptar/Sí"; el
  error de fecha dice cómo se escribe; plurales con `Intl.PluralRules` y nunca `n === 1 ? '' : 's'`.
- `vercel-labs/web-design-guidelines` (bajó su `command.md`): `…` en los placeholders y en "Cargando…", no bloquear el
  pegado, `overscroll-behavior` en modales, `<Link>` para navegar y `<button>` para actuar (RowActions).
- `ibelick/baseline-ui`: primitivos accesibles existentes antes que manejo de foco a mano, overlay sin blur,
  feedback de menos de 200ms, sin `useEffect` para lo derivable, un solo acento por vista.
- `dammyjay93/interface-design`: jerarquía del KPI con label 11/500 apagado, valor 28/600 tabular y delta 12/500
  semántico; una sola estrategia de profundidad (solo bordes); estados default, hover, active, focus, disabled,
  loading, empty y error como checklist de cada primitivo.
- `humanlayer/narrow-react-prop-types`: el contrato sale de los usos reales (§2), no de demos; sin opcionales "por si
  acaso"; `value: T | null` requerido en vez de opcional; uniones discriminadas por modo.
- `iart-ai/micro-interaction`: salida más corta que la entrada; el botón de confirmación pasa de "cargando" a "error"
  sin desmontarse.
- `vercel-labs/react-best-practices`: qué primitivos pueden ser Server Components (StatusBadge, StatCard, EmptyState,
  Panel, SimpleTable) y cuáles no.

Descartadas sin cargar: Vue/Svelte/SwiftUI/Three/daisyUI/Figma, `prototyperai/prototyper-ui` y
`shadcn-ui/migrate-radix-to-base` (son de Base UI), `iart-ai/glassmorphism` (blur, prohibido), `pbakaus/delight` y
`overdrive` (chocan con el modo instrumental).

**Choques resueltos a favor del proyecto:**
- Fechas con moment y `DD/MM/YYYY`, no `Intl.DateTimeFormat` (regla `moment-dates.md`).
- Popovers sin sombra de elevación: hairline + `--shadow-overlay` como en `DISENO.md`.
- `tracking` del overline: lo fija `DISENO.md` §3 (+0.06em) y ya está en el token `text-overline` de la Fase 1.
  baseline-ui prohíbe tocar `tracking-*` suelto, y acá no se toca: viene del token.
- El press con `scale(0.97)` no va (`DISENO.md` §4.1: "sin `active:scale`").

## 1. Alcance

Esta fase **crea** primitivos y **reviste** los wrappers base de shadcn que ellos usan. No migra ningún consumidor:
cada uso de §2 se migra con su módulo (Fase 3 para el DataTable, 5 para tablas, 6.x para módulos, 7 para paneles de
campo) usando el listado por módulo de §8.3.

### 1.1 Archivos que se crean

| Primitivo | Archivo | Directiva | Reusa de shadcn / libs |
|---|---|---|---|
| hook de viewport | `src/shared/hooks/use-media-query.ts` | `'use client'` | `useSyncExternalStore` (mismo patrón que `sonner.tsx` de la Fase 1) |
| `ResponsiveDialog` | `src/components/ui/responsive-dialog.tsx` (**se reescribe**; conserva nombre y props de hoy) | `'use client'` | `dialog`, `sheet`, `drawer` (vaul) |
| `ConfirmDialog` + `useConfirm` | `src/components/ui/confirm-dialog.tsx` | `'use client'` | `alert-dialog`, `button` |
| `DatePicker` | `src/components/ui/date-picker.tsx` | `'use client'` | `input`, `popover`, `calendar` (rdp 9), `drawer`, moment |
| `FormDatePicker` + adaptadores | `src/components/ui/form-date-picker.tsx` · `src/shared/utils/date-adapters.ts` (sin directiva, puro) | `'use client'` / — | `form` (RHF), `date-picker` |
| `SearchSelect` | `src/components/ui/search-select.tsx` · `src/shared/utils/option-labels.ts` (helpers de labels, sin directiva) | `'use client'` | `popover`, `command` (cmdk), `drawer`, `badge`, React Query |
| `StatusBadge` + `statusToneMap` | `src/components/ui/status-badge.tsx` · el mapa en `src/shared/utils/mappers.ts` (se **agrega** al archivo existente) | sin directiva | `badge` |
| `StatCard` / `KpiStrip` | `src/shared/components/data-display/StatCard.tsx` | sin directiva | `skeleton` |
| `EmptyState` | `src/shared/components/feedback/EmptyState.tsx` | sin directiva | — |
| `RowActions` | `src/shared/components/data-display/RowActions.tsx` | `'use client'` | `dropdown-menu`, `button`, `tooltip` |
| `Panel` + `Section` | `src/components/ui/panel.tsx` | sin directiva | — |
| `SimpleTable` | `src/shared/components/data-display/SimpleTable.tsx` | sin directiva | `table` |
| formateadores | `src/shared/utils/formatters.ts` (`formatNumber`, `formatCount` con `Intl` es-AR a nivel de módulo) | sin directiva | — |

Criterio de ubicación (mismo que la Fase 1 con `PageHeader`): lo que es un **control o un overlay genérico** va a
`src/components/ui/` junto a los wrappers de shadcn; lo que es **composición con criterio del producto** (KPI, vacío,
acciones de fila, tabla de presentación) va a `src/shared/components/<grupo>/`. Sin barrel `index.ts` nuevo
(`bundle-barrel-imports`): cada consumidor importa el archivo.

### 1.2 Wrappers base que se revisten (mismo export, mismas props)

`DISENO.md` §4.7, §4.14 y §4.15, y lo que la Fase 1 dejó explícitamente para esta fase (`fase-1-fundamentos.md` §1.5):
`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `popover.tsx`, `command.tsx`, `calendar.tsx`,
`dropdown-menu.tsx`, `tooltip.tsx`, `skeleton.tsx`, `alert.tsx`, `tabs.tsx`, `checkbox.tsx`, y el resto de `input.tsx`
/ `select.tsx` (la Fase 1 solo cambió la altura). **Solo clases y textos de accesibilidad** (sale `rounded-*`, sale
`shadow-lg` → `shadow-(--shadow-overlay)`, `sr-only` "Close" → "Cerrar", header/footer con hairline, overlay
`bg-black/40` sin blur, duraciones de `DISENO.md` §2.4). Ninguna prop ni export cambia: los ~120 consumidores de
dialogs heredan el look sin tocarse. Detalle en §3.11.

### 1.3 Pantallas

Ninguna pantalla de la app cambia de estructura en esta fase. Se ven distintas solo por el revestimiento de §1.2
(todo dialog, sheet, popover, menú, tooltip y tabs de la app). Se prueban en una **página de ejemplo local, no
commiteada** (§4.8).

### 1.4 Fuera de esta fase aunque se vea

- Migrar consumidores (los ~126 selectores, 71 fechas + 9 meses, 71 AlertDialog, ~95 mapas de estado, ~13 grupos de
  KPIs, ~165 vacíos, 80 columnas de acciones, ~390 Cards, ~20 tablas): fases 3, 5, 6.x y 7, según §8.3.
- `DataTable` (toolbar, vacío, acciones en tarjeta, `DataTableFacetedFilter`, `DataTableDateRangeFilter`): Fase 3.
  Usará `EmptyState`, `RowActions`, `Panel` y `ResponsiveDialog` de acá.
- Rangos de fechas, `type="time"`, `_EnumMultiSelect` (toggles) y los pickers que no son combobox (§2.3, §2.4).
- Borrar lo viejo (`enhanced-datepicket`, `year-month-picker`, `multi-select*`, `action-button`, `EditModal`,
  `CardInfo`, alias de Badge/Button/Card): Fase 9, cuando su último consumidor migre.
- Reglas del repo que quedan viejas (`datatable.md` con `<Card>`, `date-pickers.md`): Fase 9, con aprobación.

## 2. Estado actual

Relevamiento con grep (este repo **no** tiene `.codegraph/`). Las rutas son relativas a `src/`. Cada subsección
lista lo que el primitivo reemplaza **con su contrato actual**: ese contrato es lo que el adaptador tiene que
reproducir cuando se migre el módulo (Fase 6). Ninguno se migra en esta fase.

### 2.1 Dialogs, sheets y drawers → `ResponsiveDialog`

**`components/ui/responsive-dialog.tsx` (hoy).** Firma: `{ open; onOpenChange; title: string; description?; children;
footer?; className? }`. Elige rama con `useIsMobile()` (`shared/hooks/use-mobile.tsx`: `matchMedia('(max-width: 767px)')`,
estado inicial `undefined` → **primer render siempre desktop** y salto a Drawer después de hidratar). Drawer:
`max-h-[90vh]`, body en `ScrollArea`, footer por defecto "Cancelar" (`variant="outline"`). Dialog: `sm:max-w-lg`,
footer solo si se pasa. **3 consumidores**, todos en `features/OperatorPanel/components/`: `AddTaskDialog.tsx:201`
(footer dentro de children, repite `sm:max-w-lg`), `CloseWorkOrderDialog.tsx:119` y `ReturnTaskDialog.tsx:84` (con
`footer`). Ninguno usa `description`. Otros consumidores de `useIsMobile`: `components/ui/sidebar.tsx:69` (se queda) y
`Clothing/AllDeliveries/AllDeliveriesList/components/_AllDeliveriesDataTable.tsx:225` (Fase 3/4 lo reemplaza por
container query).

**Primitivos base (estado real tras la Fase 1):**

| Archivo | Hoy | Choca con `DISENO.md` §4.7 |
|---|---|---|
| `components/ui/dialog.tsx` | Root se remonta con `key={generation}` al cerrar; overlay `bg-black/50`; content `rounded-lg border p-6 shadow-lg`, fade+zoom 95 200ms, `max-w-[calc(100%-2rem)] sm:max-w-2xl`; X con `sr-only` "Close" y footer con botón "Close" (**inglés**); título `text-lg` | rounded, `shadow-lg`, sin header/footer con hairline, overlay 50 (spec 40), textos en inglés |
| `components/ui/alert-dialog.tsx` | mismo remount; `rounded-lg p-6 shadow-lg`; `size: 'default' \| 'sm'` (`sm:max-w-lg` / `max-w-xs`); `AlertDialogMedia`; header centrado en mobile; Action/Cancel envuelven `Button` (`variant` default/outline); **nadie usa `size="sm"`** | rounded, sombra, header centrado |
| `components/ui/drawer.tsx` (vaul) | overlay 50; abajo `rounded-t-lg border-t max-h-[80vh] mt-24`; handle `rounded-full`; header centrado; sin cerrar ni remount | `vh` (spec `92dvh`), rounded, sin safe-area |
| `components/ui/sheet.tsx` | remount; `p-6 shadow-lg`; slide 300/500ms; X "Close" (inglés); header/footer `p-4` **sumados** al `p-6` | sombra, padding doble, salida 300ms |

**Importadores** (112 de `dialog`, 9 de `sheet`, 1 de `drawer` en `Formularios/components/forms/FormCard.tsx`):

| Módulo | dialog | sheet | | Módulo | dialog | sheet |
|---|---|---|---|---|---|---|
| Mantenimiento | 38 | 1 | | Clothing | 4 | — |
| Operaciones | 18 | 3 | | shared/components | 4 | — |
| Empresa (Configuración) | 14 | — | | Comercial | 3 | — |
| Dashboard | 7 | — | | UserPermissionsManager | 2 | — |
| Documentación | 5 | — | | Selección | 2 | 1 |
| Checklists | 5 | — | | Equipos | 2 | 1 |
| Formularios | 4 | — | | Ayuda / Layout / Employees / ui | 1 c/u | 2 (Ayuda), 1 (`sidebar.tsx`) |

**Tamaños usados** (116 `DialogContent`, 109 con `max-w-*`, **~25 valores distintos** y ~12 en px arbitrarios; hay
`max-w-*` sin `sm:` que compiten con el default `sm:max-w-2xl`): `max-w-2xl` 15 · `sm:max-w-lg` ~15 · `sm:max-w-md`
10 · `max-w-4xl` 9 · `sm:max-w-[425px]` 7 · `sm:max-w-[500px]` 6 · `sm:max-w-5xl` 6 · `sm:max-w-2xl` 6 · `max-w-5xl`
6 · `max-w-3xl` 6 · `sm:max-w-3xl` 3 · sueltos (`[850px]`, `[820px]`, `[800px]`, `[700px]`, `[650px]`, `[560px]`,
`[520px]`, `[460px]`, `6xl`, `max-w-[90vw]`…). Ejemplos por familia: `UserPermissionsManager/components/ManageRoleUsersDialog.tsx:86`
(2xl), `Empresa/Usuarios/components/EditUserNameDialog.tsx:88` (md), `shared/components/modal/DependencyValidationModal.tsx:141`
(4xl), `Dashboard/Principal/components/VehiclesOnRepairDialog.tsx:229` (5xl), `Clothing/pdf/DeliveryReceiptButton.tsx:132`
(5xl, visor), `Mantenimiento/OrderManagement/components/ManageOrderWizard.tsx:734` (3xl). `SheetContent`: `sm:max-w-2xl`
×3, `sm:max-w-screen` ×2, `sm:max-w-lg`, `[75vw]` ×2.
→ El primitivo los reduce a **5 tamaños** (§3.1); el mapeo de cada valor viejo a su tamaño está en §3.1.

**Modales caseros que también reemplaza:**
- `shared/components/common/EditModal.tsx` (19 líneas): `div fixed` con `bg-white dark:bg-gray-800 rounded shadow-lg`,
  sin foco atrapado, sin Esc, `onClose` sin usar. Firma `{ isOpen; onClose; children }`. Un consumidor:
  `Empresa/Clientes/components/Services/ServiceItemsSection.tsx:195` ("Editar Item").
- `shared/components/modal/DependencyValidationModal.tsx` (274 líneas, `max-w-4xl max-h-[80vh]`): no es una
  confirmación (hay que elegir un reemplazo y llama a `onConfirm('replace', value)`). Pasa a `ResponsiveDialog size="lg"`
  sin cambiar su lógica. Tiene 6 consumidores, todos en Configuración: `Empresa/Equipos/{EquipmentOwners,EquipmentSubTypes,EquipmentTypes}/*Form.tsx`,
  `Empresa/RRHH/{ContractTypes/components/ContractTypeForm,Positions/PositionsFormNew,WorkDiagrams/WorkDiagramForm}.tsx`.
- `Ayuda/components/ConfirmDialog.tsx` y `Ayuda/components/detail/TicketCloseProposalDialog.tsx:229`: `<dialog>` nativo
  con `showModal()`. Ver §2.2.

### 2.2 Confirmaciones → `ConfirmDialog` + `useConfirm()`

El PLAN hablaba de "57 `AlertDialog` a mano". Recontados: **57 archivos importan `alert-dialog`, 55 tienen raíz, con
71 instancias** (`Layout/sidebar/components/NavUser.tsx:152` usa `AlertDialogHeader` dentro de un `Dialog`;
`SimpleDocument.tsx:442` solo usa `AlertDialogCancel`).

| Tipo | Instancias | Qué pasa |
|---|---|---|
| **S** confirmación simple sí/no | **44** | → `useConfirm()` / `ConfirmDialog` |
| **I** pide motivo, fecha o form | 13 | → `ResponsiveDialog size="sm"` con su form (no es un confirm) |
| **M** varias opciones o contenido complejo | 5 | → `ResponsiveDialog size="sm"` con sus botones (no se le agrega un "segundo botón" a `ConfirmDialog`) |
| **F** el AlertDialog solo envuelve un form o un upload | 9 | → `ResponsiveDialog` (hoy es un uso indebido de AlertDialog) |

**Ya existe un `ConfirmDialog`**: `Ayuda/components/ConfirmDialog.tsx` (`<dialog>` nativo), único consumidor
`Ayuda/components/detail/TicketApprovalBanner.tsx`. Props `{ open; onOpenChange; title; description; confirmLabel;
cancelLabel?='Cancelar'; destructive?; busy?; onConfirm(): void }`: mientras `busy` bloquea el cierre y muestra spinner.
Es el precedente de API (regla aprendida: "buscar el precedente antes de inventar"): el primitivo nuevo **adopta sus
nombres de props**. Ese archivo es del módulo de soporte que instala `taskapp-cli` (D6 = a): se migra en 6.10.

**Problema repetido (contrato de hoy que el adaptador tiene que mirar):** la mayoría de las S pone la acción async en
`AlertDialogAction`, que **cierra el diálogo al hacer clic**: el `disabled={isPending}` llega tarde y el diálogo
desaparece antes de que la acción termine. Solo 3 instancias hacen `event.preventDefault()`
(`Empresa/AccesosExternos/components/ExternalAccessActionsCell.tsx:127,151`, `Empresa/General/FiscalData/components/FiscalEnvironmentSection.tsx:250`)
y 7 usan un `Button` propio (`Comercial/Facturacion/components/editor/IncludedCertifications.tsx:100`,
`InvoiceDraftForm.tsx:429/457`, `Empresa/General/FiscalData/components/SalesPointsSection.tsx:196` —con el comentario
"Action cerraría antes"—, `certificate/CsrRequestStep.tsx:98/251`, `UserStatusCell.tsx:208`).
**Async sin ningún guard:** `Empresa/Clientes/components/meansure_units/MensureUnitsTable.tsx:141`,
`Operaciones/PartesDiarios/list/columns.tsx:57`, `Operaciones/Preparte/list/columns.tsx:200`,
`UserPermissionsManager/components/RoleManager.tsx:711`, los 4 ZIP de `Documentacion/Documentos{Empleados,Equipos}/{Mensuales,Permanentes}/components/_*DataTable.tsx:164-165`
y `Employees/Empleados/DocumentosEmpleados/PermanentDocumentsDownloadButton.tsx:100`, y
`Documentacion/TiposDocumentos/components/_VerifyDocumentsDialog.tsx:248` (guard solo en el trigger). Ver decisión 7.1.

**Las 44 simples, por módulo** (C = controlado, T = trigger):

| Módulo (fase) | Archivo:línea — acción |
|---|---|
| Configuración (6.1) | `Empresa/AccesosExternos/components/CreateExternalAccessModal.tsx:184` ¿ya copiaste la clave? · `ExternalAccessActionsCell.tsx:127` rotar clave · `:151` revocar · `:212` ¿ya copiaste? · `Empresa/Clientes/components/meansure_units/MensureUnitsTable.tsx:141` eliminar unidad · `Empresa/General/FiscalData/components/FiscalEnvironmentSection.tsx:250` volver a homologación · `SalesPointsSection.tsx:196` desactivar/eliminar punto de venta · `certificate/CsrRequestStep.tsx:98` descartar CSR · `:251` reemplazar CSR · `Empresa/Usuarios/table/UserStatusCell.tsx:208` confirmar baja de usuario · `UserPermissionsManager/components/RoleManager.tsx:711` eliminar rol |
| Empleados (6.2) | `Employees/EmpleadoID/components/employee-quick-actions.tsx:151` activar · `Employees/Empleados/DocumentosEmpleados/PermanentDocumentsDownloadButton.tsx:100` descargar |
| Equipos (6.3) | `Equipos/EquipoID/components/vehicle-quick-actions.tsx:217` activar · `vehicle-tires/vehicle-tire-diagram-section.tsx:304` aviso config personalizada · `:332` restablecer · `OtherEquipment/components/OtherEquipmentCertifications.tsx:319` eliminar documento · `OtherEquipmentFileUpload.tsx:304` eliminar foto/plano · `OtherEquipmentQuickActions.tsx:198` activar |
| Documentación (6.4) | 4 × `Documentos{Empleados,Equipos}/{Mensuales,Permanentes}/components/_*DataTable.tsx:164-165` descargar ZIP · `TiposDocumentos/components/_VerifyDocumentsDialog.tsx:248` corregir inconsistencias |
| Operaciones (6.5) | `PartesDiarios/detail/components/DeleteRowDialog.tsx:66` eliminar registro · `PartesDiarios/list/columns.tsx:57` eliminar parte · `PartesDiarios/remitManager/components/RemitTab.tsx:138` eliminar/desvincular remito · `Preparte/list/columns.tsx:200` eliminar pedido |
| Mantenimiento (6.6) | `ApprovalInbox/components/ApprovalInboxClient.tsx:516` aprobar tarea · `Gomeria/Catalogo/components/_TiresDataTable.tsx:349` eliminar cubierta · `Gomeria/Marcas/components/_MarcasDataTable.tsx:232` activar/desactivar · `Gomeria/Ordenes/components/_ServiceOrdersDataTable.tsx:283` finalizar · `:307` anular · `Gomeria/Plantillas/components/TemplateAssignDialog.tsx:269` cambiar plantilla · `_TemplatesDataTable.tsx:200` eliminar plantilla · `Gomeria/Tipos/components/_TiposDataTable.tsx:254` activar/desactivar · `OrderManagement/components/ManageOrderDialog.tsx:791` y `ManageOrderWizard.tsx:931` descartar cambios · `TiposReparaciones/RepairTypeForm.tsx:443` eliminar (anidado en form, "Cancel" en inglés) · `shared/components/AllGoodDeviationPromptDialog.tsx:49` ¿registrar desvío? |
| Comercial (6.7) | `Facturacion/components/editor/IncludedCertifications.tsx:100` quitar certificación · `InvoiceDraftForm.tsx:429` descartar borrador · `:457` salir sin guardar |
| Ayuda (6.10) | `Ayuda/components/ConfirmDialog.tsx` → `TicketApprovalBanner.tsx` |
| Código muerto (Fase 9) | `components/ui/action-button.tsx:40` ("Are you sure?", 0 consumidores) |

**No son confirmaciones simples (27)** — van a `ResponsiveDialog` con su contenido intacto:
- I (13): `Employees/EmpleadoID/components/employee-quick-actions.tsx:126` baja con motivo y fecha ·
  `Equipos/EquipoID/components/vehicle-quick-actions.tsx:125` y `OtherEquipment/components/OtherEquipmentQuickActions.tsx:117`
  baja · `Equipos/EquipoID/components/vehicle-tires/DisplacedTiresDialog.tsx:91` destino de cubiertas ·
  `Empresa/General/FiscalData/components/FiscalEnvironmentSection.tsx:173` pasar a producción (CUIT) ·
  `Empresa/Usuarios/table/UserStatusCell.tsx:183` datos de baja · `Mantenimiento/MaintenanceOrders/components/OrderDetailDialog.tsx:855/882/910/937`
  rechazos y devolución con motivo · `Mantenimiento/Operaciones/components/RechazarOperacionDialog.tsx:50` ·
  `Mantenimiento/OrderManagement/components/wizard/Step1Tasks.tsx:359` · `Mantenimiento/PedidosMantenimiento/Pendientes/components/RechazarPedidoDialog.tsx:62`.
- M (5): `Comercial/Facturacion/components/editor/IssueInvoiceDialog.tsx:122` emitir en ARCA ·
  `Documentacion/TiposDocumentos/components/_ToggleDocTypeDialog.tsx:300` · `Empresa/Usuarios/table/UserStatusCell.tsx:161,228`
  cascada · `UserPermissionsManager/components/ModulePermissions.tsx:569` limpiar permisos (2 opciones).
- F (9): `Documentacion/Documentos{Empleados,Equipos}/{Mensuales,Permanentes}/columns.tsx` (subir documento, ×4) ·
  `Documentacion/shared/components/NewDocumentMulti.tsx:42` · `Empresa/CCT/components/Add{Category,Covenant,Guild}Modal.tsx:72` ·
  `Empresa/General/Documentacion/components/AddCompanyDocumentForm.tsx:125`.

**Nativos:** un solo `confirm()` en `Operaciones/PartesDiarios/remitManager/components/DocumentViewer.tsx:15` (viola
`no-native-dialogs.md`; pasa a `useConfirm()` en 6.5). `IssueInvoiceDialog.tsx:221` es una función local (falso positivo).

### 2.3 Selectores de fecha → `DatePicker` / `FormDatePicker`

**Componentes compartidos de hoy:**

| Componente | `value` | `onChange` | Muestra | ¿Escritura? | Modo | Notas |
|---|---|---|---|---|---|---|
| `components/ui/enhanced-datepicket.tsx` `EnhancedDatePicker` | `date?: Date \| string` (lo normaliza con `moment`) | `setDate(Date \| undefined)`; si lo escrito es inválido o menor a `minDate`, emite `undefined` | `DD/MM/YYYY` | **Sí** (parseo estricto `moment(raw,'DD/MM/YYYY',true)`) | fecha | solo `minDate` (va como `fromDate`, deprecado en rdp 9). Estado interno inicializado **una sola vez**: los consumidores fuerzan el reset con `key` (`DiagramFormUpdated:467/484`) |
| `components/ui/year-month-picker.tsx` `YearMonthPicker` | `date?: Date` | `setDate(Date)`: día de hoy con mes y año cambiados | `MMMM yyyy` | No (2 `Select`, año ±5) | mes-año | date-fns; también se resetea con `key` (`HeadcountTrendChart:118`, `AbsenteeismTrendChart:106`) |
| `components/ui/FormItemDatePicker.tsx` | `{from?, to?}` | `field.onChange(range)` | `dd MMM yyyy - …` | No | **rango** | fuera de alcance |
| `shared/components/data-table/filters/data-table-date-picker.tsx` `DataTableDatePicker` | `Date \| null` | `setDate(Date \| null)` + `clearFilter` | `PPP` | No | fecha (filtro) | toolbars viejas (Fase 5) y `DailyReportWrapper` |
| `features/Operaciones/PartesDiarios/components/DatePicker.tsx` | `Date \| undefined` | `setDate(Date \| undefined)` | `PPP` | No | fecha | se usa como compartido (`DiagramDetailTable.tsx:237`) |
| `shared/components/common/DataTable/DataTableDateRangeFilter.tsx` | URL `<col>_from/_to` (`YYYY-MM-DD`) | escribe en la URL | `DD/MM` | No | **rango** | fuera de alcance (~99 configs `dateRange` en 58 tablas; Fase 3 le cambia solo la piel) |
| `components/ui/calendar.tsx` `Calendar` | según `mode` | `onSelect` | — | — | single/multiple/range | fuerza `locale={es}` de date-fns (lo exige rdp: es el objeto `Locale` de date-fns, se conserva) |

**Usos por módulo (fecha individual = en alcance).** E = ya permite escribir. Valor = lo que guarda el form hoy.

| Módulo | Ubicación | Impl. | RHF | Valor | E | Restricciones |
|---|---|---|---|---|---|---|
| Comercial | `Facturacion/components/editor/InvoiceHeaderFields.tsx:95` (issueDate) | Enhanced | Sí | `'YYYY-MM-DD'`, vacío `''` (`toPickerDate/fromPickerDate :21-26`) | Sí | — |
| Comercial | `…InvoiceHeaderFields.tsx:155/172/189` (serviceFrom/To, paymentDueDate) | Enhanced | Sí | `'YYYY-MM-DD' \| null` | Sí | — |
| Comercial | `Certificaciones/components/CertificacionesPanel.tsx:322/335` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | par desde/hasta |
| Comercial | `ReglasPrecio/components/ReglasPrecioPanel.tsx:180` | nativo date | No | `'YYYY-MM-DD'` (useState) | Sí | — |
| Comercial | `Comerce/components/DailyReportWrapper.tsx:591/601` | DataTableDatePicker | No | `Date \| null` | No | filtro desde/hasta |
| Documentación | `shared/components/UploadDocumentMultiEquipment.tsx:236`, `UploadDocumentMultiEmployee.tsx:233` (validity) | Enhanced | Sí | **string ISO** (`date?.toISOString()`) | Sí | — |
| Documentación | `…UpdateDocuments.tsx:131` | Enhanced | Sí | `Date` | Sí | `minDate=hoy` |
| Documentación | `…ReplaceDocument.tsx:147+189` | **copia a mano** de Enhanced | Sí | `Date` | Sí | rechaza pasadas |
| Documentación | `…SimpleDocument.tsx:403` | nativo date | Sí | `'YYYY-MM-DD'` (en el submit `moment(v).utc().format()`) | Sí | — |
| Empleados | `Diagrams/DiagramFormUpdated.tsx:466/483` | Enhanced | Sí | `Date` | Sí | par |
| Empleados | `Diagrams/table/DiagramDetailTable.tsx:237` | DatePicker PD | No | `Date \| null` | No | filtro |
| Empleados | `components/shared/TerminationFormFields.tsx:82+101` | nativo + Calendar | Sí | `Date` | Sí | `≤ hoy`, `≥ 1900` |
| Empleados | `shared/forms/PersonalDataFields.tsx:193` (born_date) | nativo date | Sí | `'YYYY-MM-DD'` | Sí | — |
| Empleados | `EmpleadoID/components/forms/employee-work-data-form.tsx:364` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | — |
| Equipos | `EquipoID/forms/vehicle-basic-data-form.tsx:768/813` (contrato inicio/fin) | Calendar a mano | Sí | `Date` | No | cruzadas inicio≤fin; años −1/+10 |
| Equipos | `…vehicle-basic-data-form.tsx:883` | nativo date | Sí | `Date` (`moment(v,'YYYY-MM-DD').toDate()` / `null`) | Sí | — |
| Equipos | `EquipoID/components/vehicle-quick-actions.tsx:183` | Calendar a mano | Sí | `Date` | No | `≤ hoy`, `≥ 1900` |
| Equipos | `OtherEquipment/components/OtherEquipmentQuickActions.tsx:171` | Calendar a mano | Sí | `Date` | No | `≤ hoy`, `≥ 1900` |
| Equipos | `OtherEquipment/components/OtherEquipmentCertifications.tsx:229` | Calendar a mano | Sí | `Date \| null` | No | años −1/+20 |
| Equipos | `OtherEquipment/components/OtherEquipmentBasicDataForm.tsx:525/650/676/748` | nativo date | Sí | `Date` (→ `YYYY-MM-DD` en el submit) | Sí | `:525` `≤ hoy` |
| Operaciones | `Preparte/components/preparte-form/CustomerContractSection.tsx:132/287` | Calendar a mano | Sí | `Date` | No | `:132` ignora futuras en `onSelect`; `:287` `≥ hoy` |
| Operaciones | `Preparte/components/preparte-form/ItemsSection.tsx:357` | Calendar a mano | No | `{from,to}` iguales | No | edición |
| Operaciones | `Preparte/components/PreparteReportModal.tsx:508/521` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | par |
| Operaciones | `Preparte/components/PreparteBulkStatusModal.tsx:202`, `Preparte/list/columns.tsx:271` | nativo date | No | `'YYYY-MM-DD'` | Sí | `min=hoy` |
| Operaciones | `PartesDiarios/components/DailyReportForm.tsx:104` | Calendar a mano | Sí | `Date` | No | `≥ ayer` |
| Operaciones | `PartesDiarios/detail/components/BulkEditModal.tsx:460` | Calendar a mano | No | `Date` | No | `≥ minRescheduleDate` |
| Operaciones | `PartesDiarios/detail/components/DailyReportRowForm/ScheduleSection.tsx:131` | Calendar a mano | Sí | `Date` | No | `≥ hoy` |
| Operaciones | `Certificacion/components/form-sections/DateTimeSection.tsx:57` | Calendar a mano | Sí | `Date` (→ `yyyy-MM-dd` en el submit) | No | `< hoy` |
| Mantenimiento | `Planificacion/components/AsignarTallerDialog.tsx:493/520`, `AsignarBulkDialog.tsx:408/429` | Calendar a mano | No | `Date \| undefined` | No | fin ≥ inicio |
| Mantenimiento | `PedidosMantenimiento/components/PlanificarPedidoDialog.tsx:172` | nativo date | No | `'YYYY-MM-DD'` | Sí | `min=hoy` |
| Mantenimiento | `OrderManagement/components/wizard/Step4Confirm.tsx:161/165`, `GenerateWorkOrderDialog.tsx:149/153` | nativo date | No | `'YYYY-MM-DD'` | Sí | par |
| Configuración | `Empresa/Clientes/components/Services/PriceRevisionsDialog.tsx:222` | Enhanced | Sí | `Date` | Sí | — |
| Configuración | `Empresa/Clientes/components/Services/ServicesForm.tsx:266` (×2 por `.map`) | Calendar a mano | Sí | `Date` (solo si hay fecha) | No | — |
| Configuración | `Empresa/Clientes/components/CustomerForm.tsx:392` | nativo date | Sí | `Date \| null` vía `new Date('YYYY-MM-DD')` (**UTC**: puede correr un día) | Sí | — |
| Configuración | `Empresa/General/FiscalData/components/IssuerFiscalForm.tsx:198` | Enhanced | Sí | `'YYYY-MM-DD'` / `''` | Sí | — |
| Configuración | `Empresa/General/Documentacion/components/AddCompanyDocumentForm.tsx:198` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | `min=hoy` |
| Dashboard | `Dashboard/Principal/components/ServicesDetailDialog.tsx:120` | Calendar a mano | No | `Date` | No | — |
| Dashboard | `Dashboard/Estadisticas/KPIs/components/KpiForm.tsx:208`, `KpiEditNumberForm.tsx:108` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | — |
| Formularios | `Checklists/components/sections/ChecklistItemField.tsx:281`, `ChecklistGeneralInfoSection.tsx:432` | nativo date | Sí | `'YYYY-MM-DD'` | Sí | — |
| Formularios | `Formularios/components/forms/Inputs.tsx:418` (DateField) | Calendar a mano | Sí | `Date` | No | — |
| Formularios | `…Inputs.tsx:736/802` (DateInput, SeccionDate) | nativo date | Sí | `'YYYY-MM-DD'` derivado con `toISOString()` (UTC) | Sí | — |
| Selección | `Seleccion/components/PreEmployeeDocumentChecklist.tsx:271` | nativo date | No | `'YYYY-MM-DD'` | Sí | — |

**Mes / mes-año (9):** `YearMonthPicker` en `Documentacion/shared/components/UploadDocumentMulti{Equipment:255,Employee:252}`
(guardan `'YYYY-MM'`), `Dashboard/Estadisticas/RecursosHumanos/components/{HeadcountTrendChart:116,AbsenteeismTrendChart:104}`
(guardan `Date`); `type="month"` en `UpdateDocuments.tsx:153`, `ReplaceDocument.tsx:224` (los dos **sin `value` enlazado**,
`form.setValue`), `SimpleDocument.tsx:420`, `AddCompanyDocumentForm.tsx:219` (`'YYYY-MM'`; en los 4 el `min` está en
formato `YYYY-MM-DD`, que el input month ignora); Calendar usado como mes en
`Dashboard/Estadisticas/Mantenimiento/components/MaintenanceByTypeCard.tsx:156` (estado `moment`, meses futuros off).

**Fuera de alcance:** 11 rangos a mano + 1 `multiple` (`CloneRowsDialog.tsx:317`, inline), `FormItemDatePicker`
(`DiagramMassiveForm.tsx:547`), `DataTableDateRangeFilter`, 7 `type="time"` (quedan nativos: no hay pedido de unificar
horas) y las 12 vistas previas decorativas de `Formularios/components/forms/Inputs.tsx` (rama `!form`).

**Totales:** **71 fechas individuales** (11 Enhanced + 23 Calendar a mano + 1 copia a mano + 6 DataTableDatePicker +
1 DatePicker de PD + 30 nativos; 43 ya permiten escribir) y **9 de mes**. Tipos de valor que tiene que reproducir el
adaptador: `Date`, `Date | null`, `'YYYY-MM-DD'` (vacío `''` o `null`), string ISO completo, `'YYYY-MM'` y `Date` de
mes.

**Locale:** no hay `moment.locale('es')` global. Se activa de rebote por `import 'moment/locale/es'` en ~25 archivos
y por llamadas a nivel de módulo (`Mantenimiento/utils/dateFormat.ts:5`, `KpiChart.tsx:32`,
`CloneRowsConflictView.tsx:12`). El primitivo no puede depender de eso: formatea siempre con patrones numéricos
(`DD/MM/YYYY`, que no dependen del locale) y, para el nombre del mes, importa `moment/locale/es` él mismo.

**date-fns** (regla `moment-dates.md`): ~25 imports, todos para mostrar o serializar. Los que viven en los
componentes que el primitivo reemplaza desaparecen cuando se migra cada uso. `calendar.tsx` conserva el `es` de
date-fns porque rdp lo exige como tipo `Locale` (no es manejo de fechas).

**Deuda previa detectada en fechas (no se arregla acá, va a §9 del PLAN):** UTC que corre el día en `CustomerForm.tsx:396-397`
e `Inputs.tsx:737/803`; `min` inválido en los 4 `type="month"`; props deprecadas de rdp 9 (`initialFocus`,
`fromDate`, `fromYear/toYear`) en casi todos los Calendar a mano.

### 2.4 Selectores con búsqueda / multiselect → `SearchSelect`

**Componentes compartidos de hoy:**

| Componente | Valor | `onChange` | Búsqueda | Chips / extras | Usos |
|---|---|---|---|---|---|
| `components/ui/multi-select-combobox.tsx` `MultiSelectCombobox` | entra `string \| string[]` | **siempre `string[]`**. Con `maxSelections={1}` devuelve `[id]` y al deseleccionar `['']`; con `max>1`, al llegar al tope **reemplaza el primero** | local (`includes` sobre `label`, `CommandItem value={label}`) | sin chips: el trigger dice "N recursos seleccionados" para cualquier entidad; `showSelectAll` con `x/y` que excluye `selectedResourceDocuments[].applies`; `isLoading` (spinner, "Cargando..."); `closeOnSelect`; `data-testid`; `cuit` sin usar; lista `CommandGroup max-h-64` sin `CommandList`, popover `w-full` (no el ancho del trigger), sin virtualizar | **58 en 28 archivos** (11 con `max=1`) |
| `components/ui/multi-select.tsx` (compuesto) | `values?: string[]` | `onValuesChange(string[])` | local | chips removibles, `+N` roto (`overflowRef` comentado); renderiza los children dos veces | 1 (`Dashboard/Estadisticas/RecursosHumanos/components/charts/employee-gender-position-chart.tsx:81`, value = **nombre** del puesto) |
| `shared/components/common/_MultiSelectField.tsx` | `selected: string[]` | `onChange(ids)` | **servidor** (`searchFn(query)`, React Query `[...queryKey, debounced]`, 300ms, `enabled: open`, `shouldFilter={false}`) | chips debajo; `initialOptionsMap` para hidratar nombres; `maxSelections` (ignora el excedente); "Seleccionar todo" si ≤10 visibles y "Limpiar"; label propio; popover 300px fijo | 2 (`Documentacion/TiposDocumentos/components/_EmployeeConditions.tsx:50`, `_EquipmentConditions.tsx:55`) |
| `shared/components/common/_EnumMultiSelect.tsx` | `selected: string[]` | `onChange(string[])` | — (chips toggle en línea, no es combobox) | label con contador | 2 (`_EmployeeConditions.tsx:73`, `_EquipmentConditions.tsx:81`). **Queda fuera** de `SearchSelect`: es un grupo de toggles (`ToggleGroup`), no un selector |
| `features/Mantenimiento/shared/components/SearchableSelect.tsx:44` | `value: string` | `onValueChange(string)` | local | `keywords`, `disabled`, `trailing` por opción | 6: `Mantenimiento/OrderManagement/components/AddItemDialog.tsx:167`, `AssignSectorsPanel.tsx:272/296/314`, `wizard/Step2SectorAssignment.tsx:296`, `SolicitudesMantenimiento/components/ReassignSupervisorDialog.tsx:133` |
| `features/OperatorPanel/components/RepairTypeCombobox.tsx:27` | `value: string` | `onValueChange(string)` | local | `hasError` | 2 (`AddTaskDialog.tsx:309/418`, en `<form>` nativo) |

**Usos de `MultiSelectCombobox` por módulo** (M = múltiple, S = `max=1`):
- **Configuración (6.1)**: `Empresa/Clientes/components/area_clientes/AreaFormDialog.tsx:215` M provincias (**`number[]`**: `values.map(Number)`) · `:272` M contratos (`linkAreaToContracts`, conjunto final) · `Empresa/Clientes/components/CustomerDetail/AssignmentDialog.tsx:157` M + todos, empleados con `[legajo]` o equipos, **altas y bajas explícitas** `{add, remove}` con `diffAssignments(baseline, selected)` (la referencia de la regla M:M) · `Empresa/Clientes/components/Services/ServicesForm.tsx:197/215` M áreas/sectores · `Empresa/Equipos/EquipmentSubTypes/EquipmentSubTypeForm.tsx:429/452` · `Empresa/Equipos/EquipmentTypes/EquipmentTypeForm.tsx:487/519` · `Empresa/RRHH/AptitudesTecnicas/AptitudesForm.tsx:169` · `Empresa/RRHH/Positions/PositionsFormNew.tsx:218/238` · `Empresa/RRHH/WorkDiagrams/WorkDiagramForm.tsx:371` (todas M en RHF, **conjunto final**).
- **Empleados (6.2)**: `Employees/Diagrams/components/EmployeeFilterPanel.tsx:250,263,276,289,302,318` (6 M filtros) · `Employees/Diagrams/EmployeesDiagramWrapper.tsx:254…442` (8 M + todos; `'__none__'` como opción especial) · `Employees/Diagrams/DiagramEmployeeView.tsx:262` M + todos · `Employees/Diagrams/DiagramFormUpdated.tsx:424` S empleados **con legajo**, el campo **guarda el array** · `:443` S tipo de novedad (array) · `Employees/EmpleadoID/components/forms/employee-work-data-form.tsx:526` M sectores de taller (conjunto final).
- **Documentación (6.4)**: `Documentacion/shared/components/UploadDocumentMultiEmployee.tsx:206` M + todos, ~650 empleados **sin legajo**, deshabilita los que ya tienen documento · `UploadDocumentMultiEquipment.tsx:210` idem equipos (opciones del server component `NewDocumentMulti.tsx:26/32`).
- **Operaciones (6.5)**: `Operaciones/Preparte/components/preparte-form/CustomerContractSection.tsx:50/82` S (`ids[0] || ''` + resets) · `ItemsSection.tsx:100` S, **setter con objeto** · `LocationSection.tsx:101/159` S · `:192` S con **campo array**.
- **Mantenimiento (6.6)**: `Mantenimiento/TiposReparaciones/MaintenanceGroupForm.tsx:182` M (conjunto final).
- **Comercial (6.7)**: `Comercial/Comerce/components/DailyReportWrapper.tsx:476…579` (9 M filtros: clientes, servicios, ítems, equipos del cliente, áreas, sectores, **empleados ~650 sin legajo**, **equipos ~380**, estado) · `Comercial/Facturacion/components/new/CertificationsInvoiceForm.tsx:156` S · `ManualInvoiceForm.tsx:89` S (`values[0] ?? ''`).
- **Dashboard (6.9)**: `Dashboard/Estadisticas/Mantenimiento/components/CategorySection.tsx:191`, `MaintenanceByTypeCard.tsx:185`, `Dashboard/Estadisticas/Operaciones/components/OperacionesChartsClient.tsx:398/410`, `Dashboard/Estadisticas/SalaDeControl/components/DesviosChartsClient.tsx:245`, `OrderManagementClient.tsx:341`, `Dashboard/Principal/shared/CookieFilter.tsx:33` (todos M + todos, filtros fuera de form).

**Comboboxes a mano (Popover/Dialog + `Command`): ~57 instancias en 22 archivos.**
- **Equipos (6.3)**: `Equipos/EquipoID/forms/vehicle-basic-data-form.tsx:234,306,365,460,515,660,710` (7 S catálogos, `form.setValue(campo, id)`) · `Equipos/OtherEquipment/components/OtherEquipmentBasicDataForm.tsx:158,206,256,311,564,609` (6 S) y `:810` S vehículos ~380 (solo por dominio, opción "Sin vincular" → `null`).
- **Empleados (6.2)**: `Employees/shared/forms/ContactDataFields.tsx:107/169` provincia/ciudad (**`number`**).
- **Documentación (6.4)**: `Documentacion/shared/components/SimpleDocument.tsx:252` S empleados/equipos sin legajo (`shouldFilter={false}`, filtro propio por nombre o documento) · `:339` tipo de documento · `UploadDocumentMulti{Employee:157,Equipment:160}` tipo de documento (`CommandItem value=id`: **no se puede buscar por nombre**).
- **Operaciones (6.5)**: `Operaciones/Certificacion/components/form-sections/CustomerDataSection.tsx:124,179,242,322,387` S en cascada · `:445` M · `ResourcesSection.tsx:109` M empleados **sin legajo** · `:236` M equipos · `Operaciones/PartesDiarios/detail/components/DailyReportRowForm/CustomerServiceSection.tsx:148,213,290,383,459` S en cascada · `:524` M · `EmployeeSection.tsx:44` (`EmployeeCommandList` reusada 5 veces: `chofer_dia:323`, `ayudante_dia:343`, `chofer_noche:369`, `ayudante_noche:389`, `employees:422`; **con legajo**, agrupada por puesto, marca "no asignados") · `EquipmentSection.tsx:89/309` M agrupada por tipo · `JornadaSection.tsx:51` S enum.
- **Mantenimiento (6.6)**: `Mantenimiento/AnonymousLogin/components/EquipmentSelectionStep.tsx:64` S **servidor** (mín. 2 caracteres; **sin `shouldFilter={false}`**: cmdk filtra de nuevo) · `Mantenimiento/NuevoPedido/components/nuevo-pedido/StepEquipmentSelector.tsx:98` S (`shouldFilter={false}`, límite `MAX_RESOURCE_RESULTS` y **el único aviso "Mostrando X de Y" bien ubicado**, `:111-124`) · `StepSupervisor.tsx:140` · `NuevoPedidoForm.tsx:292` S equipos (**`slice(0,50)` sin aviso**) · `:430` M tipos de reparación · `:482` acción "agregar grupo" · `Mantenimiento/shared/components/AdditionalDeviationModal.tsx:225`, `critical-deviations-repair-modal.tsx:361` (supervisores) · `ManualRepairsInput.tsx:492/623` · `Mantenimiento/Gomeria/Plantillas/components/TemplateAssignDialog.tsx:190` M en **Dialog**, altas y bajas explícitas.
- **Formularios (6.8)**: `Checklists/components/sections/ChecklistGeneralInfoSection.tsx:281` S chofer con legajo, **guarda el nombre** (`field.onChange(fullName)` + `setValue('chofer_employee_id', id)`) · `Checklists/components/sections/HitchEquipmentDialog.tsx:59` (Dialog con Command).
- **Shell / campo (fuera de las 6.x)**: `Layout/sidebar/components/CompanySwitcher.tsx:131` (empresas; el único con `side` según mobile) y `OperatorPanel/components/OperatorHeader.tsx:92` (Fase 7).

**`Select` plano sobre listas grandes** (sin búsqueda): `Checklists/components/sections/ChecklistGeneralInfoSection.tsx:93`
equipos ~380 · `Formularios/components/forms/Inputs.tsx:~555-610` (`PredefinedSelectField`, vehículos). Con clientes o
contratos (decenas): `ChecklistGeneralInfoSection.tsx:237`, `Comercial/Certificaciones/components/CertificacionesPanel.tsx:274`,
`Empresa/Clientes/components/Services/ServicesForm.tsx:180`, `Empresa/Contactos/components/ContactComponent.tsx:180`,
`Comercial/ReglasPrecio/components/PriceRuleFormDialog.tsx:252`. Pasar a `SearchSelect` cambia el control, no el
valor: se decide en la fase del módulo (no es obligatorio).

**Fuera de alcance de `SearchSelect`** (no son comboboxes): filtros facetados del DataTable (`DataTableFacetedFilter`
y las 4 copias viejas, Fases 3/5), `Mantenimiento/shared/components/ChecklistItemPicker.tsx`,
`Mantenimiento/Gomeria/Ordenes/components/TireReplacePicker.tsx`, `Clothing/ClothingDelivery/components/StepSelectEmployee.tsx`
(búsqueda en servidor con `Input`, ya bien según `crecimiento.md`), `Operaciones/PartesDiarios/detail/components/{Employee,Equipment}Selector/*Dialog.tsx`
(DataTable con selección), `UserPermissionsManager/components/RoleTemplateSelector.tsx`, `Employees/Diagrams/components/EmployeeSelectionGrid.tsx`.

**Totales:** 58 `MultiSelectCombobox` + 1 `multi-select` + 2 `_MultiSelectField` + 6 `SearchableSelect` + 2
`RepairTypeCombobox` + ~57 a mano = **~126 selectores** que pasan a `SearchSelect` (más 7 `Select` grandes opcionales).

**Contratos que el adaptador tiene que respetar** (no se tocan schemas ni server actions):
1. **Forma del valor**: `string` (id), `string[]`, `[id]` en un campo array con `max=1`
   (`DiagramFormUpdated:424/443`, `LocationSection:192`), `''` al deseleccionar en lugar de `null`, el **`['']`** que
   produce `MultiSelectCombobox` al deseleccionar con `max=1`, `number` / `number[]` (`ContactDataFields`,
   `AreaFormDialog:215`), el **nombre** en vez del id (`ChecklistGeneralInfoSection:281`), objeto
   (`ItemsSection:100`) y `null` explícito ("Sin vincular", `OtherEquipmentBasicDataForm:810`).
2. **Tope**: "reemplaza el primero" (`MultiSelectCombobox`) vs "ignora el excedente" (`_MultiSelectField`).
3. **M:M**: solo `AssignmentDialog` y `TemplateAssignDialog` mandan altas y bajas explícitas; el resto manda el
   conjunto final al form y la server action decide. El primitivo **no cambia eso**: devuelve el valor que hoy recibe
   el form (§3.4). Pasar las otras M:M a altas/bajas explícitas es cambio de server action: fuera de este rediseño
   (§5 y pregunta 7.6).
4. **Legajo**: lo muestran `DiagramFormUpdated`, `AssignmentDialog`, `EmployeeSection` y `ChecklistGeneralInfoSection`.
   **No lo muestran** `DailyReportWrapper:555`, `UploadDocumentMultiEmployee:206`, `SimpleDocument:252` y
   `ResourcesSection:109`: viola `employee-file-number.md`. Agregarlo al label es un cambio de UI que el primitivo
   hace por defecto con `getEmployeeOptionLabel` (§3.4), siempre que la query ya traiga `file_number`; si no lo trae,
   sumar el campo al `select` es cambio de query (se pregunta en la fase del módulo, 7.5).
5. **Mobile**: ninguno usa Drawer/Sheet; el popover del combobox dentro de un Dialog funciona porque Radix porta al
   `body` y el `DismissableLayer` lo apila.

**Avisos "Mostrando N de M":** bien ubicado solo en `StepEquipmentSelector.tsx:111-124` (`role="status"`, fuera del
scroll; es el precedente del primitivo). `Operaciones/PartesDiarios/remitManager/components/LinkRemitoDialog.tsx:104`
lo tiene **dentro** del área con `overflow-auto` (regla aprendida). `NuevoPedidoForm.tsx:98` corta en 50 sin avisar.

### 2.5 Estados → `StatusBadge` + `statusToneMap`

**`components/ui/badge.tsx` (tras la Fase 1):** variantes con tokens `success | warning | danger | info | neutral |
brand | outline | ghost | link`; alias `yellow`→warning, `destructive`/`red`→danger, `secondary`→neutral,
`default`→brand (se borran en la Fase 9). Ninguna lleva ícono: el estado sigue siendo "solo color" en los
consumidores (A-15 de la auditoría de la Fase 1).

**`shared/utils/mappers.ts`:** 21 mapas de labels (`employeeStatusLabels`, `conditionLabels`, `dailyReportStatusLabels`,
`dailyReportRowStatusLabels`, `documentStateLabels`, `repairCriticityLabels`, `otherEquipmentStatusLabels`…) +
`getEnumLabel`. Solo **4 mapas de variante**: `employeeStatusBadges:135`, `dailyReportStatusBadges:158`,
`dailyReportRowStatusBadges:178`, `documentStateBadges:248`. Sin íconos. Los importan 7 archivos.

**~95 mapas locales estado → variante/clases**, que **se contradicen** (el `statusToneMap` es justamente para eso):

| Dominio | Mapas (ruta:línea) | Contradicción |
|---|---|---|
| Documento (9) | `mappers.ts:248`; `Documentacion/Documentos{Empleados,Equipos}/{Mensuales,Permanentes}/columns.tsx:43/43/43/59`; `Dashboard/Documentacion/{Empleados:34,Vehiculos:33}/columns.tsx`; `Documentacion/DetalleDocumento/lib/document-detail.ts:45` (`documentStateBadgeVariant`) y `:61` (`denyReasonBadgeVariant`) | `pendiente` es `secondary`, `destructive` o `default` según el archivo |
| Estado de recurso (5) | `mappers.ts:135`; `Empresa/Equipos/EquipmentOwners/equipmentByOwnerColumns.tsx:52` (+ `statusIcons`); `Employees/Empleados/components/tables/data/columns.tsx:377` (claves con espacios); `Operaciones/PartesDiarios/detail/components/{EmployeeSelector:352,EquipmentSelector:151}/columns.tsx` | — |
| Condición de equipo (15 + ~9 ternarios) | `Equipos/Equipos/VehicleList/columns.tsx:38` (lo usa `vehicle-header.tsx:116`), `Equipos/OtherEquipment/list/columns.tsx:38`, `Equipos/Equipos/DadosDeBaja/{Vehiculos,OtrosEquipos}/components/columns.tsx:38/37`, `equipmentByOwnerColumns.tsx:36`, `PartesDiarios/detail/components/EquipmentSelector/columns.tsx:40`, `Mantenimiento/WorkshopTracking/workshopTrackingColumns.tsx:28`, `Mantenimiento/PedidosMantenimiento/Confirmados/columns.tsx:205`, `ServiceDetailDialog.tsx:75`, `Mantenimiento/Operaciones/components/{columns:90,columnsReadonly:82}.tsx`, `ParaTaller/components/columns.tsx:88`, `Confirmados/components/columns.tsx:108`, `Mantenimiento/EquipmentDashboard/components/equipment-dashboard-client.tsx:67`; ternarios en `StepEquipmentSelector.tsx:248`, `AprobarEntradaTallerDialog.tsx:115`, `OperacionDetailDialog.tsx:47`, `ParaTallerDetailDialog.tsx:91`, `EntradaTallerDialog.tsx:177/130`, `PlanificacionDetailDialog.tsx:72` | `en_reparacion` es `yellow` o `destructive`; claves `'no operativo'` con espacio en 4 mapas |
| Pedido / orden de mantenimiento (13) | `Equipos/EquipoID/components/{equipment-order-detail-dialog:59,vehicle-operations-history:61}.tsx`, `Mantenimiento/MaintenanceOrders/table/columns.tsx:48`, `MaintenanceOrders/components/columns.tsx:116`, `Mantenimiento/Operaciones/components/columnsReadonly.tsx:110`, `PedidosMantenimiento/components/{columns:82,PedidoDetailDialog:27}.tsx`, `PedidosMantenimiento/Pendientes/{columns:37,components/columns:96}.tsx`, `SolicitudesMantenimiento/tableColumns.tsx:48`, `WorkshopTracking/workshopTrackingColumns.tsx:46`, `Equipos/OtherEquipment/maintenance/columns.tsx:23`, `Mantenimiento/WorkshopView/WorkshopSectorTasksTable/work-order-status.ts:31` | `in_workshop` `info`/`default`; `scheduled` `success`/`secondary` |
| Solicitud (3) | `SolicitudesMantenimiento/tableColumns.tsx:42`, `components/SolicitudDetailDialog.tsx:34/40` | — |
| OT (7) | `Mantenimiento/shared/work-order-types.ts:136`, `work-order-status.ts:41`, `MaintenanceOrders/components/{SectorCard:106,ExternalWorkshopCard:15}.tsx`, `equipment-order-detail-dialog.tsx:107`, `OperatorPanel/components/{WorkOrderDetail/WorkOrderHeader:18,WorkOrderCard:28}.tsx` | `paused` sale de 4 formas; `in_progress` de 3 |
| Tarea / sector de taller (8) | `SectorCard.tsx:48,72,90`, `equipment-order-detail-dialog.tsx:68,90`, `MaintenanceOrders/components/order-detail/types.ts:35`, `SectorTimeline.tsx:27,35` (`bg-blue-100…` crudo) | — |
| Prioridad / criticidad (6) | `work-order-types.ts:156`, `WorkOrderHeader.tsx:34`, `WorkOrderCard.tsx:21`, `Mantenimiento/Planificacion/components/AsignarTallerDialog.tsx:567`, `OperatorPanel/components/WorkOrderDetail/TaskCard.tsx:14`, `Ayuda/constants/ticket-priority.ts:14` | — |
| Parte diario / preparte (9) | `mappers.ts:158/178`, `Operaciones/PartesDiarios/utils/utils.ts:5` (duplica mappers), `Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx:67/388` (no coinciden entre sí), `PartesDiarios/components/ServiceDetailModal.tsx:94`, `Operaciones/Preparte/list/columns.tsx:99`, `Preparte/components/PreparteDetailModal.tsx:42`, `Preparte/components/StatusCardsServerContainer.tsx:6` | — |
| Factura / certificación / fiscal (10) | `Comercial/Facturacion/components/InvoiceStatusBadge.tsx:16/26/37`, `Comercial/Certificaciones/components/CertificationStatusBadge.tsx:9`, `Empresa/General/FiscalData/components/{environment-styles.ts:8,SalesPointsSection:30,ArcaCertificateSection:298,FiscalReadinessSummary:21,certificate/CertificateWizardStep:12}`, `Comercial/Facturacion/components/{editor/IssueInvoiceDialog:33,InvoicingNotices:16}.tsx` | clases completas sobre `variant="outline"` |
| Otros dominios | Tickets `Ayuda/constants/ticket-status.ts:9` (paleta cruda); gomería `Mantenimiento/Gomeria/shared/tire-mappers.ts:14/44/64`; checklist `Checklists/ChecklistAnswers/columns.tsx:27` (`passed`=`default`); selección `Seleccion/lib/state-machine.ts:123`; indumentaria `Clothing/utils/mappers.ts:10`; reparación en español `Mantenimiento/shared/components/status-badge.tsx:19` | — |
| No son estados de negocio (se quedan) | `ACTION_COLORS` (`RolePermissionsEditor.tsx:53`, `ModulePermissions.tsx:67`), `HistoryModal.tsx:95`, `ValidationHistoryList.tsx:17`, `ActivityHistoryModal.tsx:91/255`, `commentStyleConfig` (`ItemComments.tsx:19`, regla aprendida: es el mapa compartido de roles de comentario), `RadialGauge.tsx:18`, `Ayuda/Manual/components/mdx/tones.ts:27` | se tokenizan en su módulo, no entran al `statusToneMap` |

**Componentes "XStatusBadge" que ya existen** (todos `variant="outline"` + clases propias):
`Ayuda/components/{TicketStatusBadge:8,TicketPriorityBadge:9}.tsx`, `Comercial/Facturacion/components/InvoiceStatusBadge.tsx:73`,
`Comercial/Certificaciones/components/CertificationStatusBadge.tsx:18` y **`Mantenimiento/shared/components/status-badge.tsx:58`,
que se llama `StatusBadge`**: choca de nombre con el primitivo (decisión 7.7).

**Modelo más maduro** (precedente a copiar): `{ label, variant, icon }` de `work-order-status.ts:31/41`
(`MO_STATUS_CONFIG` + `getMoStatusConfig()`), `WORKSHOP_STATUS_CONFIG` y `Equipos/OtherEquipment/maintenance/columns.tsx:23`.

**`<Badge`:** 778 en total; 183 con `variant={…}` dinámico: ~95 desde un mapa de estado, **~60 ternarios Activo/Inactivo**
(`is_active ? 'success' : 'secondary'`, en 20+ `columns.tsx` de `Empresa/*`) y el resto conteos.

### 2.6 KPIs → `StatCard` / `KpiStrip`

| Implementación | Ruta | Props | Instancias | Clickeable | Ícono de color |
|---|---|---|---|---|---|
| `CardInfo` (default export) | `shared/components/cards/CardInfo.tsx:3` | `{ title; value: number \| string; valueClassname? }` | 6 en `Dashboard/Estadisticas/RecursosHumanos/components/SummaryCards.tsx:19-28`; 7 en Preparte vía `Operaciones/Preparte/components/StatusCardServer.tsx:28` | no | no; colorea el **valor** (`text-emerald-600`…) |
| Tira de estados de Preparte | `Operaciones/Preparte/components/{StatusCardsServerContainer:20,StatusCardsWrapper:21/77,StatusCardSkeleton}.tsx` | `{ status; label; color }` | 7 (cada una con su `Suspense` y su COUNT) | **sí**: filtra por URL `preparte-table__status`, selección con `border-primary` | no |
| `KpiCardsRow` | `Dashboard/Principal/components/KpiCardsRow.tsx:9` | array local `{ icon, value, subtitle, label, colorClass, tooltip? }` | 5 + `ChecklistMissingCard` (`:21`, switch mes/histórico) | no (tooltip) | **sí** (patrón GH) |
| `IndicatorStats` | `Dashboard/Principal/shared/IndicatorStats.tsx:17` | `items: { label; value; icon?; onClick? }[]` | 3 en `RrhhSectionClient.tsx:172` | opcional | muted |
| Botones-stat de gráficos | `Dashboard/Estadisticas/SalaDeControl/components/{DesviosChartsClient:273-296,OrderManagementClient:356-365}.tsx`, `Estadisticas/Operaciones/components/OperacionesChartsClient.tsx:~435` | — | 2-5 por gráfico | sí (`data-active`, cambia la serie) | swatch de serie (es leyenda, se queda en 6.9) |
| Cifras inline | `Dashboard/Principal/components/EquipmentFleetClient.tsx:197-327` (~12), `EquipmentOperationClient.tsx:150/155`, `Employees/Diagrams/{DiagramMassiveForm:602-614,DiagramMassiveResults:190-208,ConflictResolutionModal:240-266}.tsx`, `OperatorPanel/components/CloseWorkOrderDialog.tsx:127-135`, `Operaciones/PartesDiarios/remitManager/components/RemitosManagerModal.tsx:75/79` | — | — | no | valor `text-{green,blue,red,purple,orange}-600` |

Total ≈ **13 tiras/grupos** con ~45 cifras.

### 2.7 Vacíos → `EmptyState`

- Reutilizables que ya existen: `Mantenimiento/shared/components/empty-state.tsx:11` (`{ icon; title; description?;
  className? }`, 1 consumidor: `Mantenimiento/Checklists/components/checklists-list-client.tsx`) ·
  `Ayuda/components/EmptyTicketsState.tsx:45` (copy por bucket, acción `onReport`, `min-h-[220px]`; **precedente de
  calidad**) · `shared/components/data-table/base/data-table-server.tsx:40` `EmptyStateWithReset` (sin importadores) ·
  `UserPermissionsManager/components/EquipmentTypesSectionParts.tsx:63` · `Mantenimiento/Gomeria/Ordenes/components/TirePositionCard.tsx:542`.
- **DataTable** (`shared/components/common/DataTable/DataTable.tsx:100,540-546`; tipo `string` en `types.ts:222`):
  `emptyMessage` por defecto "No se encontraron resultados." en una sola celda `h-24 text-center`. **No distingue "sin
  datos" de "sin resultados por filtro"**, no tiene ícono ni acción. Lo usan ~146 tablas (Empresa 33, Mantenimiento 25,
  Employees 20, Dashboard 16, Operaciones 15, Comercial 12, Documentación 9, Equipos 7, Clothing 6). **La conexión
  con `EmptyState` es de la Fase 3** (DataTable), con `emptyMessage` intacto como texto de la variante `empty`.
- **Markup de vacío a mano: ~165 líneas** (Mantenimiento 41, Operaciones 30, Dashboard 23, Empresa 11, Employees 8,
  Comercial 8, Equipos 7, UserPermissionsManager 6, `app/dashboard` 6, OperatorPanel 5, Ayuda 5, shared 4, Clothing 3,
  Auth 3, Selección 2, Documentación 2). ~21 son `div py-8/12 text-center text-muted-foreground`; ~15 con ícono grande
  muted, p. ej. `Equipos/EquipoID/components/{vehicle-checklists-tab-content:54,vehicle-operations-history:356}.tsx`,
  `Mantenimiento/OrderManagement/components/{AddItemDialog:245/277,AssignRepairTypesDialog:158/190}.tsx`,
  `Mantenimiento/WorkshopView/WorkshopViewTabContent.tsx:30`, `Operaciones/PartesDiarios/detail/components/HistoryDialog.tsx:557`,
  `remitManager/components/{LinkRemitoDialog:92,RemitosManagerModal:100}.tsx`, `Checklists/components/sections/HitchEquipmentDialog.tsx:48`,
  `Empresa/Usuarios/components/LinkEmployeeCell.tsx:206`, `Equipos/OtherEquipment/components/OtherEquipmentFileUpload.tsx:245`.
- `CommandEmpty` (64 usos) **no** pasa a `EmptyState`: es el vacío de una lista de opciones y lo resuelve `SearchSelect`.

### 2.8 Acciones de fila → `RowActions`

- **80 columnas `id: 'actions'`**. Patrones: menú ⋯ **1** (`Employees/Empleados/EmployeeList/columns.tsx:901`) ·
  íconos inline ~24 (Mantenimiento, Clothing ×3, `MensureUnitsTable`, `EnhancedComercialReportTable.tsx:507`,
  `vehicle-operations-history`; `Operaciones/PartesDiarios/detail/columns/row-actions-cell.tsx:12` con `<button>` y
  SVG inline) · botón de texto ~30 (todo `Empresa/*`, Documentación, KPIs, RRHH, OrderManagement, TiposReparaciones) ·
  link "Ver" ~10 (`Equipos/Equipos/VehicleList/columns.tsx:599`, OtherEquipment, DadosDeBaja ×2, Dashboard/Documentación
  ×2, Formularios, PartesDiarios, Selección, Facturación) · celda delegada ~12 (`ActionsCell` ×4 en Documentación +
  `Operaciones/Preparte/list/columns.tsx:146`, `ExternalAccessActionsCell.tsx:50`, `CompanyDocActionsCell`
  `Empresa/General/Documentacion/components/columns.tsx:234`, `UserStatusCell.tsx:42`, `RowActionsCell`,
  `DeliveryReceiptButton` ×3, `WorkOrderTasksDialog`, `PDFPreviewDialog`) · mixto ~5
  (`Mantenimiento/MaintenanceOrders/table/columns.tsx:273` con 5 botones + ReportButton,
  `workshopTrackingColumns.tsx:415`, `Mantenimiento/Operaciones/components/columns.tsx:113`,
  `Documentacion/DocumentosEquipos/Mensuales/columns.tsx:269`).
- **Permisos (4 mecanismos conviven):** (1) prop `canX` del factory de columnas (`canUpdate`, `canDelete`,
  `canApproveReject`…), que a veces oculta la columna entera (`Empresa/Equipos/EquipmentBrands/columns.tsx:76`) y a
  veces cada botón (`Gomeria/Catalogo/components/columns.tsx:216`); (2) `<PermissionGuard>` dentro de la celda (10
  archivos: Documentación Mensuales/Permanentes, `PedidosMantenimiento/Pendientes/columns.tsx:247`, Confirmados,
  `Mantenimiento/Operaciones/components/columns.tsx`, Planificación, `EnhancedComercialReportTable`); (3) objeto
  `permissions` + reglas de negocio (`row-actions-cell.tsx:25-31`); (4) gate por estado de la fila. **`RowActions`
  no decide permisos**: recibe solo las acciones que el consumidor ya filtró (§3.8).
- `components/ui/action-button.tsx` (`ActionButton`, textos en inglés, `useTransition` + AlertDialog): **0
  importadores**, código muerto (Fase 9). Ojo con el homónimo `Mantenimiento/shared/components/action-button.tsx:17`
  (tarjeta-botón grande de los paneles de campo), que no es una acción de fila.

### 2.9 Contenedores → `Panel` (+ `Section`)

- `components/ui/card.tsx` (tras la Fase 1): `Card` (forwardRef + `cardVariants` no exportado; `variant` default,
  outlined, filled, elevated, ghost, primary, secondary, success, warning, destructive; `size`; `padding`; `rounded`;
  `text_color` declarado y **no aplicado**), `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`,
  `CardContent`, `CardFooter`. La base agrega siempre `flex flex-col gap-6 py-6`.
- **302 archivos** importan `card`; **~390 `<Card`**: Mantenimiento 61/86, Dashboard 51/72, Documentación 33/35,
  Equipos 26/35, Empresa 23/38, Employees 21/27, Clothing 14/15, `app` 14/16, Operaciones 12/12, Ayuda 9/14, shared
  8/8, Comercial 8/10, Formularios 6/6, UserPermissionsManager 5/11, OperatorPanel 5/5, Selección 3/4, Checklists 3/4
  (archivos/instancias).
- **Card dentro de Card** (mismo archivo): `Comercial/Comerce/components/DailyReportWrapper.tsx:461→462,661`,
  `Formularios/components/forms/FormCard.tsx:23→31`, `Mantenimiento/NuevoPedido/components/nuevo-pedido/StepConfirm.tsx:114→126`,
  `UserPermissionsManager/UserPermissionsManager.tsx:63→64` y skeletons (`app/dashboard/operations/loading.tsx:35`,
  `Operaciones/Preparte/fallback/PreparteSkeleton.tsx:85`, `UserPermissionsManager/fallback/RoleManagerSkeleton.tsx:26,54`).
  Los anidados entre componentes aparecen recién al migrar cada módulo.
- La regla `datatable.md` exige `<Card><CardContent className="pt-6">` alrededor de cada DataTable: se actualiza a
  `<Panel>` en la Fase 9 con aprobación (PLAN §4). Mientras tanto la Fase 3 usa `Panel`.
- `Card` **no se borra ni se cambia en esta fase**: convive hasta la Fase 9.

### 2.10 Tablas de presentación → `SimpleTable`

`components/ui/table.tsx`: shadcn estándar (`Table` con `containerClassName` y `div overflow-x-auto`, `whitespace-nowrap`
en head y cell). Tablas manuales fuera del DataTable, cruzadas con `inventario/crecimiento.md`:

| Ruta:línea | Qué muestra | Crecimiento | Destino |
|---|---|---|---|
| `Comercial/ReglasPrecio/components/ReglasPrecioPanel.tsx:87` | reglas de precio | acotado | **SimpleTable** |
| `Comercial/Facturacion/components/detail/InvoiceDetail.tsx:268` (`<table>` crudo) | líneas de una factura | acotado | **SimpleTable** |
| `Comercial/Certificaciones/components/CertificacionesPanel.tsx:395` | líneas de una certificación | acotado por registro | SimpleTable con "ver más" |
| `Dashboard/Principal/components/{ServicesSection:110,ServicesDetailDialog:190}.tsx` | servicios del día | ventana de 1 día | **SimpleTable** |
| `Employees/Diagrams/{DiagramFormUpdated:577/656,ConflictResolutionModal:119/185,DiagramMassiveResults:247/293/353}.tsx` | resultados y conflictos de una carga | rango × empleados | SimpleTable con tope visible |
| `Empresa/Clientes/components/CustomerComponent.tsx:42` | usuarios invitados | acotado | **SimpleTable** |
| `Empresa/Clientes/components/Services/{contractDocuments:310,ServiceItemsSection:133}.tsx` | docs / ítems de un contrato | acotado | **SimpleTable** |
| `Empresa/General/FiscalData/components/SalesPointsSection.tsx:102` | puntos de venta | acotado | **SimpleTable** |
| `Mantenimiento/Gomeria/Ordenes/components/ServiceOrderDetailView.tsx:134` | ítems de una orden de gomería | acotado | **SimpleTable** |
| `Documentacion/DetalleDocumento/components/{CompanyInfoCard:30,DocumentTypeCard:30,EmployeeInfoCard:24,EquipmentInfoCard:15}.tsx` | clave/valor de un registro | — | **no es tabla**: `dl` (fuera de los 10 primitivos; lo resuelve 6.4 con `Section`) |
| `Comercial/Certificaciones/components/CertificacionesPanel.tsx:189` | listado de certificaciones | **crece** | DataTable paginado (Fase 5), **no** SimpleTable |
| `Employees/Diagrams/DiagramEmployeeView.tsx:331`, `Employees/Diagrams/table/DiagramDetailTable.tsx:160/265` | grilla / historial de diagramas | **crece** | consulta acotada por rango (6.2); la grilla es una matriz: SimpleTable `mobileLayout="scroll"` solo con la ventana visible |
| `Empresa/Clientes/components/Services/PriceRevisionsDialog.tsx:156` | revisiones de un ítem | crece por registro | "ver más" |
| `Equipos/EquipoID/components/vehicle-checklists-tab-content.tsx:69`, `Formularios/components/{forms/FormCardContainer:147,tables/data-table-answer:63}.tsx` | historiales / respuestas | **crece** | DataTable paginado (Fase 5) |
| `Documentacion/TiposDocumentos/components/_VerifyDocumentsDialog.tsx:285/328` (`<table>` crudo) | faltantes y huérfanos | crece (muestra 20 + "quedan N") | SimpleTable con el tope que ya tiene |
| `Ayuda/Manual/components/mdx/mdx-components.tsx:131` | tablas MDX del manual | estático | SimpleTable (6.10) |

Además, `crecimiento.md:118-119,186-194` manda a `SimpleTable` varias `BaseDataTable`/DataTable de catálogos acotados
(áreas, sectores, equipos del cliente, ítems de servicio, unidades de medida, talleres, sectores de taller, tipos y
grupos de reparación, ausentismo de RRHH): se deciden en la Fase 5.

## 3. Diseño propuesto, por primitivo

Convenciones comunes a los 10 (de `prototyperai/build-primitive`, `shadcn-ui/shadcn` y la idiomática de la Fase 1):
`data-slot` en cada elemento raíz; `cn()` con el `className` del consumidor al final; tokens semánticos y nada de
`dark:`; clases escritas completas en constantes o `Record` (regla aprendida de Tailwind v4: nada de `replace()` ni
fragmentos `${}`); `strokeWidth={1.75}` en íconos (2 en badges); todo `<button>` interno lleva **`type="button"`**
(regla aprendida: un botón sin `type` dentro de un `<form>` lo submitea); controlados (`value` + `onChange`), sin
`defaultValue` cuando ningún uso real es no controlado (`humanlayer/narrow-react-prop-types`); textos de UI en
español y código en inglés (`code-language.md`); `logger`, nunca `console.*`.

### 3.1 `ResponsiveDialog`

**API** (compatible con los 3 consumidores de hoy: `title`, `description?`, `footer?`, `className?` siguen igual):

```ts
type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;                       // siempre: va a DialogTitle / DrawerTitle (sr-only si hideTitle)
  description?: React.ReactNode;       // DialogDescription; si falta, aria-describedby={undefined} explícito
  children: React.ReactNode;           // body con scroll propio
  footer?: React.ReactNode;            // barra fija; sin footer no se agrega el "Cancelar" automático de hoy
  size?: 'sm' | 'md' | 'lg' | 'xl';    // default 'md'
  layout?: 'dialog' | 'sheet';         // desktop: centrado o panel lateral derecho. default 'dialog'
  mobile?: 'drawer' | 'fullscreen';    // < 768px: bottom sheet o pantalla completa. default 'drawer'
  dismissible?: boolean;               // false mientras hay un envío en curso: bloquea Esc, overlay y arrastre
  hideTitle?: boolean;                 // visores (foto/PDF) donde el título visual es el propio contenido
  className?: string;                  // solo para el contenido; se desaconseja max-w-* (lo fija size)
};
```

Único cambio de contrato: hoy, **sin `footer`, el Drawer agrega un botón "Cancelar"** y el Dialog no.
Lo nuevo: no se agrega nada (el cierre está en la X del header, que hoy el Drawer no tiene). Afecta solo a
`AddTaskDialog.tsx:201` (OperatorPanel, Fase 7), que hoy muestra ese "Cancelar" en mobile; al migrarlo se le pasa
`footer` explícito.

**Tamaños** (`DISENO.md` §4.7; reemplazan ~25 anchos sueltos de §2.1):

| `size` | `layout="dialog"` | `layout="sheet"` | Para | Anchos viejos que mapean acá |
|---|---|---|---|---|
| `sm` | 400px | — | confirmación con input, form de 1–3 campos | `[425px]`, `[460px]`, `sm:max-w-md`, `max-w-sm`, `max-w-xs` |
| `md` | 560px | 480px | form corto (≤6 campos), detalle de registro | `sm:max-w-lg`, `max-w-lg`, `[500px]`, `[520px]`, `[560px]` |
| `lg` | 800px | 640px | form largo, wizard, listas con tabla | `2xl`, `[650px]`, `[700px]`, `3xl`, `[800px]`, `[820px]`, `[850px]` |
| `xl` | `min(1100px, 92vw)` | — | visor (PDF, foto), tablas anchas de detalle | `4xl`, `5xl`, `6xl`, `[90vw]`, `[calc(100vw-2rem)]` |

`layout="sheet"` con `size="sm" | "xl"` no se ofrece (tipo: `layout: 'sheet'` restringe `size` a `'md' | 'lg'` con
una unión discriminada). Los `SheetContent` de hoy (`sm:max-w-screen`, `[75vw]`) se resuelven con su módulo.

**Estructura** (los dos modos comparten las tres partes):
- Header: `flex items-center gap-3 px-5 h-12 border-b border-border` · título `text-section` truncado con `min-w-0` ·
  descripción debajo del header en `text-caption text-muted-foreground px-5 pt-3` · botón cerrar `ghost icon-sm`
  con `aria-label="Cerrar"` (y `type="button"`).
- Body: `flex-1 min-h-0 overflow-y-auto overscroll-contain p-5` y `@container/dialog` (los forms internos usan
  `@xl/dialog:grid-cols-2`, `flornkm/prefer-container-queries`).
- Footer: `px-5 py-3 border-t border-border bg-panel-2 flex justify-end gap-2`; en mobile
  `flex-col-reverse` con botones `w-full` (primary queda abajo, al alcance del pulgar) y
  `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (el layout ya declara `viewportFit: 'cover'` en la Fase 1).
- Contenedor: `bg-popover border border-border-strong shadow-(--shadow-overlay)`, sin rounded. Desktop:
  `max-h-[85dvh] flex flex-col`. Drawer: `max-h-[92dvh]`, handle `h-1 w-10 bg-border-strong` (sin `rounded-full`:
  no es avatar ni punto de estado). Fullscreen: `h-dvh`, header fijo con "← Volver" + título (`DISENO.md` §4.7).
- Overlay `bg-black/40` sin blur (`ibelick/baseline-ui`).
- Motion (`DISENO.md` §2.4, `emilkowalski/emil-design-eng`): dialog opacidad + `translateY(8px)` en
  `--duration-panel` (240ms) `--ease-out-quick`, salida 150ms; sheet por `translateX`; drawer lo anima vaul. Con
  `prefers-reduced-motion` queda solo la opacidad (el bloque global de la Fase 1 ya acorta todo a 1ms).

**Desktop vs mobile.** La decisión es de **shell** (el overlay ocupa la pantalla), así que va por viewport y no por
container query: `useMediaQuery('(max-width: 767px)')` sobre `useSyncExternalStore` (`getServerSnapshot = false`).
- Sin parpadeo de hidratación (`rendering-hydration-no-flicker`): el dialog **siempre arranca cerrado**, y cuando el
  usuario lo abre el store ya leyó el valor real del cliente. A diferencia del `useIsMobile` de hoy (estado inicial
  `undefined` + `useEffect`), no hay un render desktop y después mobile.
- **El modo se fija al abrir**: si la ventana cruza los 768px con el dialog abierto (rotar la tablet), no se cambia
  de `Dialog` a `Drawer` a mitad de camino, porque eso desmontaría el form y perdería lo escrito. Se implementa con
  el patrón "ajustar estado cuando cambia una prop" durante el render (`prevOpen` en estado), **sin `useEffect`**
  (`no-useeffect.md`, `rerender-derived-state-no-effect`).
- El hook nuevo no reemplaza `useIsMobile` en `sidebar.tsx` (shadcn lo necesita así).

**Contexto para los hijos.** `ResponsiveDialog` publica `ResponsiveDialogContext = { surface: 'dialog' | 'sheet' |
'drawer' | 'fullscreen' }`. `SearchSelect` y `DatePicker` lo leen para abrir su panel mobile como **drawer anidado**
(`Drawer.NestedRoot` de vaul) cuando ya están dentro de un drawer, en vez de un Popover que pelearía con el arrastre
y el foco atrapado de vaul (trampa conocida, reportada por el lector de `shadcn-ui/shadcn`).

**Teclado, foco y ARIA.** Los da Radix/vaul: `role="dialog"` + `aria-modal`, foco atrapado, Esc cierra, foco
devuelto al elemento que tenía el foco al abrir. Foco inicial: el primer campo del body; si el body no tiene campos,
el botón cerrar (`onOpenAutoFocus` solo se intercepta cuando hay `[data-autofocus]` en el contenido). Con
`dismissible={false}`: `onEscapeKeyDown` / `onPointerDownOutside` / `onInteractOutside` con `preventDefault()` y
vaul con `dismissible={false}`, y el botón cerrar `disabled` con `aria-disabled` + texto en el footer ("Guardando…").

**Estados límite.**
- Contenido largo: el body scrollea y header/footer quedan fijos; título largo truncado con `title` nativo.
- Doble envío: el primitivo no conoce el submit; lo cubre `dismissible={false}` + el botón primario con `disabled`
  por `isSubmitting` (regla `forms.md`). El patrón queda documentado en el JSDoc.
- Form dentro: el `<form>` envuelve body y footer (el submit del footer es `type="submit"` con `form="<id>"` cuando
  el form vive en el body). Todos los botones del header son `type="button"`.
- Nunca modales encadenados: el primitivo no ofrece "abrir otro desde acá" y el JSDoc lo recuerda (regla aprendida).
- Teclado virtual en Android: vaul ya reposiciona con `repositionInputs`; se verifica en un teléfono real
  (`emilkowalski/mobile-native`).

### 3.2 `ConfirmDialog` + `useConfirm()`

Precedente adoptado: los nombres de props de `Ayuda/components/ConfirmDialog.tsx` (`title`, `description`,
`confirmLabel`, `cancelLabel`, `destructive`, `busy`). Base: `AlertDialog` de Radix (`shadcn-ui/shadcn`,
`ibelick/baseline-ui`: lo destructivo va en `alertdialog`, no en `dialog`).

**API declarativa** (para los usos con `AlertDialogTrigger` o con estado propio):

```ts
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;                  // nombra acción + objeto: "Eliminar la unidad «m³»" (nunca "¿Estás seguro?")
  description?: React.ReactNode;  // qué se pierde y si es irreversible
  confirmLabel: string;           // verbo + objeto: "Eliminar unidad"
  cancelLabel?: string;           // default "Cancelar"
  destructive?: boolean;          // botón `danger` + foco inicial en Cancelar
  onConfirm: () => void | Promise<unknown>;
  busy?: boolean;                 // estado externo (si el consumidor ya maneja su pending, como Ayuda)
};
```

**API imperativa** (para las 44 simples, `useConfirm()` sin provider global):

```ts
const [confirm, confirmDialog] = useConfirm();
// …en el JSX del componente: {confirmDialog}
const ok = await confirm({
  title, description, confirmLabel, destructive: true,
  onConfirm: () => deleteUnit(id),   // opcional; si está, el diálogo espera a que termine
});
// ok === true  → se confirmó y onConfirm terminó sin lanzar
// ok === false → se canceló (Esc, Cancelar, overlay)
```

Por qué un hook que devuelve `[confirm, element]` y no un `ConfirmProvider` montado en el layout (decisión 7.2): no
toca `src/app/dashboard/layout.tsx` ni los layouts de los paneles de campo (`/operator`, `/maintenance`, `/clothing`
no usan el layout del dashboard), funciona igual en cualquier árbol, y el estado del diálogo vive en el componente que
lo usa (sin contexto global que re-renderice al abrir). El `confirm` es estable (`useCallback` + resolver en `ref`,
`advanced-use-latest`, `rerender-functional-setstate`).

**Comportamiento con `onConfirm` async** (lo que cubre "doble envío del confirm" del Checkpoint 2):
1. Clic en confirmar → el botón pasa a "Eliminando…" (spinner + texto, `aria-busy`), queda `disabled` y un `ref`
   `inFlight` corta un segundo clic o Enter en el mismo tick (precedente: `IssueInvoiceDialog.tsx`). El pending se
   lleva con `useTransition` (`rendering-usetransition-loading`).
2. Mientras está pendiente el diálogo **no se cierra**: Esc, overlay y Cancelar quedan bloqueados (`busy`).
   Se usa un `Button` propio y no `AlertDialogAction` (que cierra al hacer clic: es el bug de §2.2).
3. Si `onConfirm` termina bien → cierra y resuelve `true`.
4. Si lanza → queda abierto, muestra el error **dentro del diálogo** (`role="alert"`, `text-danger-text`,
   "No se pudo completar la acción. Volvé a intentar.") y el botón vuelve a habilitarse. Los consumidores que hoy
   atrapan el error y hacen `toast.error` lo siguen haciendo dentro de su `onConfirm`; en ese caso no lanza y el
   diálogo cierra como hoy.
5. Sin `onConfirm` → resuelve `true` y cierra al instante (equivale al `AlertDialogAction` sincrónico de hoy).

**Look.** `DISENO.md` §4.7: 400px, `bg-popover border-border-strong shadow-(--shadow-overlay)`, sin rounded. Título
`text-section`, descripción `text-body text-muted-foreground`, footer con hairline. Mobile: centrado con botones
apilados a ancho completo (confirmar último). Sin ícono decorativo; si `destructive`, un ícono `TriangleAlert` de
16px en `text-danger` junto al título (con texto, nunca solo color).

**Foco.** Inicial en **Cancelar** si `destructive`, en Confirmar si no (Radix `AlertDialog` enfoca Cancel por defecto;
para el caso no destructivo se usa `onOpenAutoFocus`). Devolución: Radix devuelve el foco al elemento enfocado al
abrir. Cuando el confirm se abre desde un ítem de menú (que se desmonta), `RowActions` lo difiere hasta que el menú
devolvió el foco a su trigger (§3.8), así el foco vuelve al ⋯ de la fila.

**Microcopy** (`jakubkrehel/better-writing`, solo textos nuevos): los títulos y descripciones de cada uso **se
copian tal cual** al migrar (regla: los textos existentes no se reescriben). Lo nuevo del primitivo: "Cancelar", el
gerundio del estado pendiente (lo pasa el consumidor como `pendingLabel?`, default "Procesando…") y el mensaje de
error genérico.

**Fuera del primitivo.** Las 27 I/M/F de §2.2 van a `ResponsiveDialog size="sm"`. "Escribí el nombre para confirmar"
no se agrega (ningún uso actual lo tiene).

### 3.3 `DatePicker` y `FormDatePicker`

**`DatePicker` (control de bajo nivel, siempre con `Date | null`):**

```ts
type DatePickerProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  granularity?: 'day' | 'month';            // 'month' = MM/AAAA (los 9 de §2.3); value = día 1 del mes
  min?: Date;                               // inclusive
  max?: Date;                               // inclusive
  isDateDisabled?: (date: Date) => boolean; // reglas cruzadas (contrato fin ≥ inicio, etc.)
  yearRange?: { from: number; to: number }; // activa los dropdown de mes/año (hoy fromYear/toYear)
  disabled?: boolean;
  placeholder?: string;                     // default 'DD/MM/AAAA' o 'MM/AAAA'
  id?: string; name?: string;               // + aria-invalid / aria-describedby los inyecta FormControl
  onBlur?: () => void;
  className?: string;
};
```

Estructura (`DISENO.md` §4.15): un grupo con borde `border-input h-8 bg-card` (`h-11` con `pointer: coarse`),
`focus-within` con el outline de 2px, que contiene un `<input type="text">` (`data-code`, mono tabular,
`text-base md:text-sm` contra el zoom de iOS) y un botón de ícono `CalendarDays` adentro del borde a la derecha
(`aria-label="Abrir calendario"`, `type="button"`, hit area de 44px con coarse). Se compone a mano con `Input` + `Button`
(no se instala `InputGroup`, decisión 7.4).

**Escritura directa** (regla `date-pickers.md`):
- Máscara mientras se tipea: solo dígitos; las barras se insertan solas (`07102026` → `07/10/2026`); `Backspace` sobre
  una barra borra el dígito anterior. Pegar está permitido ("07/10/2026", "7/10/2026", "2026-10-07" se normalizan).
  Regex de máscara hoisteadas a nivel de módulo (`js-hoist-regexp`).
- `inputMode="numeric"`, `autoComplete="off"`, `enterKeyHint="done"`, `spellCheck={false}`, `maxLength={10}`
  (`emilkowalski/mobile-native`, `vercel-labs/web-design-guidelines`).
- Parseo con `moment(text, ['DD/MM/YYYY', 'D/M/YYYY', 'YYYY-MM-DD'], true)` en el **handler** de `onChange` (cuando
  hay 10 caracteres) y en `onBlur`, nunca en un efecto (`rerender-move-effect-to-event`). Año de 2 dígitos: inválido
  (es ambiguo).
- El texto es estado local; el `value` del padre manda. El "resync" cuando el padre cambia el valor (reset del form)
  se hace en render comparando el `value` previo, **sin `key` y sin `useEffect`** (hoy los consumidores de
  `EnhancedDatePicker` fuerzan el reset con `key`).
- `onChange` se emite **solo con una fecha válida o con `null` (texto vacío)**. Nunca se emite una fecha inválida ni
  fuera de rango: así ningún payload cambia de tipo (decisión 7.3 sobre qué pasa con el texto inválido al salir).

**Calendario.** `Popover` en desktop (ancho del calendario, `align="end"`), drawer en mobile (anidado si está dentro
de un `ResponsiveDialog` en drawer). rdp 9 `mode="single"`, `autoFocus` (reemplaza a `initialFocus`, deprecado),
`startMonth`/`endMonth` desde `yearRange` (reemplazan `fromYear`/`toYear`), `disabled` = `min`/`max`/`isDateDisabled`.
Celdas cuadradas de 32px (44px con coarse); seleccionado `bg-primary text-primary-foreground`; hoy con subrayado de
2px. Teclado del grid lo da rdp (flechas, PageUp/PageDown mes, Home/End semana); Esc cierra y el foco vuelve al botón.
Elegir un día escribe el texto, cierra y devuelve el foco **al input** (no al botón), para seguir con Tab.
`granularity="month"`: el popover muestra un grid de 12 meses (botones `aria-pressed`) con navegación de año; rdp no
lo trae. El calendario y el grid se cargan al abrir (`bundle-conditional`): el input no depende de rdp.

**Mensajes** (`aria-describedby` al texto de ayuda): fuera de rango "Tiene que ser desde el 07/10/2026" / "hasta el
…"; inválida "Escribí la fecha como DD/MM/AAAA". Los muestra `FormMessage` cuando hay form, o un `<p role="status">`
siempre montado cuando el control se usa suelto.

**`FormDatePicker` (puente con RHF + adaptador de formato):**

```ts
type DateFieldFormat =
  | 'date'          // Date | null  (Calendar a mano, Enhanced en Diagram/PriceRevisions/UpdateDocuments…)
  | 'iso-date'      // 'YYYY-MM-DD' (nativos con {...field}, Invoice, IssuerFiscal…)
  | 'iso-datetime'  // toISOString() de la medianoche local (UploadDocumentMulti*)
  | 'month'         // 'YYYY-MM' (períodos de documentos)
  | 'month-date'    // Date del día 1 (YearMonthPicker de los gráficos de RRHH)
  | 'iso-date-utc'; // new Date('YYYY-MM-DD'): solo si 7.8 = (a), para no cambiar el payload de CustomerForm/Inputs

type FormDatePickerProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPathByValue<T, Date | string | null | undefined>; // RHF tipa que el campo sea fecha o string
  format: DateFieldFormat;
  emptyValue?: null | '' | undefined;   // lo que el campo guarda vacío hoy ('' en Invoice/IssuerFiscal, null en Termination…)
  label: string;
  description?: string;
  required?: boolean;                   // solo el `*` visual con aria-hidden; la validación sigue en el schema Zod
} & Pick<DatePickerProps, 'granularity' | 'min' | 'max' | 'isDateDisabled' | 'yearRange' | 'disabled' | 'placeholder'>;
```

`src/shared/utils/date-adapters.ts` (sin directiva, puro, se puede probar con `npm test` cuando el usuario apruebe tests):
`toPickerDate(raw, format): Date | null` y `fromPickerDate(date, format, emptyValue)`. Reglas que **reproducen el
comportamiento de hoy**:
- `'iso-date'` se parsea con `moment(raw, 'YYYY-MM-DD', true)` **en hora local** y se serializa con
  `format('YYYY-MM-DD')`. Es lo que ya hacen `vehicle-basic-data-form`, `OtherEquipmentBasicDataForm`, `Invoice` e
  `IssuerFiscal`.
- `'iso-datetime'` = `moment(date).startOf('day').toDate().toISOString()`, idéntico a `date?.toISOString()` sobre la
  fecha que hoy emite `EnhancedDatePicker` (medianoche local).
- Los dos usos con `new Date('YYYY-MM-DD')` (UTC: `CustomerForm.tsx:396`, `Inputs.tsx:737/803`) **no se corrigen
  acá**: al migrarlos, el adaptador local cambiaría el payload en 3 horas (y arreglaría el día corrido). Va como
  pregunta en su fase (7.8).

`FormDatePicker` usa `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormDescription` + `FormMessage` (regla
`forms.md`), así `FormControl` le pasa `id`, `aria-invalid` y `aria-describedby` al input real. El error con
`aria-invalid` pinta el borde en `border-danger` y la barra de 2px a la izquierda del campo (`DISENO.md` principio 6).

**Estados límite.** Fecha inválida (`31/02/2026`), fuera de rango, texto parcial al salir, pegar basura, vacío en un
campo opcional (emite `emptyValue`), `min > max` (se loguea con `logger.warn` y no se deshabilita todo), año 1900
(los `≥ 1900` de bajas), cambio externo del valor (reset del form), `disabled`, y dentro de un `<form>` (el botón de
calendario no submitea).

### 3.4 `SearchSelect`

Uno solo para simple, múltiple, local y async (`fixing-accessibility`: usar el primitivo probado, cmdk + Popover, y no
un listbox a mano). El patrón ARIA es *combobox* con *active descendant* (el foco queda en el input de búsqueda y las
flechas mueven la opción activa; lo implementa cmdk, `prototyperai/build-primitive` §7 patrón C).

```ts
type SearchSelectOption<V extends string | number = string> = {
  value: V;
  label: string;             // texto principal (también es lo que se busca)
  code?: string;             // se muestra antes en `.data-code` y se busca: legajo, dominio, interno, CUIT
  description?: string;      // segunda línea en caption (ej. puesto, tipo de equipo)
  keywords?: string[];       // términos extra de búsqueda
  group?: string;            // encabezado de grupo (EmployeeSection agrupa por puesto, EquipmentSection por tipo)
  disabled?: boolean;        // ej. recurso que ya tiene el documento
  hint?: string;             // marca no bloqueante, ej. "No afectado al cliente" (EmployeeSection hoy en naranja)
};

type SearchSelectSource<V> =
  | { options: SearchSelectOption<V>[] }                                    // local
  | {                                                                        // servidor
      search: (query: string, signal: AbortSignal) => Promise<SearchSelectOption<V>[]>;
      queryKey: readonly unknown[];        // primitivos; se le agrega el texto buscado
      minChars?: number;                   // default 0 (sin texto trae la primera página)
      selectedOptions: SearchSelectOption<V>[]; // para mostrar los labels de lo ya elegido sin buscarlo
    };

type SearchSelectProps<V extends string | number = string> = SearchSelectSource<V> & {
  placeholder: string;
  searchPlaceholder?: string;              // default "Buscar…"; empleados: "Buscar por legajo o nombre…"
  emptyMessage?: string;                   // default "Sin resultados para «{q}»"
  noun: { one: string; other: string };    // "equipo" / "equipos": arma "Mostrando 50 de 387 equipos" con Intl.PluralRules
  limit?: number;                          // default 50: tope de opciones renderizadas
  disabled?: boolean;
  loading?: boolean;                       // opciones locales todavía cargando (hoy `isLoading`)
  id?: string; name?: string; className?: string; 'data-testid'?: string;
} & (
  | { multiple?: false; value: V | null; onChange: (value: V | null) => void; clearable?: boolean }
  | {
      multiple: true;
      value: V[];
      onChange: (value: V[]) => void;
      max?: number;
      onMax?: 'ignore' | 'replace-oldest';   // hoy conviven los dos (§2.4, contrato 2); default 'ignore'
      selectAll?: boolean;                    // "Seleccionar todo (x/y)" sobre las opciones habilitadas visibles
    }
);
```

**Búsqueda local.** `Command shouldFilter={false}` con filtro propio: normaliza acentos y mayúsculas, matchea
`label`, `code`, `description` y `keywords`, y prioriza los que **empiezan** con el texto. El texto buscado pasa por
`useDeferredValue` (`rerender-use-deferred-value`) y el filtrado va en `useMemo` sobre el valor diferido. Se
renderizan como máximo `limit` (50) opciones: con 400–650 opciones no hace falta virtualizar (`pbakaus/harden`).
Las seleccionadas que quedan fuera del tope igual se ven en el trigger.

**Búsqueda en servidor.** React Query (`react-query.md`): `useQuery({ queryKey: [...queryKey, debounced],
queryFn: ({ signal }) => search(debounced, signal), enabled: open && debounced.length >= minChars,
placeholderData: keepPreviousData, staleTime: 60_000 })`. Debounce de 300ms con un hook `useDebouncedValue` (un
timer en `useEffect`, que es sincronización con algo externo y está permitido por `no-useeffect.md`). El `signal`
aborta la request anterior. **Nunca** vuelve a filtrar en el cliente lo que trae el servidor (el bug de
`EquipmentSelectionStep.tsx:64`).

**Aviso de tope y estados** (regla aprendida: "un aviso dentro de una lista con `max-h` no lo ve nadie"): una línea
fija **entre el buscador y la lista**, fuera del área que scrollea, con `role="status"` y `aria-live="polite"`
**siempre montada** (vacía cuando no hay nada que decir), `tabular-nums`, con el sustantivo:
- "Mostrando 50 de 387 equipos. Escribí para afinar." (cuando el total supera el tope).
- "Buscando…" (async), "Escribí al menos 2 caracteres" (`minChars`), "Sin resultados para «xyz»".
- Error async: dentro de la lista, `role="alert"`, "No se pudieron cargar las opciones." + botón "Reintentar"
  (`refetch`), sin cerrar el popover.
- Carga local (`loading`): trigger con "Cargando…" y `aria-busy`, lista con 3 filas skeleton.

**Trigger.**
- Simple: un `<button type="button" role="combobox">` con el label elegido truncado (y el `code` en mono antes),
  chevron, y una X de limpiar si `clearable` (botón aparte, ver abajo).
- Múltiple: el trigger **no puede contener los botones × de los chips** (un botón dentro de otro es HTML inválido y
  rompe el teclado). Estructura: un `div` con el borde del campo y `focus-within`, que contiene el
  `button role="combobox"` (con "3 equipos" o el placeholder) y, al lado, los chips `h-6 border` cuadrados con su
  propio `<button type="button" aria-label="Quitar «X»">`. Se muestran 2 chips + "+N" (sin medir el DOM), y el
  resto se ve en la lista con su check. Reemplaza el "N recursos seleccionados" genérico de hoy.
- Look: `DISENO.md` §4.15, el mismo trigger de campo que `DatePicker` y que `Select`.

**Desktop:** `Popover` del ancho del trigger (`w-(--radix-popover-trigger-width)`, mínimo 240px), buscador
`h-9 border-b` arriba, aviso, lista `max-h-[300px] overflow-y-auto overscroll-contain`, ítems `h-8` con check a la
izquierda. Sin animación de apertura (se abre cientos de veces por día, `emilkowalski/emil-design-eng`).
**Mobile (< 768px):** drawer (anidado si está dentro de un `ResponsiveDialog` en drawer) a `85dvh`, buscador fijo
arriba (`h-11`, 16px, `enterKeyHint="search"`, `autoCapitalize="none"`, `autoCorrect="off"`), ítems de 44px; en
múltiple, footer fijo "Listo (3)". Mismo cálculo de modo que `ResponsiveDialog` (`useMediaQuery`, fijado al abrir).

**Teclado.** Enter/Espacio/↓ en el trigger abre y enfoca el buscador; ↑↓ mueven la activa; Enter elige (en simple
cierra y devuelve el foco al trigger; en múltiple alterna y sigue abierto); Esc cierra; Tab cierra y sigue. En
múltiple, Backspace con el buscador vacío quita el último chip. `aria-expanded`, `aria-controls` y
`aria-activedescendant` los dan Radix + cmdk (se verifican, `ibelick/fixing-accessibility`).

**Empleados** (`employee-file-number.md`): `src/shared/utils/option-labels.ts` exporta
`toEmployeeOption({ id, file_number, lastname, firstname, … })` → `{ value: id, code: String(file_number), label:
"Apellido Nombre" }`. Se ve `[1234] Apellido Nombre` con el legajo en mono, se busca por legajo o nombre, y el
placeholder del buscador es "Buscar por legajo o nombre…". Idem `toVehicleOption` (dominio/interno en `code`). Si la
query de un consumidor no trae `file_number`, sumarlo es cambio de query: se decide en su fase (7.5).

**Adaptadores de contrato** (se escriben **en el consumidor** al migrar, en una línea; el primitivo no los conoce).
Cubre los contratos de §2.4:

| Contrato de hoy | Adaptador al migrar |
|---|---|
| `string` id, `''` al limpiar | `value={field.value \|\| null}` · `onChange={(v) => field.onChange(v ?? '')}` |
| campo array con `max=1` (`DiagramFormUpdated`, `LocationSection:192`) | `value={field.value[0] ?? null}` · `onChange={(v) => field.onChange(v ? [v] : [])}`. **Ojo:** hoy deseleccionar da `['']`; si el schema o la action dependen de eso, se conserva `['']` (se verifica en la fase) |
| `number` / `number[]` (`ContactDataFields`, `AreaFormDialog:215`) | `V = number`: el primitivo acepta `number` sin `map(Number)` |
| guarda el **nombre** + id aparte (`ChecklistGeneralInfoSection:281`) | `onChange={(id) => { const o = byId.get(id); field.onChange(o?.label ?? ''); setValue('chofer_employee_id', id) }}` (mismo doble set de hoy) |
| objeto (`ItemsSection:100`) | `onChange={(id) => setSelectedItems(itemsById.get(id))}` |
| "Sin vincular" → `null` (`OtherEquipmentBasicDataForm:810`) | `clearable` con label "Sin vincular" o una opción explícita, según la ficha |
| tope "reemplaza el primero" (`MultiSelectCombobox`) | `onMax="replace-oldest"` |
| M:M con altas/bajas explícitas (`AssignmentDialog`) | sigue calculando `{ add, remove }` con `diffAssignments(baseline, selected)` **afuera**; el primitivo solo devuelve el conjunto elegido |

**Estados límite.** 400–650 opciones (tope + aviso), 0 opciones, todas deshabilitadas, label de 120 caracteres
(truncado con `title`), `code` sin valor, selección que ya no está en las opciones (se muestra el label de
`selectedOptions` o "Opción no disponible"), error y reintento, abortar al cerrar, doble clic en una opción (cmdk
dispara una sola vez), dentro de un `<form>` (todo `type="button"`) y dentro de un `ResponsiveDialog` en drawer.

### 3.5 `StatusBadge` + `statusToneMap`

**Componente** (`components/ui/status-badge.tsx`, sin directiva: se usa desde server y client):

```ts
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

type StatusBadgeProps = {
  tone: StatusTone;
  children: React.ReactNode;           // el texto del estado: obligatorio (nunca solo color)
  icon?: LucideIcon | 'dot';           // default 'dot' (punto size-1.5 rounded-full bg-{tone})
  className?: string;
};

// atajo por dominio: tono, label e ícono salen del mapa único
type DomainStatusBadgeProps<D extends StatusDomain> = { domain: D; status: StatusOf<D> | null; className?: string };
```

Look (`DISENO.md` §4.2): `inline-flex items-center gap-1.5 h-5 px-1.5 border text-[12px] font-medium whitespace-nowrap`
+ `bg-{tone}-soft border-{tone}-border text-{tone}-text`; `brand` = `bg-primary-soft border-primary/30
text-primary-text`. Las 6 combinaciones se escriben **completas** en un `Record<StatusTone, string>` (Tailwind v4 no
ve clases armadas en runtime). Ícono `size-3 strokeWidth={2}` con `aria-hidden`. Contenido largo: `max-w-full
truncate` con `title`.

**`statusToneMap`** (se agrega a `src/shared/utils/mappers.ts`, junto a los labels que ya están ahí; prohibido
redefinirlo por pantalla, `DISENO.md` §4.2):

```ts
export const statusToneMap = {
  resource: { Completo: 'success', Completo_con_doc_vencida: 'warning', Incompleto: 'danger', Avalado: 'success', No_avalado: 'danger' },
  activity: { active: 'success', inactive: 'neutral' },   // los ~60 ternarios is_active de §2.5
  document: { aprobado: 'success', presentado: 'info', pendiente: 'neutral', vencido: 'danger', rechazado: 'danger' },
  condition: { operativo: 'success', operativo_condicionado: 'warning', en_reparacion: 'info', no_operativo: 'danger', en_preparacion: 'neutral' },
  dailyReport: { /* claves de dailyReportStatusLabels: cerrado → success, con desvíos → warning, abierto → info, sin parte → neutral */ },
  dailyReportRow: { /* claves de dailyReportRowStatusLabels */ },
} as const satisfies Record<string, Record<string, StatusTone>>;

export type StatusDomain = keyof typeof statusToneMap;
export type StatusOf<D extends StatusDomain> = keyof (typeof statusToneMap)[D];
export const statusLabelMap = { resource: employeeStatusLabels, document: documentStateLabels, condition: conditionLabels, … } satisfies Record<StatusDomain, Record<string, string>>;
export const statusIconMap = { … } satisfies Partial<Record<StatusDomain, Partial<Record<string, LucideIcon>>>>;
```

Reglas:
- Las claves son **los valores reales de la BD** (los labels siguen saliendo de los mapas que ya existen). Las claves
  con espacio que usan algunos mapas locales (`'no operativo'`, `'Completo con doc vencida'`) **no** se suman: se
  normaliza en el consumidor al migrar.
- En la Fase 2 se cargan **solo los dominios que `DISENO.md` §4.2 ya fija** (recurso, documento, parte diario y
  línea de parte) más `activity` y `condition`. Los demás (pedido/orden de mantenimiento, solicitud, OT, tarea,
  sector, prioridad, preparte, factura, certificación, gomería, checklist, selección, indumentaria, tickets) los
  agrega **cada módulo al migrar**, partiendo de su mapa más completo (`work-order-status.ts` y los `*_CONFIG`). Como
  `mappers.ts` es compartido, el agente del módulo pide el cambio al hilo principal (`PLAN.md` §5).
- Los tonos contradictorios de §2.5 (documento `pendiente`, `en_reparacion`, `paused`, `in_workshop`, `scheduled`) son
  una decisión de producto, no técnica: decisión 7.6 con la propuesta de arriba.
- `status` desconocido o `null`: badge `neutral` con el valor crudo (o "—") y `logger.warn` una vez en desarrollo.
- `DomainStatusBadge` es la entrada preferida; `StatusBadge tone=` queda para estados que no son de un enum (conteos,
  "Vence en 3 días").
- No reemplaza a `Badge`: las etiquetas que **no** son estado (tipo, categoría, cliente) siguen con `Badge variant="outline"`.

### 3.6 `StatCard` + `KpiStrip`

`shared/components/data-display/StatCard.tsx`, sin directiva (server por defecto; también se puede usar desde un
client component con `onSelect`).

```ts
type KpiStripProps = { 'aria-label': string; children: React.ReactNode; className?: string };

type StatCardProps = {
  label: string;                                  // overline: "EMPLEADOS ACTIVOS"
  value: number | string | null;                  // null → "—" (no medido), nunca 0 (regla aprendida del 578)
  format?: 'number' | 'percent' | 'currency' | 'none';  // default 'number' (Intl es-AR, a nivel de módulo)
  unit?: string;                                  // "hs", "km"
  delta?: { value: number; label: string; better: 'up' | 'down' };  // "▲ 12 vs. mes anterior"; el tono sale de `better`
  hint?: string;                                  // una línea de caption
  icon?: LucideIcon;                              // 14px muted junto al label; nunca caja de color
  loading?: boolean;                              // skeleton con la geometría real
} & (
  | {}                                                               // estático
  | { href: string; active?: boolean }                               // navega (Link)
  | { onSelect: () => void; active: boolean }                        // filtra en la misma vista (Preparte)
);
```

Estructura (`DISENO.md` §4.10): `KpiStrip` es un único `<dl>` con `@container/kpi`, `grid grid-cols-2
@3xl/kpi:grid-cols-4 border border-border bg-card divide-x divide-y @3xl/kpi:divide-y-0 divide-border` (6 columnas
en `@5xl/kpi` cuando hay 6 cifras, como `KpiCardsRow`). Cada `StatCard` es un `div p-4 space-y-1 relative` con
`<dt class="text-overline text-muted-foreground">`, `<dd class="text-kpi tabular-nums">` y un `<dd>` de caption para
delta y hint. Jerarquía del número con tamaño, peso y color (`dammyjay93/interface-design`): label 11/500 apagado,
valor 28/600 tabular, delta 12/500 con tono.
- Clickeable: el contenido no se envuelve en un botón (un `button` no puede contener `dt`/`dd`). Se agrega un
  `<button type="button" aria-pressed={active}>` o un `<Link>` **estirado** (`absolute inset-0`) con
  `aria-label="Filtrar por {label}"` / "Ver {label}", hover `bg-accent`, y activo con la barra superior
  `shadow-[inset_0_2px_0_var(--primary)]`.
- Delta: signo + flecha (`ArrowUp`/`ArrowDown`) + texto, en `text-success-text` o `text-danger-text` según `better`;
  nunca solo color.
- `value: null` → `—` en `text-muted-foreground` con `<span class="sr-only">Sin dato</span>`.
- Valor largo (millones, moneda): `tabular-nums`, `truncate` con `title`, el ancho lo da la grilla (`min-w-0`).
- `StatCardSkeleton` (exportado, para los `Suspense` por cifra de Preparte): líneas de 11/28/12px sin pulso con
  reduced motion.

### 3.7 `EmptyState`

`shared/components/feedback/EmptyState.tsx`, sin directiva.

```ts
type EmptyStateProps = {
  variant?: 'empty' | 'filtered' | 'error';   // default 'empty'
  title: string;
  description: string;                        // por qué está vacío (la condición real, regla aprendida del 578)
  icon?: LucideIcon;                          // default por variante: Inbox / SearchX / CircleAlert
  action?: React.ReactNode;                   // como máximo UNA (Button o Link del consumidor)
  size?: 'default' | 'compact';               // default: min-h-60 (cuerpo de tabla) · compact: dentro de dialogs y listas
  className?: string;
};
```

Look (`DISENO.md` §4.11): alineado a la izquierda, sin ilustración. Ícono 20px en un cuadrado `size-9 border
border-border bg-panel-2`, título `text-section`, una línea `text-body text-muted-foreground max-w-prose
text-pretty`, la acción abajo. `variant="error"` lleva `role="alert"` y el ícono en `text-danger`; las otras dos no
anuncian (no son cambios de estado urgentes). `filtered` no trae texto por defecto: el consumidor pasa título
("Sin resultados para los filtros aplicados") y la acción "Limpiar filtros" (DataTable en la Fase 3).
Precedente: `Ayuda/components/EmptyTicketsState.tsx` (copy por caso + una acción).

### 3.8 `RowActions`

`shared/components/data-display/RowActions.tsx`, `'use client'` (usa `DropdownMenu`).

```ts
type RowAction = {
  id: string;
  label: string;                  // texto del ítem y aria-label / tooltip del ícono
  icon: LucideIcon;
  tone?: 'default' | 'danger';    // danger: `danger-ghost`, va al final del menú tras un separador
  disabled?: boolean;             // con disabledReason opcional (se muestra en el ítem, no en tooltip sobre disabled)
  disabledReason?: string;
} & ({ onSelect: () => void } | { href: string });   // nunca un ítem inerte

type RowActionsProps = {
  actions: RowAction[];           // YA filtradas por permisos por el consumidor (donde hoy)
  rowLabel: string;               // "Acciones de «Pérez Juan»" (aria-label del ⋯)
  inline?: string[];              // ids que se ven como íconos en desktop (máx. 2); el resto va al ⋯
  layout?: 'auto' | 'menu';       // 'menu' = solo ⋯ (tarjeta mobile del DataTable, Fase 3). default 'auto'
};
```

- **Permisos**: `RowActions` no consulta permisos. El consumidor arma el array con los mismos `canX`,
  `hasPermission` o reglas de estado que hoy (`datatable.md`: "ocultar la acción, nunca la columna"). Si el array
  queda vacío, no se renderiza nada (ni el ⋯).
- **Desktop** (`layout="auto"`): los `inline` como `Button variant="ghost" size="icon-sm"` con `Tooltip` (delay 400ms)
  y `aria-label`; si quedan acciones, un ⋯ `ghost icon-sm` (`MoreHorizontal`). Si hay 1 o 2 acciones en total, van
  todas inline y no hay menú (un menú de un ítem es un clic de más). Siempre visibles, sin depender del hover
  (`ibelick/fixing-accessibility`, `DISENO.md` §4.6).
- **Mobile** (`layout="menu"`): solo el ⋯ de 44×44. Lo decide el DataTable de la Fase 3 (por container query de la
  tabla), no `RowActions`.
- `href` → `DropdownMenuItem asChild` con `<Link>`; `onSelect` → ítem `<button>` (`vercel-labs/web-design-guidelines`).
- **Confirmaciones desde el menú**: el `onSelect` del ítem no se ejecuta en el mismo tick. Se guarda en un `ref` y se
  corre en `onCloseAutoFocus` del `DropdownMenuContent` (con `preventDefault()` del foco automático). Así el menú
  terminó de cerrarse, Radix liberó el `pointer-events: none` del body, y el `ConfirmDialog` que abre la acción
  devuelve el foco al ⋯ al cerrarse (problema conocido de Radix con dialog abierto desde menú).
- `type="button"` en todo (las celdas de acciones viven dentro de tablas que a veces están dentro de forms).
- Las celdas delegadas complejas de §2.8 (`UserStatusCell`, `ExternalAccessActionsCell`, `row-actions-cell`) usan
  `RowActions` para el disparador y conservan su lógica.

### 3.9 `Panel` + `Section`

`components/ui/panel.tsx`, sin directiva.

```ts
Panel:        React.ComponentProps<'section'>                      // bg-card border border-border @container/panel
PanelHeader:  { title: React.ReactNode; titleAs?: 'h2' | 'h3'; overline?: string; actions?: React.ReactNode; className? }
PanelBody:    React.ComponentProps<'div'>                          // p-4
PanelFooter:  React.ComponentProps<'div'>                          // px-4 py-3 border-t bg-panel-2
Section:      { title: string; action?: React.ReactNode; children; className? }   // overline + hairline, para adentro de un panel
```

- `PanelHeader`: `flex items-center justify-between gap-3 px-4 h-11 border-b border-border`, título `text-section`
  truncado, acciones `size="sm"` a la derecha.
- Sin padding en `Panel`: el DataTable (Fase 3) va directo adentro (`DISENO.md` §4.3: "paneles sin header: `p-0`").
- `Section` (`DISENO.md` §4.5): `<section class="space-y-3">` + encabezado `flex items-baseline justify-between
  border-b border-border pb-2` con `text-overline` y una acción `link` opcional. Reemplaza los `Separator` + `h3`
  sueltos y es lo que se usa **dentro** de un panel (nunca panel dentro de panel).
- La regla "panel dentro de panel" no se puede detectar en server sin contexto: la verifica la auditoría por grep.
- `Card` sigue existiendo sin cambios hasta la Fase 9.

### 3.10 `SimpleTable`

`shared/components/data-display/SimpleTable.tsx`, sin directiva. Solo para **conjuntos acotados** (D1, D7).

```ts
type SimpleColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  kind?: 'text' | 'number' | 'code' | 'date';   // number: derecha + tabular · code: .data-code · date: tabular
  className?: string;                            // ancho con clase literal ('w-32')
};

type SimpleTableProps<T> = {
  caption: string;                               // obligatorio: <caption class="sr-only"> (nombre accesible)
  columns: SimpleColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  footer?: React.ReactNode;                      // <tfoot> para totales (factura, certificación)
  empty?: React.ReactNode;                       // default <EmptyState size="compact" …>
  mobileLayout?: 'scroll' | 'stack';             // default 'scroll'; 'stack' para ≤ 4 columnas
};
```

- Desktop: `@container/simple-table`, header `h-8 bg-muted text-overline border-b border-border-strong`, `<th
  scope="col">`, filas `h-9 text-cell border-b border-border` sin zebra, sin sombra.
- `mobileLayout="scroll"` (matrices, totales, grillas de días): scroll horizontal **dentro** del contenedor con
  `overflow-x-auto overscroll-x-contain` y la máscara lateral de `DISENO.md` §4.6; la primera columna `sticky left-0
  bg-card`.
- `mobileLayout="stack"`: bajo `@xl/simple-table` cada fila se dibuja como un bloque `dl` (label arriba, valor
  abajo) con CSS (`display: grid` + `before:content-[attr(data-label)]` en la celda), con `role="table"/"row"/"cell"`
  explícitos para que el lector de pantalla no pierda la semántica al cambiar el `display`.
- Guardia D7: si `rows.length > 200`, `logger.warn` en desarrollo ("SimpleTable es para conjuntos acotados; usar
  DataTable con paginación en servidor"). No corta ni pagina: lo que crece no entra acá (anexo D7).
- Celdas nulas: el consumidor devuelve `—`; el primitivo no adivina.
- Reusa `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableCell`, `TableFooter` de `components/ui/table.tsx`.

### 3.11 Revestimiento de los wrappers base (solo clases y textos, mismas props)

| Archivo | Cambio |
|---|---|
| `dialog.tsx` | overlay `bg-black/40`; content `bg-popover border-border-strong shadow-(--shadow-overlay)` sin `rounded-lg`/`shadow-lg`; **el padding del content se conserva** (`p-6` → `p-5`, mismo `gap-4`) para no desacomodar a los 112 consumidores que arman su contenido adentro; `DialogHeader` y `DialogFooter` llegan al borde con margen negativo (`-mx-5 -mt-5 px-5 py-3 border-b` / `-mx-5 -mb-5 px-5 py-3 border-t bg-panel-2`) para dar las hairlines de la spec; título `text-section`; X `ghost icon-sm` con `sr-only` **"Cerrar"** y el botón "Close" del footer → "Cerrar"; motion 240/150ms. Se conserva el remount por `key={generation}`. `ResponsiveDialog` no usa `DialogHeader`/`Footer`: arma su propia estructura sin padding en el content |
| `alert-dialog.tsx` | mismo contenedor; `size="default"` = 400px (hoy `sm:max-w-lg`); header alineado a la izquierda también en mobile; footer apilado a ancho completo en mobile; `AlertDialogAction`/`Cancel` con `variant` `primary`/`secondary` |
| `sheet.tsx` | `shadow-(--shadow-overlay)`; mismo criterio que `dialog`: content `p-5` y `SheetHeader`/`SheetFooter` con margen negativo y hairline (hoy suman `p-4` al `p-6` del content); slide 240ms entrada / 150ms salida (hoy 500/300); X "Cerrar" |
| `drawer.tsx` | `max-h-[92dvh]` (hoy `80vh`), sin `rounded-t-lg`, handle `h-1 w-10 bg-border-strong`, header a la izquierda, footer con safe-area |
| `popover.tsx`, `dropdown-menu.tsx`, `select.tsx` (content) | `bg-popover border-border-strong shadow-(--shadow-overlay)`; ítems `h-8` con `focus:bg-accent`; ítem destructivo `text-danger-text focus:bg-danger-soft`; motion `--duration-base`; menú y select sin zoom (solo opacidad, `emil-design-eng`) |
| `command.tsx` | input `h-9 border-b`; `CommandList max-h-[300px] overscroll-contain` |
| `calendar.tsx` | `--cell-size: --spacing(8)` (32px) y 44px con coarse; seleccionado `bg-primary`; hoy subrayado 2px; conserva `locale={es}` de date-fns (lo exige rdp) |
| `tooltip.tsx` | `DISENO.md` §4.14: sin flecha ni rounded, `text-caption px-2 py-1`, 120ms de opacidad; `delayDuration` 400 en el provider |
| `tabs.tsx` | `DISENO.md` §4.9: la variante `default` pasa a subrayada (`h-10 px-3 text-[13px]`, activo `text-foreground shadow-[inset_0_-2px_0_var(--primary)]`, lista `border-b`); se agrega `variant="segmented"` (§4.9). `line` queda como alias de `default` |
| `skeleton.tsx` | `bg-muted animate-pulse` sin rounded; `motion-reduce:animate-none` |
| `alert.tsx` | `DISENO.md` §4.16: variantes por tono con tokens (`border-{tone}-border bg-{tone}-soft text-{tone}-text`) + `inline`; las variantes viejas quedan como alias |
| `checkbox.tsx` | cuadrado 16px, `border-input`, marcado `bg-primary`, hit area de 24px por pseudo-elemento (44 con coarse) |
| `input.tsx`, `select.tsx` (trigger), `textarea.tsx` | resto de `DISENO.md` §4.8: `bg-card` (dark `bg-background`), `px-2.5`, `text-base md:text-sm`, hover `border-fg-subtle`, `aria-invalid:border-danger`, sin `ring-[3px]` (queda el outline global de 2px) |

Ningún export ni prop cambia, así que `npm run check-types` no se mueve. Lo que puede cambiar es el **espaciado
interno**: 4px menos de padding en dialogs y sheets, y los headers/footers que el consumidor arma con `DialogHeader`
o `DialogFooter` pasan a tener hairline y fondo. Lo cubre la muestra de 8 dialogs reales de §8.2.

## 4. Reorganización del código

### 4.1 Componentes que se crean (y nada se parte)

Los 10 primitivos y sus 4 utilidades de §1.1. En esta fase no se parte ningún componente existente: los
"componentes gigantes" se ordenan con su módulo. Ningún archivo nuevo debería pasar de ~300 líneas. Si `search-select.tsx`
crece más, se separa en `search-select.tsx` (trigger, raíz y API), `search-select-list.tsx` (lista, aviso y estados) y
`search-select-drawer.tsx` (mobile), sin barrel.

### 4.2 Duplicados que cada primitivo unifica (al migrar los consumidores)

| Primitivo | Reemplaza | Se borra en la Fase 9 cuando quede sin consumidores |
|---|---|---|
| `ResponsiveDialog` | anchos sueltos de `DialogContent`, `EditModal`, AlertDialogs que envuelven forms (F/I/M) | `shared/components/common/EditModal.tsx` |
| `ConfirmDialog` / `useConfirm` | 44 AlertDialog simples, `Ayuda/components/ConfirmDialog.tsx`, `confirm()` nativo | `components/ui/action-button.tsx` (ya muerto), `Ayuda/components/ConfirmDialog.tsx` |
| `DatePicker` / `FormDatePicker` | `EnhancedDatePicker`, `YearMonthPicker`, `DataTableDatePicker` (en `DailyReportWrapper`), `PartesDiarios/components/DatePicker.tsx`, 23 Calendar a mano, la copia de `ReplaceDocument`, 30 `type="date"` y 4 `type="month"` | `enhanced-datepicket.tsx`, `year-month-picker.tsx`, `Operaciones/PartesDiarios/components/DatePicker.tsx` |
| `SearchSelect` | `MultiSelectCombobox`, `multi-select`, `_MultiSelectField`, `SearchableSelect`, `RepairTypeCombobox`, ~57 comboboxes a mano, `EmployeeCommandList` | `multi-select-combobox.tsx`, `multi-select.tsx`, `_MultiSelectField.tsx`, `Mantenimiento/shared/components/SearchableSelect.tsx`, `OperatorPanel/components/RepairTypeCombobox.tsx` |
| `StatusBadge` + `statusToneMap` | ~95 mapas locales, 4 `*Badges` de `mappers.ts`, 5 `XStatusBadge`, ~60 ternarios Activo/Inactivo | los mapas `*Badges` de `mappers.ts`, `Mantenimiento/shared/components/status-badge.tsx` |
| `StatCard` / `KpiStrip` | `CardInfo`, tira de Preparte, `KpiCardsRow`, `IndicatorStats`, cifras inline | `shared/components/cards/CardInfo.tsx` |
| `EmptyState` | `Mantenimiento/shared/components/empty-state.tsx`, `EmptyStateWithReset` (sin importadores), ~165 vacíos a mano | `Mantenimiento/shared/components/empty-state.tsx` |
| `RowActions` | 80 celdas de acciones (íconos, textos, links, mixtas) | — |
| `Panel` / `Section` | ~390 `<Card>`, `Separator` + `h3` sueltos | variantes viejas de `card.tsx` |
| `SimpleTable` | ~15 `<Table>`/`<table>` acotadas | — |

### 4.3 Límite server/client y serialización (`server-serialization`, `vercel-labs/react-best-practices`)

- **Sin directiva** (se renderizan en el servidor si el padre es server, y en el cliente si el padre es client):
  `StatusBadge`, `StatCard`/`KpiStrip`, `EmptyState`, `Panel`/`Section`, `SimpleTable`, `date-adapters`, `option-labels`,
  `formatters`. No usan hooks ni APIs del navegador. Mismo patrón que `PageHeader` de la Fase 1.
- **`'use client'`**: `ResponsiveDialog`, `ConfirmDialog`/`useConfirm`, `DatePicker`, `FormDatePicker`, `SearchSelect`,
  `RowActions`, `use-media-query`.
- `SimpleTable` recibe funciones (`cell`, `getRowKey`): se usa desde server components (las funciones no cruzan la
  frontera) o desde un client component padre. Nunca se le pasan funciones desde un server a un client.
- Los primitivos no agregan campos a ninguna query: muestran lo que el consumidor ya trae. `toEmployeeOption` lee
  `file_number`, pero no lo pide (si falta, ver 7.5).
- `SearchSelect` async no recibe el catálogo entero por props: recibe `search` (una server action) y
  `selectedOptions` (solo lo elegido). Es la vía para sacar de las props los catálogos de 650/380 ítems que hoy cruzan
  la frontera (`NewDocumentMulti.tsx:26/32`, `DailyReportWrapper`), cuando su módulo lo decida (anexo D7).

### 4.4 Fetching

- Ningún primitivo hace fetch salvo `SearchSelect` async: React Query (`react-query.md`), `queryKey` de primitivos,
  `staleTime` explícito, `signal` para abortar, `enabled: open` (no busca con el popover cerrado), `keepPreviousData`
  para que la lista no parpadee entre búsquedas (`client-swr-dedup`, equivalente en React Query).
- Sin `useEffect` + `useState` para datos. El único `useEffect` nuevo es el timer del debounce (sincronización con
  algo externo, permitido por `no-useeffect.md`).

### 4.5 Bundle

- `bundle-conditional` / `bundle-dynamic-imports`: el calendario (`react-day-picker`) y el grid de meses se importan
  con `next/dynamic` al abrir el popover; el `DatePicker` cerrado es un input y un botón. La lista y el drawer de
  `SearchSelect` también se montan solo al abrir. vaul ya viene en el bundle del `ResponsiveDialog`.
- `bundle-barrel-imports`: sin `index.ts` nuevos; `lucide-react` lo optimiza Next.
- `bundle-preload`: el `DatePicker` precarga el chunk del calendario en `onPointerEnter`/`onFocus` del botón.
- Nada de `date-fns` nuevo (solo el `es` que exige rdp, ya importado en `calendar.tsx`).

### 4.6 Re-renders

- `rerender-no-inline-components`: los ítems de la lista, los chips, la celda de `SimpleTable` y las filas del
  grid de meses son componentes de módulo, no definidos adentro.
- `rerender-memo-with-default-value`: los defaults no primitivos (`[]`, `{ one, other }`) son constantes de módulo.
- `rerender-use-deferred-value`: filtro local de `SearchSelect`.
- `rerender-derived-state-no-effect`: texto de la fecha y modo del dialog derivados en render, con el patrón de
  "estado previo" cuando cambia la prop.
- `rerender-functional-setstate` / `advanced-use-latest`: `confirm` estable; `onConfirm` leído desde un `ref`.
- `rendering-conditional-render`: ternarios en contadores ("+N", "Mostrando…").
- `js-cache-function-results` / `js-hoist-regexp`: `Intl.NumberFormat`, `Intl.PluralRules` y las regex de máscara se
  crean una vez a nivel de módulo; el normalizador de acentos del filtro se cachea por opción en un `Map` (dentro
  del `useMemo` de las opciones, `js-index-maps`).
- `client-event-listeners`: un solo listener de `matchMedia` compartido por todos los `useMediaQuery` (el store del
  hook es un singleton por query, no un listener por dialog).

### 4.7 Orden de implementación y reparto en paralelo

Flujo de implementación: `/feature-dev:feature-dev` (regla global), sin commits y sin tests (los tests van al final y
con el OK del usuario). Cada paso cierra con `npm run check-types` en verde y la sección de la página de ejemplo
correspondiente.

**Ola 0: base compartida (secuencial, un solo agente; los otros dependen de esto)**
1. `src/shared/hooks/use-media-query.ts` (`useSyncExternalStore`, singleton por query).
2. `src/shared/utils/formatters.ts` (`formatNumber`, `formatPercent`, `formatCurrency`, `formatCount(n, noun)` con
   `Intl.PluralRules('es-AR')`).
3. `src/components/ui/responsive-dialog-context.ts` (solo el contexto `{ surface }` y su hook, para que el
   `DatePicker` y el `SearchSelect` no esperen al `ResponsiveDialog`).
4. Revestimiento de §3.11 (los 14 wrappers base). Son los archivos que todos los primitivos importan; si se hicieran
   en paralelo con ellos, dos agentes tocarían `dialog.tsx`/`popover.tsx` a la vez (`PLAN.md` §5).
   **Checkpoint 0**: check-types + una mirada a 8 dialogs reales (§8.2) en claro y oscuro.

**Ola 1: primitivos (5 agentes en paralelo; ningún archivo se comparte entre ellos)**

| Agente | Archivos (exclusivos) | Depende de |
|---|---|---|
| A — contenedores | `components/ui/panel.tsx` · `shared/components/feedback/EmptyState.tsx` · `shared/components/data-display/SimpleTable.tsx` | Ola 0 (`table.tsx` revestido) |
| B — estado y cifras | `components/ui/status-badge.tsx` · **`shared/utils/mappers.ts`** (solo agrega `statusToneMap`, `statusLabelMap`, `statusIconMap`) · `shared/components/data-display/StatCard.tsx` · `shared/components/data-display/RowActions.tsx` | Ola 0 (`formatters`, `tooltip`, `dropdown-menu`) |
| C — overlays | `components/ui/responsive-dialog.tsx` · `components/ui/confirm-dialog.tsx` | Ola 0 (`use-media-query`, contexto, `dialog`/`sheet`/`drawer`/`alert-dialog`) |
| D — fechas | `components/ui/date-picker.tsx` · `components/ui/form-date-picker.tsx` · `shared/utils/date-adapters.ts` | Ola 0 (`calendar`, `popover`, `drawer`, contexto) |
| E — selectores | `components/ui/search-select.tsx` (+ `-list`/`-drawer` si se parte) · `shared/utils/option-labels.ts` · `shared/hooks/use-debounced-value.ts` | Ola 0 (`command`, `popover`, `drawer`, contexto, `formatters`) |

Dependencias **dentro** de la ola: ninguna dura. `SimpleTable` usa `EmptyState` (mismo agente A). `RowActions` no
importa `ConfirmDialog` (el consumidor lo encadena); la prueba conjunta se hace en la ola 2. Si se prefiere menos
paralelismo: C y D son los de más riesgo y conviene que arranquen primero.

**Ola 2: integración (hilo principal, secuencial)**
1. Página de ejemplo (§4.8) con todos los escenarios.
2. Recorrido en el navegador (§8) en 1440 / 768 / 375, claro y oscuro, teclado, y en un teléfono real para drawer,
   `DatePicker` y `SearchSelect` (`emilkowalski/mobile-native`: la emulación no reproduce teclado ni safe area).
3. Auditoría `ui-skills` (`AUDITORIA-UI.md`) hasta "en cero" y bitácora del PLAN.

### 4.8 Página de ejemplo local (no commiteada)

Siguiendo `jakubkrehel/break`: una ruta descartable que importa los **componentes reales** (nada de copias), un
escenario por bloque con una etiqueta arriba, en contenedores de ancho fijo, sin estilos propios más que anchos y
etiquetas. Se carga una vez, se recorre de arriba abajo y las roturas se anotan en la propia página.

- **Ruta**: `src/app/dashboard/dev-primitivos/page.tsx` (+ `_fixtures.ts` y `_scenarios/*.tsx` en la misma carpeta).
  Va dentro de `/dashboard` para heredar shell, fuentes, tokens, toaster, providers (React Query) y la sesión del
  `proxy.ts`. La página es `'use client'` (los escenarios pasan funciones y estado).
- **No se commitea**: se agrega `src/app/dashboard/dev-primitivos/` a **`.git/info/exclude`** (nunca al `.gitignore`).
  No aparece en `navigation.ts`, así que `npm run manual:check` no la ve. Se borra al cerrar la fase o cuando el usuario
  lo diga; antes del PR final se verifica con `git status --ignored` que no quede nada.
- **Fixtures sin BD**: 650 empleados y 380 equipos generados con una semilla fija (legajos de 1 a 5 dígitos, apellidos
  de 1 a 40 caracteres, uno de 120), una `search` simulada con demora de 400ms que respeta `AbortSignal` y un switch
  "forzar error", y un `onConfirm` simulado (éxito, demora de 2s, error).
- **Escenarios** (cada uno a 375px, 768px y 1440px de contenedor cuando el primitivo responde a `@container`; los
  que dependen del viewport, `ResponsiveDialog` y el modo mobile de `SearchSelect`/`DatePicker`, se prueban con el
  modo responsive de DevTools y en el teléfono):

| Primitivo | Escenarios |
|---|---|
| `ResponsiveDialog` | 4 tamaños × `dialog`/`sheet` · `mobile` drawer y fullscreen · body de 3 párrafos y de 80 · título de 120 caracteres · form de 6 campos con `DatePicker` y `SearchSelect` adentro (drawer anidado) · `dismissible={false}` con envío de 2s · rotar con el dialog abierto (no pierde lo escrito) |
| `ConfirmDialog` / `useConfirm` | sync · async OK · async que lanza (error adentro, reintento) · doble clic y Enter repetido (una sola llamada, contador visible en la página) · Esc durante el pending (no cierra) · abierto desde un `RowActions` (foco vuelve al ⋯) · `destructive` con foco en Cancelar |
| `DatePicker` / `FormDatePicker` | escribir `07102026` · pegar `7/10/2026` y `2026-10-07` · `31/02/2026` · `15/13/2026` · año de 2 dígitos · fuera de `min`/`max` · `isDateDisabled` (fin ≥ inicio) · vacío en campo opcional · reset del form · `granularity="month"` · un form RHF+zod con **los 5 `format`** que imprime el payload JSON de cada uno al enviar (para comparar contra el tipo de hoy) · dentro de un `<form>`: el botón de calendario no submitea |
| `SearchSelect` | simple local con 650 empleados (`[legajo]` mono, búsqueda por legajo y por nombre con y sin acento) · múltiple con 380 equipos, `max=3` en `ignore` y en `replace-oldest`, `selectAll` · async con demora, `minChars=2`, error y reintento · 0 opciones · todas deshabilitadas · label de 120 caracteres · valor que no está en las opciones · `V = number` · dentro de un `ResponsiveDialog` en drawer |
| `StatusBadge` | los 6 tonos × punto e ícono · cada dominio del mapa con todos sus valores · `status` desconocido y `null` · label largo en una celda angosta |
| `StatCard` / `KpiStrip` | 2, 4 y 6 cifras · `null` · 12.345.678 y moneda · delta mejor y peor · clickeable con `onSelect` (aria-pressed) y con `href` · `loading` |
| `EmptyState` | 3 variantes × `default`/`compact` · descripción de 3 líneas · sin acción |
| `RowActions` | 1, 2 y 5 acciones · con `danger` · `layout="menu"` · `disabled` con motivo · ítem `href` · dentro de un `<form>` |
| `Panel` / `Section` | con y sin header, acciones que no entran, `Section` adentro |
| `SimpleTable` | 3 filas · 0 filas · 201 filas (warn en consola) · `scroll` con 12 columnas · `stack` con 4 · `footer` de totales · celdas `number`/`code`/`date` |

- El revestimiento de la ola 0 **no** se prueba en esta página: los 8 dialogs reales de §8.2 se abren desde su
  pantalla, con sus datos.

## 5. Qué NO se toca

- **Ningún consumidor.** Las 126 + 71 + 9 + 71 + 95 + 13 + 165 + 80 + 390 + 20 superficies de §2 siguen como están.
  Solo cambian de aspecto por el revestimiento de los wrappers (§3.11), sin cambiar props ni comportamiento.
- Server actions, queries, schemas Zod, permisos, `data-testid`, textos de los diálogos existentes.
- `DataTable` y sus filtros (Fase 3). `DataTableDateRangeFilter` y `FormItemDatePicker` (rangos).
- `sidebar.tsx` y su `useIsMobile`. `CompanySwitcher` (shell).
- Los alias de `Button`/`Badge`/`Card` y los componentes viejos (`EnhancedDatePicker`, `MultiSelectCombobox`…): se
  borran en la Fase 9.
- **Tentaciones identificadas y descartadas** (van a §9 del PLAN o a su fase, no se arreglan acá):
  - Pasar las M:M que mandan el conjunto final a altas y bajas explícitas: cambia server actions (7.9).
  - Corregir el UTC de `CustomerForm.tsx:396` e `Inputs.tsx:737/803`: cambia el payload (7.8).
  - Corregir el `min` inválido de los 4 `type="month"` y los `form.setValue` sin `value` enlazado: al migrarlos con
    `FormDatePicker` el control pasa a estar enlazado; el `min` se respeta solo si el módulo lo confirma.
  - Agregar guard a los 9 AlertDialog async sin protección: se hace al migrarlos a `useConfirm` (7.1), no antes.
  - Agregar el legajo a los 4 selectores de empleados que no lo muestran cuando la query no trae `file_number` (7.5).
  - Unificar los tonos contradictorios de los mapas locales sin decisión del usuario (7.6).
  - Instalar `Field`, `InputGroup`, `Empty` o `Spinner` de shadcn "porque la skill lo dice" (7.4).
  - Borrar `action-button.tsx` y `EmptyStateWithReset` (código muerto): Fase 9, con el barrido de código muerto.

## 6. Riesgos

| Riesgo | Dónde | Cómo se cubre |
|---|---|---|
| El revestimiento de `dialog`/`sheet` desacomoda dialogs que confían en el `p-6` o en `DialogHeader` sin borde | 112 importadores de `dialog`, 9 de `sheet` | Se conserva el padding del content (`p-5`) y header/footer usan margen negativo; muestra de 8 dialogs reales (§8.2) antes de seguir con la ola 1 |
| `tabs` default pasa de pill a subrayada en toda la app | 23 archivos con `TabsList`; `TabsManagerClient.tsx:107` elige `line`/`default` por prop | es el pedido de `DISENO.md` §4.9; como `line` queda alias de `default`, los dos caminos de `TabsManager` terminan iguales. Recorrido de 5 módulos en el Checkpoint 2; tabs que no entran en mobile → scroll horizontal (`DISENO.md` §4.9), sin salto de línea |
| `ConfirmDialog` async cambia cuándo se cierra el diálogo (hoy cierra al clic) | las 44 simples, al migrarlas | decisión 7.1; el resultado final de la acción es el mismo |
| Drawer + Popover / cmdk dentro de vaul (foco atrapado, arrastre) | `SearchSelect` y `DatePicker` en un `ResponsiveDialog` mobile | drawer anidado vía contexto (§3.1); escenario dedicado en la página y prueba en teléfono real |
| Dialog abierto desde un `DropdownMenuItem` deja el body con `pointer-events: none` | `RowActions` + `useConfirm` | la acción corre en `onCloseAutoFocus` (§3.8); escenario dedicado |
| Hidratación: decidir dialog/drawer por viewport | `ResponsiveDialog`, `SearchSelect`, `DatePicker` | `useSyncExternalStore` + siempre cerrado al hidratar + modo fijado al abrir |
| El adaptador de fecha cambia el tipo o la hora del payload | `FormDatePicker` al migrar cada uso | 5 `format` explícitos que reproducen lo de hoy; escenario que imprime el JSON del payload por formato; la auditoría compara payload antes/después (H3) |
| El texto inválido de una fecha termina guardando `null` sin aviso | campos opcionales | nunca se emite una fecha inválida (7.3) |
| Contratos raros de `onChange` (`['']`, nombre en vez de id, objeto, `number`) | §2.4, contrato 1 | tabla de adaptadores de §3.4; cada uno se verifica al migrar |
| Tope de 50 opciones esconde la opción buscada | `SearchSelect` local con 650 | aviso "Mostrando 50 de N" fijo arriba de la lista + búsqueda por legajo/código |
| Clases armadas en runtime en los mapas de tono | `StatusBadge`, `Alert`, `StatCard` | `Record` con clases completas; grep `replace('(text\|bg\|border)-` y de `${` en `className` (auditoría G4) |
| Choque de nombre `StatusBadge` | `Mantenimiento/shared/components/status-badge.tsx` | decisión 7.7 |
| Botón sin `type` dentro de un form | todos los primitivos interactivos | `type="button"` explícito en cada botón interno; escenario "dentro de un `<form>`" por primitivo |
| Dos agentes editan el mismo archivo compartido | `mappers.ts`, wrappers base | ola 0 secuencial; `mappers.ts` solo lo toca el agente B |
| Página de ejemplo que termina en el PR | `src/app/dashboard/dev-primitivos/` | `.git/info/exclude` + verificación con `git status --ignored` antes del PR |

## 7. Preguntas para el usuario

Ninguna bloquea la **ola 0** (revestimiento) ni la construcción de los primitivos. Sí condicionan cómo se migran los
consumidores en las fases 6.x. Cada una trae la recomendación con la que se implementa si el usuario no dice otra cosa.

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| 7.1 | Confirmación async: ¿el diálogo espera a que termine la acción? Hoy la mayoría cierra al clic (`AlertDialogAction`) y 9 no tienen ningún guard | (a) espera con "Eliminando…", bloquea Esc y doble envío, error adentro · (b) cierra al clic como hoy | **(a)**. Es lo que pide el Checkpoint 2 ("doble envío del confirm") y ya lo hacen 10 de las 44. El resultado de la acción no cambia; cambia que el usuario ve el progreso |
| 7.2 | `useConfirm`: ¿hook local o provider global? | (a) `const [confirm, dialog] = useConfirm()` y se renderiza `{dialog}` · (b) `ConfirmProvider` en los layouts + `useConfirm()` | **(a)**. No toca `dashboard/layout.tsx` ni los layouts de los paneles de campo, y funciona en cualquier árbol |
| 7.3 | Fecha escrita inválida o fuera de rango al salir del campo | (a) vuelve al último valor válido y muestra "No se reconoció «31/02/2026»; se mantiene 10/02/2026" · (b) deja el texto en rojo y el valor en vacío (lo que hace `EnhancedDatePicker` hoy) | **(a)**. Con (b), en un campo opcional el form guarda vacío sin avisar. Con (a) ningún payload cambia de tipo y nunca se guarda algo distinto de lo que se ve |
| 7.4 | ¿Instalar `Field`, `InputGroup`, `Empty` y `Spinner` de shadcn (los sugiere la skill `shadcn-ui/shadcn`)? | (a) componer con `Form*`, `Input`, `Button` y el `Loader2` que ya se usan · (b) instalarlos | **(a)**. El repo usa `Form*` de RHF en todos lados (`forms.md`); sumar `Field` dejaría dos sistemas de campo conviviendo |
| 7.5 | Selectores de empleados sin legajo (`DailyReportWrapper:555`, `UploadDocumentMultiEmployee:206`, `SimpleDocument:252`, `ResourcesSection:109`) | (a) al migrar cada uno, sumar `file_number` al `select` de su query (solo lectura) y mostrar `[legajo] Apellido Nombre` · (b) dejarlos como están | **(a)**. Lo exige `employee-file-number.md`; es un campo más en una query de lectura y no cambia qué se guarda. Se confirma en la fase de cada módulo |
| 7.6 | Tonos del `statusToneMap` donde los mapas de hoy se contradicen | documento `pendiente`: hoy `secondary`/`destructive`/`default` · condición `en_reparacion`: hoy `yellow`/`destructive` · OT `paused`: 4 variantes · orden `in_workshop`: `info`/`default` · orden `scheduled`: `success`/`secondary` | Documento `pendiente` (sin archivo) → **neutral**, `presentado` → **info** (`DISENO.md` §4.2) · `en_reparacion` → **info** (en curso), `operativo_condicionado` → **warning** · `paused` → **warning** · `in_workshop` → **info** · `scheduled` → **info** (planificada, `DISENO.md` §4.2). Los de mantenimiento se cargan en 6.6 |
| 7.7 | Choque de nombre con `Mantenimiento/shared/components/status-badge.tsx` (`StatusBadge` local, clases crudas) | (a) el primitivo se llama `StatusBadge` y el local se migra o renombra en 6.6 · (b) el primitivo se llama distinto | **(a)**. Viven en rutas distintas y no hay conflicto de import; en 6.6 el local pasa a `DomainStatusBadge domain="repair"` y se borra |
| 7.8 | Fechas guardadas con `new Date('YYYY-MM-DD')` (UTC: puede correr un día en Argentina) en `CustomerForm.tsx:396` e `Inputs.tsx:737/803` | (a) al migrarlas, mantener el comportamiento con un formato `'iso-date-utc'` y abrir un ticket aparte · (b) migrarlas a hora local (corrige el día pero cambia el payload) | **(a)**. El rediseño no cambia payloads (`PLAN.md` §1); el bug va a `PLAN.md` §9 |
| 7.9 | M:M que hoy mandan el conjunto final (~15 forms de Configuración, Empleados, Mantenimiento) | (a) quedan igual: `SearchSelect` devuelve el mismo conjunto · (b) pasarlas a altas y bajas explícitas como `AssignmentDialog` | **(a)** en el rediseño. (b) cambia server actions y es la regla aprendida del 26/08: se propone como ticket aparte por M:M |
| 7.10 | Alcance de la Fase 2: el PLAN lista 10 primitivos; la Fase 1 dejó para acá el revestimiento de `Dialog`, `Sheet`, `Popover`, `Tabs`, `Tooltip`, `Alert`, `Calendar`, `Skeleton`, `Checkbox` e `Input`/`Select` | (a) incluirlo como ola 0 · (b) dejarlo para cada módulo | **(a)**. Son los archivos que los primitivos importan, y hacerlo una vez evita 10 agentes tocando los mismos wrappers |
| 7.11 | `RowActions`: las ~40 celdas con botón de texto ("Editar", "Ver") pasan a ícono + tooltip (1–2 visibles) y el resto a ⋯ | (a) íconos según `DISENO.md` §4.6 · (b) permitir texto visible inline | **(a)**. El nombre se conserva en `aria-label` y tooltip. Las guías del manual que digan "botón Editar" se revisan con `manual:check` en cada módulo |

## 8. Checklist de verificación funcional

### 8.1 Controles de código (pegar la salida real en la auditoría)

- [ ] `npm run check-types` en verde después de la ola 0 y de cada agente de la ola 1.
- [ ] `node scripts/ui/count-hardcoded-colors.mjs` ≤ 2711 (última fila de la bitácora); los 14 wrappers y los
      archivos nuevos en 0.
- [ ] `grep -rnE "replace\('(text|bg|border)-" src/components/ui src/shared` = 0, y ningún `className` con `${`
      armando fragmentos de clase en los archivos nuevos.
- [ ] `grep -rn "<button\|<Button" <archivos nuevos>`: todos con `type` explícito (salvo `asChild` de triggers Radix).
- [ ] `grep -rnE "rounded-(sm|md|lg|xl)|shadow-(sm|md|lg|xl)\b" <archivos tocados>` = 0 (solo `rounded-full` en punto
      de estado; sombra solo `shadow-(--shadow-overlay)`).
- [ ] `grep -rn "Close\b\|Cancel\b\|Are you sure" src/components/ui` = 0 en textos visibles o `sr-only`.
- [ ] `grep -rn "useEffect" <archivos nuevos>`: solo el debounce de `use-debounced-value.ts`.
- [ ] `grep -rn "date-fns" <archivos nuevos>` = 0 (el `es` de `calendar.tsx` ya existía).
- [ ] `grep -rnE "console\.|: any\b|as any" <archivos nuevos>` = 0.
- [ ] `git status --ignored` muestra `src/app/dashboard/dev-primitivos/` como ignorada, nunca como untracked.
- [ ] `npm test` en verde (los existentes; no se escriben tests nuevos hasta el OK del usuario).
- [ ] `npm run manual:check` en verde.

### 8.2 Revestimiento (ola 0): dialogs reales en su pantalla, 1440 y 375, claro y oscuro

| Dialog real | Qué mirar | Antes | Después |
|---|---|---|---|
| `Empresa/Usuarios/components/EditUserNameDialog.tsx:88` (`sm:max-w-md`, form) | padding, header/footer con hairline, X "Cerrar" | [ ] | [ ] |
| `UserPermissionsManager/components/RoleManager.tsx:521` (`max-w-4xl`, tabla) | scroll interno, footer | [ ] | [ ] |
| `Operaciones/Preparte/components/PreparteDetailModal.tsx:155` (`max-w-2xl`, detalle) | contenido largo | [ ] | [ ] |
| `Mantenimiento/OrderManagement/components/ManageOrderWizard.tsx:734` (`max-w-3xl`, wizard) | pasos, botones | [ ] | [ ] |
| `Clothing/pdf/DeliveryReceiptButton.tsx:132` (`max-w-5xl`, visor PDF) | alto, overlay | [ ] | [ ] |
| `shared/components/modal/DependencyValidationModal.tsx:141` (`max-w-4xl max-h-[80vh]`) | tabla + select dentro | [ ] | [ ] |
| `Empresa/General/FiscalData/components/SalesPointsSection.tsx:196` (AlertDialog) | 400px, foco, botones apilados en mobile | [ ] | [ ] |
| `OperatorPanel/components/CloseWorkOrderDialog.tsx:119` (ResponsiveDialog, drawer en 375) | drawer `92dvh`, safe area, footer | [ ] | [ ] |
| Un `Sheet` de Operaciones y el `Drawer` de `Formularios/components/forms/FormCard.tsx` | padding no duplicado, slide | [ ] | [ ] |
| Tabs: `TabsManager` en Empleados y una `TabsList` suelta | subrayado de 2px, scroll a 375 | [ ] | [ ] |
| Popover, menú y tooltip (filtro de una DataTable, ⋯ de `EmployeeList/columns.tsx:901`) | sin rounded ni zoom, `--shadow-overlay` | [ ] | [ ] |

### 8.3 Consumidores por módulo (para los planes de las fases 6.x)

Cantidades de §2. Cada plan de módulo copia su fila y la tilda al migrar.

| Fase | ResponsiveDialog | ConfirmDialog | DatePicker | SearchSelect | StatusBadge | StatCard | EmptyState | RowActions / Panel / SimpleTable |
|---|---|---|---|---|---|---|---|---|
| **3** DataTable | filtros mobile, detalle de fila | — | — | — | — | — | `emptyMessage` de ~146 tablas → variantes `empty`/`filtered` | `RowActions layout="menu"` en tarjetas; `Panel` contenedor |
| **5** Tablas | — | — | toolbars viejas (4 `DataTableDatePicker`) | faceted viejos (fuera) | — | — | `EmptyStateWithReset` | SimpleTable para catálogos acotados de `crecimiento.md:118-119,186-194` |
| **6.1** Configuración (`Empresa/*`, `UserPermissionsManager`) | 14 + 2 dialogs; `EditModal`; `DependencyValidationModal` (6 consumidores); I/M/F: `FiscalEnvironmentSection:173`, `UserStatusCell:161/183/228`, `ModulePermissions:569`, `CCT/Add*Modal` ×3, `AddCompanyDocumentForm:125` | 11 simples (§2.2) | `PriceRevisionsDialog:222`, `ServicesForm:266` ×2, `CustomerForm:392` (7.8), `IssuerFiscalForm:198`, `AddCompanyDocumentForm:198/219` | 13 `MultiSelectCombobox` (`AreaFormDialog` ×2, `AssignmentDialog`, `ServicesForm` ×2, `EquipmentSubTypeForm` ×2, `EquipmentTypeForm` ×2, `AptitudesForm`, `PositionsFormNew` ×2, `WorkDiagramForm`) + `Select` grandes `ServicesForm:180`, `ContactComponent:180` | `activity` (~20 `columns.tsx`), `equipmentByOwnerColumns:36/52`, fiscal (`environment-styles`, `SalesPointsSection:30`, `ArcaCertificateSection:298`, `FiscalReadinessSummary:21`, `CertificateWizardStep:12`), `ACTION_COLORS` | — | 11 vacíos a mano | ~25 columnas de acciones (texto); Card 28/49; SimpleTable `CustomerComponent:42`, `contractDocuments:310`, `ServiceItemsSection:133`, `SalesPointsSection:102` |
| **6.2** Empleados + Selección | 1 + 2 dialogs (Selección); I `employee-quick-actions:126` | 2 (`employee-quick-actions:151`, `PermanentDocumentsDownloadButton:100`) | `DiagramFormUpdated:466/483`, `DiagramDetailTable:237`, `TerminationFormFields:82`, `PersonalDataFields:193`, `employee-work-data-form:364`, `PreEmployeeDocumentChecklist:271` | 17 `MultiSelectCombobox` (`EmployeeFilterPanel` ×6, `EmployeesDiagramWrapper` ×8, `DiagramEmployeeView`, `DiagramFormUpdated` ×2) + `employee-work-data-form:526` + `ContactDataFields:107/169` | recurso (`Employees/.../columns.tsx:377`), selección (`state-machine.ts:123`) | cifras de `DiagramMassiveForm`, `DiagramMassiveResults`, `ConflictResolutionModal` | 8 + 2 | `EmployeeList/columns.tsx:901` (único ⋯ de hoy); Card 24/31; SimpleTable de resultados de diagramas (tope visible) |
| **6.3** Equipos (+ Otros equipos, bajas, cubiertas) | 2 + 1 sheet; I `vehicle-quick-actions:125`, `OtherEquipmentQuickActions:117`, `DisplacedTiresDialog:91` | 6 | `vehicle-basic-data-form:768/813/883`, `vehicle-quick-actions:183`, `OtherEquipmentQuickActions:171`, `OtherEquipmentCertifications:229`, `OtherEquipmentBasicDataForm:525/650/676/748` | 13 comboboxes a mano (`vehicle-basic-data-form` ×7, `OtherEquipmentBasicDataForm` ×7) | condición (6 mapas de `Equipos/*/columns.tsx`), OT/orden (`equipment-order-detail-dialog`, `vehicle-operations-history`) | — | 7 | links "Ver" y mixtos; Card 26/35 |
| **6.4** Documentación | 5 dialogs; F ×5 (`columns.tsx` ×4, `NewDocumentMulti:42`); M `_ToggleDocTypeDialog:300` | 5 (4 ZIP + `_VerifyDocumentsDialog:248`) | `UploadDocumentMulti*` (validity `iso-datetime` + period `month`), `UpdateDocuments:131/153`, `ReplaceDocument:147/224`, `SimpleDocument:403/420` | `UploadDocumentMulti*` ×2 (7.5) + 4 combos a mano (`SimpleDocument:252/339`, tipo de doc ×2) + `_MultiSelectField` ×2 | documento (9 mapas) | — | 2 | `ActionsCell` ×4; SimpleTable `_VerifyDocumentsDialog:285/328`; `dl` del detalle con `Section` |
| **6.5** Operaciones (partes, preparte, certificación) | 18 dialogs + 3 sheets | 4 + `confirm()` de `DocumentViewer.tsx:15` | Preparte (`CustomerContractSection:132/287`, `ItemsSection:357`, `PreparteReportModal:508/521`, `PreparteBulkStatusModal:202`, `list/columns:271`), PD (`DailyReportForm:104`, `BulkEditModal:460`, `ScheduleSection:131`), `DateTimeSection:57` | Preparte 6 `MultiSelectCombobox` + Certificación 8 + PD 13 a mano (`EmployeeCommandList` ×5) | parte diario, preparte (`StatusCardsServerContainer:6`), `EnhancedComercialReportTable:67/388` | tira de estados de Preparte (7, clickeable) | 30 | `row-actions-cell.tsx`; `RemitosManagerModal` cifras; `LinkRemitoDialog:104` (aviso dentro del scroll) |
| **6.6** Mantenimiento (+ Gomería) | 38 dialogs + 1 sheet; I: `OrderDetailDialog:855/882/910/937`, `RechazarOperacionDialog:50`, `Step1Tasks:359`, `RechazarPedidoDialog:62` | 12 | `AsignarTallerDialog:493/520`, `AsignarBulkDialog:408/429`, `PlanificarPedidoDialog:172`, `Step4Confirm:161/165`, `GenerateWorkOrderDialog:149/153` | `MaintenanceGroupForm:182` + 6 `SearchableSelect` + ~12 a mano (`NuevoPedidoForm`, `StepEquipmentSelector`, `StepSupervisor`, `ManualRepairsInput`, `TemplateAssignDialog`, `AnonymousLogin`) | orden, solicitud, OT, tarea, sector, prioridad, gomería (~35 mapas); `status-badge.tsx` local (7.7) | `EquipmentFleetClient` (Dashboard) no; `CloseWorkOrderDialog` (Fase 7) | 41 | ~24 columnas con íconos inline; Card 61/86; SimpleTable `ServiceOrderDetailView:134` |
| **6.7** Comercial y Facturación | 3 dialogs; M `IssueInvoiceDialog:122` | 3 | `InvoiceHeaderFields:95/155/172/189` (`iso-date`), `CertificacionesPanel:322/335`, `ReglasPrecioPanel:180`, `DailyReportWrapper:591/601` | `DailyReportWrapper` ×9, `CertificationsInvoiceForm:156`, `ManualInvoiceForm:89` + `Select` `CertificacionesPanel:274`, `PriceRuleFormDialog:252` | factura/certificación (`InvoiceStatusBadge`, `CertificationStatusBadge`) | — | 8 | Card anidada `DailyReportWrapper:461/661`; SimpleTable `ReglasPrecioPanel:87`, `InvoiceDetail:268`, `CertificacionesPanel:395` |
| **6.8** Formularios y Checklists | 4 + 5 dialogs, `FormCard` drawer | — | `ChecklistItemField:281`, `ChecklistGeneralInfoSection:432`, `Inputs.tsx:418/736/802` (7.8) | `ChecklistGeneralInfoSection:281` (nombre + id), `HitchEquipmentDialog:59`; `Select` grandes `ChecklistGeneralInfoSection:93/237`, `Inputs.tsx:~555` | checklist (`ChecklistAnswers/columns.tsx:27`) | — | 1 | Card anidada `FormCard.tsx:23→31` |
| **6.9** Dashboard | 7 dialogs | — | `ServicesDetailDialog:120`, `KpiForm:208`, `KpiEditNumberForm:108`, `HeadcountTrendChart:116`, `AbsenteeismTrendChart:104` (`month-date`), `MaintenanceByTypeCard:156` (mes) | 7 filtros (`CategorySection`, `MaintenanceByTypeCard`, `OperacionesChartsClient` ×2, `DesviosChartsClient`, `OrderManagementClient`, `CookieFilter`) + `employee-gender-position-chart:81` | documento (`Dashboard/Documentacion/*/columns.tsx`) | `KpiCardsRow` (6), `SummaryCards`/`CardInfo` (6), `IndicatorStats` (3), `EquipmentFleetClient` (~12) | 23 | Card 51/72; SimpleTable `ServicesSection:110`, `ServicesDetailDialog:190` |
| **6.10** Ayuda | 1 dialog + 2 sheets; `TicketCloseProposalDialog:229` (`<dialog>` nativo) | `Ayuda/components/ConfirmDialog.tsx` → `TicketApprovalBanner` | — | — | tickets (`ticket-status.ts`, `ticket-priority.ts`) | — | 5 (`EmptyTicketsState` es el precedente) | SimpleTable de las tablas MDX |
| **7** Paneles de campo | `OperatorPanel` (3 `ResponsiveDialog` actuales, `AddTaskDialog` sin footer: ver §3.1) | — | — | `RepairTypeCombobox` ×2, `OperatorHeader:92` | OT (`WorkOrderCard`, `WorkOrderHeader`, `TaskCard`) | `CloseWorkOrderDialog:127` | 5 | Clothing (3 columnas de acciones con íconos) |

### 8.4 Checkpoint 2 (`PLAN.md` §4): cada primitivo en la página de ejemplo

| Primitivo | Desktop 1440 | Mobile 375 | Teclado | Foco | Casos límite de §4.8 | Claro/oscuro |
|---|---|---|---|---|---|---|
| `ResponsiveDialog` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `ConfirmDialog` / `useConfirm` | [ ] | [ ] | [ ] | [ ] | [ ] doble envío | [ ] |
| `DatePicker` / `FormDatePicker` | [ ] | [ ] | [ ] | [ ] | [ ] fecha inválida · payload por formato | [ ] |
| `SearchSelect` | [ ] | [ ] | [ ] | [ ] | [ ] 400+ opciones · async · error | [ ] |
| `StatusBadge` | [ ] | [ ] | — | — | [ ] | [ ] |
| `StatCard` / `KpiStrip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `EmptyState` | [ ] | [ ] | — | — | [ ] | [ ] |
| `RowActions` | [ ] | [ ] | [ ] | [ ] | [ ] dentro de un form | [ ] |
| `Panel` / `Section` | [ ] | [ ] | — | — | [ ] | [ ] |
| `SimpleTable` | [ ] | [ ] | — | — | [ ] 201 filas · stack/scroll | [ ] |
| Teléfono real (drawer, `DatePicker`, `SearchSelect`: teclado, zoom, safe area) | — | [ ] | — | — | — | — |

Mediciones DOM a pegar (`AUDITORIA-UI.md` A6, C2, C3): alto de trigger de `DatePicker`/`SearchSelect` (32px fine,
44px coarse), ítem de lista (32/44), ⋯ de `RowActions` (32/44), `document.documentElement.scrollWidth <= innerWidth`
en la página a 375px.

## 9. Auditorías

(Se agregan acá los informes, ver §3 de `AUDITORIA-UI.md`.)

## Anexo — Crecimiento de datos (D7)

Los primitivos no tienen datos propios, pero dos de ellos son la herramienta con la que se cumple D7 en las fases
siguientes, y uno está prohibido para lo que crece:

| Primitivo | Clasificación | Regla |
|---|---|---|
| `SearchSelect` | **herramienta D7** para selectores de catálogos que crecen | Modo async con `search` (server action con `take` y `where` por texto) + `selectedOptions`. Es el destino de los 14 selectores "carga todo" de `crecimiento.md` §4 (empleados, equipos, clientes con árbol, cubiertas). El modo local con tope de 50 **no** es paginación: solo sirve para catálogos acotados o ya cargados por otra razón. La migración de cada uno la decide su módulo |
| `SimpleTable` | **solo acotado** | Prohibido para lo que crece (`AUDITORIA-UI.md` anexo). Guardia `logger.warn` en desarrollo con más de 200 filas. Las tablas de §2.10 marcadas "crece" van a DataTable paginado (Fase 5) o a "ver más" |
| `ResponsiveDialog` | contenedor | Las listas que crecen **dentro** de un dialog (historiales, comentarios) usan carga incremental o DataTable; el dialog no pagina |
| `EmptyState` | — | Se redacta para la condición real que deja la lista vacía (regla aprendida del 578); `filtered` distinto de `empty` |
| `StatCard` | — | `null` → "—"; las cifras salen de agregaciones en SQL (`_count`, `groupBy`), nunca contando arrays traídos al cliente (`crecimiento.md`: "facetas que cuentan en JS") |
| `ConfirmDialog`, `DatePicker`, `StatusBadge`, `RowActions`, `Panel` | no aplica | sin colecciones |

Auditoría D7 de esta fase: verificar que `SearchSelect` async no filtre en el cliente lo que trae el servidor, que
aborte la request anterior y que nunca pida el catálogo entero (`enabled: open`, `minChars`, `take` en la action de
ejemplo).

<!-- estado: completo -->
