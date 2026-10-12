# Inventario — Almacenes (ficha ANTES)

> Fase 0 del rediseño (`docs/rediseno-ui/PLAN.md`), módulo 6.11. Lo que la UI hace HOY y debe seguir haciendo.
> Se tilda `[x]` en la verificación "después". Relevado del código el 2026-10-08 (rama `feat/rediseno-ui`, tras
> mergear `origin/main` con los PR #5, #6 y #7). Rutas relativas a `src/features/Warehouses/` salvo que digan `src/`.

**Página:** `src/app/dashboard/warehouse/page.tsx` (metadata "Almacenes | <empresa>") → `WarehousesComponent.tsx`
(`getUserPermissionsMapServer()` + `SectionManagerServer`, `paramName="tab"`, default `stock`). Cada sección está
gateada por `view` de `almacenes:<tabSlug>` (el `SectionManagerServer` la oculta) y **además** cada `<X>TabContent`
repite el chequeo y muestra `fallback/NoPermission.tsx` ("No tenés permiso para ver esta información."). Las
secciones se eligen desde el sidebar (`Layout/sidebar/constants/navigation.ts`, mismos iconos que las tabs).
Cada tab va en `<Suspense fallback={<WarehouseSectionSkeleton />}>` (Configuración: `SettingsSkeleton`).

| Sección (`?tab=`) | Label + icono | Contenido | Permisos (`permissions-map.ts` → `almacenes`) |
|---|---|---|---|
| `stock` | Stock (Layers) | 2 avisos + tabla de saldos | `view`, `view_prices` |
| `movimientos` | Movimientos (ArrowLeftRight) | Tabla + "Nuevo movimiento" | `view`, `create`, `adjust`, `reverse`, `view_prices`, `direct_exit` |
| `prestamos` | Préstamos (HandHelping) | Tabla de herramientas prestadas | `view`, `create` (devolver), `delete` (baja) |
| `pedidos` | Pedidos (ClipboardList) | Tabla + "Nuevo pedido" | `view` (propios), `view_all_requests`, `create`, `approve`, `update` (entregar/cerrar) |
| `materiales` | Materiales (Package) | Tabla + "Nuevo material" | `view`, `create`, `update`, `delete` |
| `depositos` | Depósitos (Warehouse) | Tabla + "Nuevo depósito" | `view`, `create`, `update`, `delete` |
| `config-almacen` | Configuración (Settings) | Catálogos, salida directa, inventario de cubiertas | `view`, `create`, `update`, `delete` |

Rutas de detalle (sin tabs, `max-w-5xl`/`max-w-6xl` centrado, botón "←" que vuelve a la sección):

| Ruta | Permiso de entrada | Componente |
|---|---|---|
| `/dashboard/warehouse/materials/[id]` | `stock:view` (si no: `notFound()`), id uuid | `Materials/components/MaterialHeader` + `MaterialKardex` |
| `/dashboard/warehouse/movements/new` | `movimientos:create` **o** `adjust` | `Movements/components/NewMovementForm` |
| `/dashboard/warehouse/movements/[id]` | `movimientos:view` (dentro de `getStockMovementDetail`) | `Movements/components/MovementDetail` |
| `/dashboard/warehouse/requests/new` | `pedidos:create` | `Requests/components/NewRequestForm` |
| `/dashboard/warehouse/requests/[id]` | `pedidos:view` + propio o `view_all_requests` (en `getMaterialRequestDetail`) | `Requests/components/RequestDetail` |
| `/dashboard/warehouse/requests/[id]/deliver` | `request.can.deliver` (permiso `update` + estado) | `Requests/components/DeliverRequestForm` |

Convenciones comunes del módulo:
- Todas las tablas son **DataTable nuevo** (`@/shared/components/common/DataTable`): `TABLE_ID` + `stripPrefixFromSearchParams`,
  `paramNamespace`, `tableId`, preferencias en BD, client-side (`queryFn` + `queryKey` de `lib/query-keys.ts`),
  facetas lazy (`fetchFacet`), `exportConfig` con `currentParams`, `showFilterToggle`, Card + CardContent pt-6,
  skeleton propio en `fallback/`. Ninguna tiene selección ni acciones masivas.
- Formato de números: `lib/format.ts` (`formatQuantity` hasta 4 decimales, `formatMoney` ARS 2 decimales,
  `formatUnitCost` hasta 4). Columnas `@db.Date` se formatean con `moment.utc` para no correr un día.
- Labels únicos en `lib/labels.ts` (tipos de movimiento, destinos, estados de pedido, control, motivos de baja,
  `employeeLabel` = `[legajo] Apellido Nombre`, `vehicleLabel`, `otherEquipmentLabel`, `contractLabel`).
- Costos: sin `view_prices` los importes **no salen del servidor** (no solo se ocultan) y las columnas/filtros de
  costo no se agregan.
- Errores de las actions: se **devuelven** como `ActionResult` (`lib/action-errors.ts`): mensaje de negocio del motor
  ("hay 12 l, se pidieron 20 l"), "Ya existe…" para unicidad, o genérico "No se pudo X. Intentá de nuevo; si
  persiste, avisá a soporte." El cliente los convierte en excepción con `lib/unwrap-action.ts` → `toast.error`.
- Tras mutar se invalidan las `WAREHOUSE_QUERY_KEYS` que correspondan (y `router.refresh()` donde hay SSR).

## Stock — `/dashboard/warehouse?tab=stock`

- [ ] Raíz: `Stock/StockTabContent.tsx` → dos avisos en `Suspense fallback={null}` (no ocupan lugar si no hay nada) + `Stock/components/StockList/StockList.tsx` (Card) → `components/_StockDataTable.tsx`, columnas `StockList/columns.tsx`, `TABLE_ID='warehouse-stock'`.
- [ ] **Aviso de lotes** `Stock/components/BatchExpiryAlert.tsx` (Alert rojo, icono CalendarX2): solo si hay lotes con saldo vencidos o que vencen en 30 días (`EXPIRING_WINDOW_DAYS`). Título "N lotes vencidos · M lotes vencen en los próximos 30 días" (singular/plural). Lista en 2 columnas de hasta 8: link "<material> · lote <n> · <depósito>" → ficha del material, "<cant> <unidad> · venció/vence DD/MM/YYYY". "y N más (filtrá la tabla por vencimiento)." Si hay vencidos: "Los lotes vencidos no pueden salir ni transferirse: se dan de baja con un ajuste." Misma fuente que el mail semanal (`lib/expiring-batches.ts`).
- [ ] **Aviso de mínimo** `Stock/components/BelowMinimumAlert.tsx` (Alert ámbar, AlertTriangle): materiales **activos** con stock total < `min_stock`, **incluidos los agotados** (que no aparecen en la tabla). Título "N materiales por debajo del mínimo"; hasta 8 links "<material>" con "<total> / <mínimo> <unidad>", ordenados por proporción total/mínimo; "y N más (filtrá la tabla por "Bajo mínimo")."
- [ ] Tabla: solo saldos con `quantity > 0`. Columnas: Código (mono) · Material (link azul a `/dashboard/warehouse/materials/<id>`) · Categoría (oculta por defecto) · Depósito · Lote · Vencimiento · Cantidad · Unidad · Bajo mínimo (badge Sí destructive / No outline con iconos AlertTriangle/CheckCircle2) · con `stock:view_prices`: Costo promedio · Valorizado.
- [ ] No ordenables: Bajo mínimo y Valorizado (calculados). Orden por defecto: material asc, depósito asc.
- [ ] "Bajo mínimo" compara el **stock total del material en la empresa** (todos los depósitos) contra `min_stock`, no el saldo de la fila.
- [ ] Filtros (lazy): Depósito, Categoría ("Sin asignar"), Bajo mínimo (Sí/No con iconos), Unidad, Lote ("Sin asignar") (faceted); Código, Material (text); Vencimiento (dateRange); Cantidad (text, **valor exacto**); con precios: Costo promedio (text, valor exacto). Visibles por defecto: Depósito, Categoría, Bajo mínimo.
- [ ] Búsqueda: "Buscar por código, material o lote". Vacío: "No hay stock cargado".
- [ ] Export: `stock`, título "Stock por depósito", hoja "Stock"; formatters Vencimiento `DD/MM/YYYY` (UTC), Bajo mínimo Sí/No; respeta filtros.
- [ ] Sin acciones por fila ni botones: la tabla es de consulta (la acción es el link al material).

## Detalle del material (kardex) — `/dashboard/warehouse/materials/[id]`

- [ ] Raíz: `src/app/dashboard/warehouse/materials/[id]/page.tsx` (metadata "Material | Almacenes"; `notFound()` si el id no es uuid, sin `stock:view` o si el material no es de la empresa) → botón ghost "← Stock" (vuelve a `?tab=stock`) → dos bloques con `Suspense` propio: `Materials/components/MaterialHeader.tsx` (fallback `MaterialHeaderSkeleton`) y `MaterialKardex.tsx` (fallback `MaterialKardexSkeleton`), ambos en `Materials/fallback/MaterialDetailSkeletons.tsx`.
- [ ] Cabecera: código (mono, muted) + nombre (h1) + badge del tipo de control + "Inactivo" (outline) + "Requiere aprobación" (outline).
- [ ] Tarjetas KPI (grilla 1/2/4): **Stock total** (suma de todos los depósitos + unidad; si está bajo el mínimo: "Por debajo del mínimo (N <unidad>)" ámbar con AlertTriangle) · con `stock:view_prices`: **Costo promedio** y **Valorizado** · tarjeta de datos: Categoría ("Sin categoría"), Unidad, Mínimo ("Sin definir"). Descripción debajo (si tiene).
- [ ] Card "Stock por depósito" (`<Table>` manual): Depósito · (por lote) Lote · Vencimiento · Cantidad. Vacío: "Sin stock en ningún depósito.". Serializados: lista "Unidades en depósito" (serie mono · depósito).
- [ ] Card "Préstamos" (solo serializados, solo con `prestamos:view` y si hay datos): "Unidades prestadas (N)" — Serie · En poder de · Desde "DD/MM/YYYY (N días)" · Salida (link al movimiento); "Dadas de baja (N)" — Serie · Motivo (Extraviada/Rota + notas) · La tenía · Fecha.
- [ ] **Kardex** (Card "Kardex", `<Table>` manual a propósito, **sin orden ni filtros ni paginación**): "Todos los movimientos del material en el orden en que se registraron, con el saldo de la empresa y el costo promedio después de cada uno." Columnas: Fecha · Movimiento (link mono + tipo + "(anulación)") · Depósito · Destino / lote / serie · Entrada (las transferencias se muestran en gris con "⇄") · Salida · Saldo (+unidad) · con precios: Costo unit. · Promedio. Vacío: "El material todavía no tiene movimientos.". Scroll horizontal propio.
- [ ] Saldo y promedio se recalculan en el servidor recorriendo **todas** las líneas del material (`lib/kardex.ts` `replayKardex`).

## Movimientos — `/dashboard/warehouse?tab=movimientos`

- [ ] Raíz: `Movements/MovementsTabContent.tsx` → botón "Nuevo movimiento" (variant `brand`, size sm, Plus; link a `/dashboard/warehouse/movements/new`) visible con `movimientos:create` **o** `movimientos:adjust` → `MovementsList.tsx` (Card) → `components/_MovementsDataTable.tsx`, columnas `MovementsList/columns.tsx`, `TABLE_ID='warehouse-movements'`.
- [ ] Columnas: Número (mono, link azul al detalle) · Tipo (badge outline + icono: Entrada ArrowDownToLine, Salida ArrowUpFromLine, Transferencia ArrowLeftRight, Ajuste SlidersHorizontal, Devolución RotateCcw) · Fecha (`occurred_on`, UTC) · Depósito · Depósito destino* · Tipo de destino (badge + icono: Empleado User, Vehículo Truck, Equipo Wrench, Orden de mantenimiento ClipboardList, Cliente Building2) · Destino (`destinationLabel`: empleado con `[legajo]`, vehículo "Int. X · dominio", etc.) · Referencia · Notas* · Estado (Vigente default+CheckCircle2 / Anulado destructive+Ban / Anulación secondary+Undo2) · Creado por · Fecha de carga* (`DD/MM/YYYY HH:mm`) · con `movimientos:view_prices`: Total. (*ocultas por defecto).
- [ ] No ordenables: Destino y Estado (calculados). Orden por defecto: `created_at desc`, `id desc`.
- [ ] Filtros: Tipo (faceted con iconos, incluye Devolución), Fecha (dateRange), Estado (faceted; con los 3 tildados no filtra), Depósito, Depósito destino ("Sin asignar"), Tipo de destino ("Sin asignar"), Creado por (icono User) (faceted); Número, Destino ("Legajo, apellido, dominio, interno, orden o cliente..." — busca en la relación que corresponda), Referencia, Notas (text); Fecha de carga (dateRange); con precios: Total (text, valor exacto). Visibles por defecto: Tipo, Fecha, Estado.
- [ ] Búsqueda: "Buscar por número o referencia". Vacío: "No hay movimientos registrados".
- [ ] Export: `movimientos`, título "Movimientos de stock", hoja "Movimientos"; formatters de tipo, fecha, tipo de destino, estado, fecha de carga; nulos → vacío.
- [ ] Sin columna de acciones: el detalle se abre desde el número.
- [ ] Los movimientos generados por otros módulos (entregas de ropa, montaje/desmontaje de cubiertas, entregas de pedidos, devoluciones de préstamos) aparecen en esta misma tabla.

## Detalle del movimiento — `/dashboard/warehouse/movements/[id]`

- [ ] Raíz: `src/app/dashboard/warehouse/movements/[id]/page.tsx` (`cache(getStockMovementDetail)` para página + título "<número> | Almacenes"; `notFound()` si no existe, si el id no es uuid o sin `movimientos:view`) → botón ghost "← Movimientos" → `Movements/components/MovementDetail.tsx`.
- [ ] Cabecera: número (h1 mono) + badge del tipo + badge "Anulación" (outline) si anula a otro + badge "Anulado" (destructive) si fue anulado; a la derecha botón **"Anular"** (outline rojo, Undo2) solo si `canReverse` (permiso `movimientos:reverse` y el movimiento no es una anulación ni está anulado).
- [ ] Avisos de origen (recuadro `bg-muted/40`), según corresponda: "Entrega de ropa a <empleado> (entrega anulada). Se registró desde el panel de Ropa, con la firma del empleado." · "Cubierta montada/desmontada en la orden de gomería del DD/MM/YYYY · <dominio>, posición N (orden abierta). Se corrige desde Gomería: cancelando la orden si sigue abierta." · "Entrega del pedido <link>" / "Anula una entrega del pedido <link>" · "Devuelve el préstamo de <link a la salida>: las unidades vuelven al depósito al costo con que salieron." · "Anula a <link>. Las cantidades de abajo tienen el efecto inverso al original." / "Anulado por <link>: su efecto sobre el stock ya está revertido."
- [ ] Card de datos (`dl` 1/2/4 columnas): Fecha · Depósito (o "Origen → destino" en transferencias) · "Imputado a (<tipo>)" si tiene destino · Referencia · Registrado por "<usuario> · DD/MM/YYYY HH:mm" · Total (solo con `view_prices`) · Motivo (ajuste o anulación) / Observaciones a todo el ancho, con saltos de línea.
- [ ] Card "N líneas" con `<Table>` manual: Material (link al kardex, código mono + nombre) · Lote / serie (serie, o "lote · vence DD/MM/YYYY", o "—") · Cantidad con signo **+/−** según el efecto sobre el depósito del movimiento + unidad · con precios: Costo unitario · Total.
- [ ] **ReverseMovementDialog** (`Movements/components/ReverseMovementDialog.tsx`, AlertDialog "¿Anular <número>?"): "Se registra un movimiento inverso al mismo costo, y el original queda marcado como anulado. No se puede deshacer."; Textarea "Motivo" (placeholder "Ej.: se cargó en el depósito equivocado"), obligatorio (botón deshabilitado vacío). Botones "Cancelar" / "Anular movimiento" (rojo, "Anulando…"). Al cerrar se borra el motivo.
- [ ] Éxito: toast "<número> anulado por <número anulación> (<total>)", invalida movimientos, stock, disponibilidad y pedidos, y **navega al movimiento de anulación**.
- [ ] Rechazos del servidor (toast con el mensaje): stock insuficiente para revertir ("No se puede anular X: de <material> en <depósito> hay N y la anulación necesita M"), unidad serializada que se movió después o fue dada de baja, "Una anulación no se puede anular", "ya fue anulado por…", y "Los movimientos de cubiertas no se anulan desde Almacenes: se corrigen desde Gomería".

## Nuevo movimiento — `/dashboard/warehouse/movements/new`

- [ ] Raíz: `src/app/dashboard/warehouse/movements/new/page.tsx` (metadata "Nuevo movimiento | Almacenes"; `notFound()` sin `create` ni `adjust`) → header con botón icono "Volver a movimientos" + h1 "Nuevo movimiento" → `Movements/components/NewMovementForm.tsx` (RHF + zod `schemas/stock-movement.ts`).
- [ ] Tipos permitidos: con `create` → Entrada, Salida, Transferencia; con `adjust` → Ajuste. El primero permitido viene elegido.
- [ ] Sin depósitos activos: Card "No hay depósitos activos. Creá uno en Almacenes → Depósitos antes de registrar movimientos." (no se muestra el form).
- [ ] Card "Movimiento" con descripción según el tipo (`TYPE_HELP`): Tipo (`ToggleGroup` outline; no se puede des-seleccionar) · "Depósito" / "Depósito origen" (Select "<nombre> (<código>)"; preelegido si hay uno solo) · "Depósito destino" (solo transferencia; excluye el origen) · Fecha (`EnhancedDatePicker` "DD/MM/AAAA", default hoy) · Referencia ("Remito, factura… (opcional)", máx. 120) · "Motivo del ajuste" (obligatorio en ajuste, placeholder "Ej.: conteo físico del 30/09, 2 bidones rotos") / "Observaciones" (opcional), máx. 1000.
- [ ] **Salida sin `direct_exit`**: Alert "No tenés permiso de salida directa: las salidas van por pedido de materiales, que aprueba un responsable." + link "Hacer un pedido" (si tiene `pedidos:create`); no se muestran los campos de destino y el submit queda deshabilitado.
- [ ] Salida con permiso: separador + `DestinationFields` (ver componente compartido abajo).
- [ ] Card "Materiales" con contador "N líneas" y botón "Agregar línea" (outline, Plus). Por línea (`Movements/components/MovementLineRow.tsx`, recuadro con número de línea):
  - Material: `SearchCombobox` "Elegí un material" / "Buscar por código o nombre" (busca en el servidor, tope 30, aviso "Mostrando 30 de N materiales. Escribí para acotar."; los inactivos llevan badge "Inactivo"). Cambiar el material limpia lote, vencimiento, series y unidades.
  - Ajuste: Select de sentido "Resta (faltante, rotura)" (default) / "Suma (sobrante)"; cambiarlo limpia unidades, series y lote.
  - Cantidad (input decimal + abreviatura de unidad) salvo serializados, donde muestra "N unidades".
  - Botón papelera "Quitar línea N" (deshabilitado si es la única).
  - Con material elegido: línea de ayuda "Por cantidad / Por número de serie / Por lote" + disponible en vivo (`aria-live`): "Elegí el depósito para ver el disponible" / "Consultando disponible…" / "Disponible en el depósito: N <unidad>".
  - Entrada: "Costo unitario" ("0,00", obligatorio, hasta 4 decimales).
  - Lote que entra: "Lote" (número) + "Vencimiento" (`EnhancedDatePicker`, opcional). Lote que sale: Select de lotes con saldo en orden **FEFO** ("<lote> · N <unidad> · vence DD/MM/YYYY · vence primero"); los vencidos se ven "· Vencido" y **deshabilitados salvo en ajuste**; sin lotes: "Sin lotes con stock en el depósito".
  - Series que entran: Textarea "Uno por línea (o separados por coma)". Unidades que salen: grilla de checkboxes con las series en stock (`StockPickers.tsx` `UnitPicker`, scroll a 12rem); vacío "No hay unidades de este material en el depósito." / "Elegí el depósito.".
- [ ] Validaciones (zod `superRefine`): depósito, destino ≠ origen, fecha, destino de salida obligatorio, motivo del ajuste, al menos una línea, material, cantidad > 0 con hasta 4 decimales, costo de entrada, lote, al menos una serie / unidad, series repetidas ("Series repetidas: …").
- [ ] Rechazos del servidor (toast, el form **no** se resetea): sin permiso, "<material> requiere aprobación: hacé un pedido de materiales.", salida que supera el **monto máximo de salida directa** (con montos si ve precios), "Las cubiertas se montan y se dan de baja desde Gomería" (salidas/ajustes que restan cubiertas), stock insuficiente, lote vencido, depósito/material inactivo, serie duplicada.
- [ ] Botones: "Cancelar" (`router.back()`) / "Registrar <tipo>" ("Registrando…"). Éxito: toast "<número> registrado: N líneas, <total>" (total solo con precios), invalida movimientos, stock y disponibilidad y **navega al detalle** del movimiento.
- [ ] Una entrada o ajuste que suma cubiertas (materiales de Gomería) las vincula al catálogo de cubiertas (`linkTiresFromEntry`).

### Componente compartido: `DestinationFields` (`Movements/components/DestinationFields.tsx`)

Usado por Nuevo movimiento (salida) y Nuevo pedido.
- [ ] "Se imputa a" (Select: Empleado, Vehículo, Equipo, Orden de mantenimiento, Cliente; error "Elegí a quién se imputa la salida").
- [ ] Empleado / Vehículo / Equipo / Orden: `SearchCombobox` en el servidor (tope 30) — "Buscar por legajo o nombre" (label `[legajo] Apellido Nombre`), "Buscar por interno, dominio o serie", "Buscar por interno, serie o tipo", "Elegí una orden abierta" / "Buscar por número, dominio o interno" (solo órdenes no cerradas). Solo recursos activos. Obligatorio ("Requerido").
- [ ] Cliente: Select "Cliente" (clientes activos, cargados con la página; "No hay clientes activos") + "Contrato (opcional)" (contratos activos del cliente, "Sin contrato"; deshabilitado sin cliente; cambiar de cliente lo limpia).

### Componente compartido: `SearchCombobox` (`components/SearchCombobox.tsx`)

- [ ] Popover + Command con búsqueda en servidor (`useDeferredValue`, React Query, `staleTime` 60 s, solo con el popover abierto), tope de resultados y aviso `role="status"` **arriba de la lista, fuera del scroll**: "Buscando…", "Mostrando X de Y <sustantivo>. Escribí para acotar.", "1 resultado", "N <sustantivo>", "No se pudo cargar la lista". Vacío "No se encontraron <sustantivo>". Botón ✕ "Quitar selección" junto al trigger.

## Materiales — `/dashboard/warehouse?tab=materiales`

- [ ] Raíz: `Materials/MaterialsTabContent.tsx` → con `materiales:create` carga `getMaterialFormLookups()` (categorías y unidades **activas**) y muestra "Nuevo material" (variant `brand`, sm, Plus) → `MaterialsList.tsx` (Card) → `components/_MaterialsDataTable.tsx`, columnas `MaterialsList/columns.tsx`, `TABLE_ID='warehouse-materials'`.
- [ ] Columnas: Código (mono) · Nombre (link azul al detalle del material) · Descripción* · Categoría · Unidad · Tipo de control (badge + icono: Por cantidad Hash, Por número de serie Barcode, Por lote Layers) · Requiere aprobación (badge Sí/No con Check/X) · Stock mínimo · Estado (Activo default / Inactivo secondary) · Creado* · acciones (*ocultas por defecto). Las filas inactivas se ven **atenuadas** (`opacity-50`).
- [ ] Orden: los **inactivos siempre al final** (el orden por Estado se ignora), luego el orden del usuario, luego nombre asc.
- [ ] Filtros: Categoría ("Sin asignar"), Unidad, Tipo de control, Requiere aprobación (Sí/No), Estado (Activo/Inactivo) (faceted); Código, Nombre, Descripción (text); Stock mínimo (text, valor exacto); Creado (dateRange). Visibles por defecto: Categoría, Tipo de control, Estado.
- [ ] Búsqueda: "Buscar por código, nombre o descripción". Vacío: "No hay materiales cargados".
- [ ] Export: `materiales`, título "Listado de Materiales", hoja "Materiales"; formatters de tipo de control, Sí/No, Activo/Inactivo, fecha, nulos → vacío.
- [ ] Acciones por fila (`Materials/components/MaterialRowActions.tsx`, menú ⋯ "Acciones del material"; no se renderiza sin `update` ni `delete`): **Editar** (`update`; al elegirlo lee el material y los catálogos — el icono del menú pasa a spinner — y abre el form) · **Reactivar** (`update`, solo inactivos; toast "Material reactivado") · **Dar de baja** (`delete`, solo activos, rojo).
- [ ] Dar de baja → `components/ConfirmRemovalDialog.tsx` "¿Dar de baja el material?" — "Si ya tiene movimientos se desactiva (su historial se conserva y deja de ofrecerse en los formularios). Si nunca se usó, se elimina." Botones Cancelar / "Dar de baja" ("Procesando…"; el diálogo no se cierra hasta la respuesta). Toast "Material eliminado" o "Material desactivado: ya no se ofrece en los movimientos". Los materiales de Ropa o Gomería se rechazan: "…se da de baja quitando la combinación" / "…desactivando el tipo o la marca".
- [ ] **MaterialFormDialog** (`Materials/components/MaterialFormDialog.tsx`, Dialog `sm:max-w-xl`, scroll a 90vh) "Nuevo material" ("Lo que se guarda en los depósitos.") / "Editar <código>" ("Los cambios no alteran los movimientos ya registrados."):
  - Código* (placeholder "ACE-15W40", máx. 40) · Nombre* ("Aceite 15W40", máx. 200) · Categoría (Select con "Sin categoría") · Unidad de medida* (Select "<nombre> (<abrev>)") · Control de stock (Por cantidad / Por número de serie / Por lote) con ayuda "Por serie: herramientas que se identifican de a una. Por lote: con vencimiento." · Stock mínimo (decimal opcional, "Suma de todos los depósitos.") · Descripción (máx. 1000) · checkbox "Requiere aprobación" ("Las salidas de este material van a necesitar un pedido aprobado (cuando se habiliten los pedidos).").
  - Con movimientos: Unidad y Control **deshabilitados** ("No se puede cambiar: el material ya tiene movimientos."); el servidor además lo rechaza.
  - Material de Ropa o Gomería: aviso "Este material se administra desde el catálogo de Ropa (artículo, marca y talle) / de Gomería (tipo y marca de cubierta): el código, el nombre, la unidad y el tipo de control salen de ese catálogo. Acá se pueden cambiar la categoría, el mínimo y la descripción." Código y Nombre `readOnly`, Unidad y Control deshabilitados.
  - Botones Cancelar / "Crear material" | "Guardar cambios" ("Guardando…"). Toast "Material <código> creado/actualizado"; código duplicado: "Ya existe un material con ese código". Invalida materiales y stock + `router.refresh()`.

## Depósitos — `/dashboard/warehouse?tab=depositos`

- [ ] Raíz: `Depots/DepotsTabContent.tsx` → "Nuevo depósito" (`brand`, sm, Plus; con `depositos:create`) → `DepotsList.tsx` (Card) → `components/_DepotsDataTable.tsx`, columnas `DepotsList/columns.tsx`, `TABLE_ID='warehouse-depots'`.
- [ ] Columnas: Código (mono) · Nombre · Dirección · **Legajo responsable** (columna separada, antes del nombre) · Responsable ("Apellido Nombre") · Estado (Activo/Inactivo con icono) · Creado* (oculta) · acciones. Inactivos atenuados.
- [ ] Orden: inactivos siempre al final, luego el del usuario, luego nombre asc.
- [ ] Filtros: Estado, Responsable (faceted, opciones `[legajo] Apellido Nombre` con icono User, "Sin asignar"); Legajo responsable (text, "Legajo exacto (numero completo)..."); Código, Nombre, Dirección (text); Creado (dateRange). Visibles por defecto: Estado, Responsable, Nombre.
- [ ] Búsqueda: "Buscar por código, nombre o dirección". Vacío: "No hay depósitos cargados".
- [ ] Export: `depositos`, título "Listado de Depósitos", hoja "Depósitos".
- [ ] Acciones por fila (`Depots/components/DepotRowActions.tsx`, mismo patrón que materiales): Editar (`update`) · Reactivar (`update`, inactivos; "Depósito reactivado") · Dar de baja (`delete`, activos) → ConfirmRemovalDialog "¿Dar de baja el depósito?" — "Tiene que estar sin stock. Si tuvo movimientos se desactiva (su historial se conserva); si nunca se usó, se elimina." Con stock: "El depósito tiene stock: transferilo o ajustalo antes de darlo de baja". Toasts "Depósito eliminado" / "Depósito desactivado: ya no se ofrece en los movimientos".
- [ ] **DepotFormDialog** (`Depots/components/DepotFormDialog.tsx`, Dialog `sm:max-w-lg`) "Nuevo depósito" / "Editar <nombre>", descripción "Un lugar físico donde se guarda material: base, obra, pañol, camioneta.": Código* ("BASE", máx. 20) · Nombre* ("Depósito Base Neuquén", máx. 120) · Dirección (opcional, máx. 200) · Responsable (`SearchCombobox` de empleados "Sin responsable" / "Buscar por legajo o nombre", opcional). Toast "Se creó el depósito "X"" / "Se actualizó "X"". Invalida depósitos y stock + `router.refresh()`.

## Préstamos — `/dashboard/warehouse?tab=prestamos`

Un préstamo es una unidad serializada (herramienta) con estado `OUT` tras una salida. Las cubiertas (materiales con
`tire_combination`) **no se listan**: se desmontan desde Gomería.
- [ ] Raíz: `Loans/LoansTabContent.tsx` (sin botones propios) → `LoansList.tsx` (Card) → `components/_LoansDataTable.tsx`, columnas `LoansList/columns.tsx`, `TABLE_ID='warehouse-loans'`.
- [ ] Columnas: Código (mono) · Material (link azul al detalle) · Número de serie (mono) · Tipo de destino (badge + icono, mismos que Movimientos) · Tenedor (`destinationLabel`, empleado con `[legajo]`) · Desde (fecha de la salida, UTC) · Días en préstamo · Salida (link mono al movimiento de salida) · acciones. Ninguna oculta por defecto.
- [ ] No ordenables: Tenedor y Salida. Orden por defecto: **los más antiguos primero** (fecha de salida asc).
- [ ] Filtros: Tipo de destino (faceted, "Sin asignar"); Tenedor (text, "Legajo, apellido, dominio, interno, orden o cliente..."); Desde (dateRange); Código, Material, Número de serie (text); Días en préstamo (text, "Cantidad exacta de días..."); Salida (text, "Buscar por número de salida..."). Visibles por defecto: Tipo de destino, Tenedor, Desde.
- [ ] Búsqueda: "Buscar por material, código o número de serie". Vacío: "No hay préstamos abiertos".
- [ ] Export: `prestamos`, título "Préstamos abiertos", hoja "Préstamos".
- [ ] La "Salida" mostrada puede ser la salida original o, si se anuló una devolución, la salida de la que venía (`returned_from`).
- [ ] Acciones por fila (`Loans/components/LoanRowActions.tsx`, menú ⋯ "Acciones de <serie>"; sin salida de origen no hay menú; sin permisos tampoco): **Devolver** (`prestamos:create`) · **Dar de baja** (`prestamos:delete`, rojo). Cada diálogo se monta al abrir (form limpio cada vez).
- [ ] **ReturnLoanDialog** (Dialog `sm:max-w-md`) "Devolver <serie>", descripción "<material> · en poder de <tenedor>": "Vuelve al depósito" (Select de depósitos activos, cargado al abrir; "Cargando…" / "Elegí un depósito"; obligatorio) · Fecha (`EnhancedDatePicker`, default hoy) · Observaciones ("Estado en que vuelve (opcional)"). Botones Cancelar / "Registrar devolución" ("Registrando…"). Genera un movimiento **Devolución** (`RETURN`) al costo con que salió. Toast "<número>: <series> devuelto a <depósito>"; invalida préstamos, stock y movimientos + `router.refresh()`.
- [ ] **WriteOffLoanDialog** (AlertDialog) "¿Dar de baja <serie>?" — "<material>, en poder de <tenedor>. El préstamo se cierra y la herramienta deja de figurar; queda registrado quién la tenía. No se puede deshacer.": Motivo (RadioGroup Extraviada / Rota, default Extraviada) · "Qué pasó" (Textarea obligatorio, "Ej.: se perdió en la locación del pozo 12"; error "Contá qué pasó con la herramienta"). Botones Cancelar / "Dar de baja" (rojo, "Procesando…"). Toast "<serie> dada de baja". La baja queda listada en la ficha del material ("Dadas de baja").

## Pedidos — `/dashboard/warehouse?tab=pedidos`

Circuito: Pendiente de aprobación → Aprobado → Entregado en parte → Entregado; o Rechazado / Cancelado (desde
pendiente) / Cerrado (desde aprobado o entregado en parte). Máquina de estados en `lib/request-state-machine.ts`.
- [ ] Raíz: `Requests/RequestsTabContent.tsx` → "Nuevo pedido" (`brand`, sm, Plus; link a `/dashboard/warehouse/requests/new`; con `pedidos:create`) → `RequestsList.tsx` (Card) → `components/_RequestsDataTable.tsx`, columnas `RequestsList/columns.tsx`, `TABLE_ID='warehouse-requests'`.
- [ ] **Visibilidad**: sin `pedidos:view_all_requests` el usuario ve **solo los pedidos que hizo él** (tabla, export, facetas y detalle).
- [ ] Columnas: Número (mono, link azul al detalle) · Estado (`RequestStatusBadge`: Pendiente de aprobación ámbar Clock · Aprobado outline CheckCircle2 · Entregado en parte borde ámbar PackageCheck · Entregado verde CircleCheck · Rechazado destructive XCircle · Cerrado muted Lock · Cancelado destructive Ban) · Solicitante (usuario) · Tipo de destino · Destino · Fecha (creación) · Avance ("N / M" líneas completamente entregadas, calculado en una sola query) · Decidió (usuario). Ninguna oculta.
- [ ] No ordenables: Destino y Avance. Orden por defecto: `created_at desc`, número desc.
- [ ] Filtros: Estado (faceted con iconos), Tipo de destino ("Sin asignar"), Fecha (dateRange), Solicitante, Decidió (faceted, icono User, "Sin asignar"); Número, Destino (text). Visibles por defecto: Estado, Tipo de destino, Fecha.
- [ ] Búsqueda: "Buscar por número o notas" (busca también en las observaciones, que no son columna). Vacío: "No hay pedidos".
- [ ] Export: `pedidos-materiales`, título "Pedidos de materiales", hoja "Pedidos".
- [ ] Sin acciones por fila: todo se hace desde el detalle.

## Detalle del pedido — `/dashboard/warehouse/requests/[id]`

- [ ] Raíz: `src/app/dashboard/warehouse/requests/[id]/page.tsx` (`cache(getMaterialRequestDetail)`, título "<número> | Almacenes"; `notFound()` sin `pedidos:view`, si no es propio y no tiene `view_all_requests`, o si no existe) → "← Pedidos" → `Requests/components/RequestDetail.tsx`.
- [ ] Cabecera: número (h1 mono) + `RequestStatusBadge` + acciones a la derecha (`RequestDecisionDialogs.tsx` `RequestActions`; las calcula el servidor en `can` = permiso **y** estado):
  - **Entregar** (link a `/requests/[id]/deliver`, PackageOpen) — `pedidos:update`, estado Aprobado o Entregado en parte.
  - **Aprobar** (Check) — `pedidos:approve`, pendiente. AlertDialog "¿Aprobar <n>?" "Queda listo para que el almacén lo entregue." → "Aprobar pedido" ("Aprobando…"). Toast "<n> aprobado". (Quien tiene `approve` puede aprobar sus propios pedidos.)
  - **Rechazar** (X, outline rojo) — `pedidos:approve`, pendiente. "¿Rechazar <n>?" "El solicitante ve el motivo en el pedido. No se puede deshacer." + "Motivo del rechazo" obligatorio ("Ej.: ya se entregó la semana pasada") → "Rechazar pedido".
  - **Cerrar** (Lock, outline rojo) — `pedidos:update`, aprobado o entregado en parte. "¿Cerrar <n>?" "Lo pendiente ya no se entrega. Las entregas hechas se mantienen." + "Motivo del cierre" obligatorio ("Ej.: el resto se compra directo al proveedor").
  - **Cancelar pedido** (Ban, outline rojo) — **solo el solicitante**, pendiente. "¿Cancelar <n>?" "El pedido deja de esperar aprobación. Para pedir otra cosa, hacé uno nuevo." Sin motivo.
  - Todos: botón "Volver" para cerrar, el diálogo no se cierra hasta la respuesta, motivo se borra al cerrar; éxito → toast, invalida pedidos + `router.refresh()`; estado cambiado entre medio → "<n> ya no está en un estado que lo permita".
- [ ] Card de datos: Pedido por "<usuario> · DD/MM/YYYY HH:mm" · "Se imputa a (<tipo>)" · Orden de trabajo ("OT-x · <sector>", pedidos de Mantenimiento) · "Aprobado por" / "Rechazado por" "<usuario> · fecha" · "Total estimado (promedio vigente)" (solo con `movimientos:view_prices`) · Observaciones · Motivo del rechazo · "Cerrado por" / "Cancelado por" + motivo.
- [ ] Card "Materiales" (`<Table>` manual): Material (link al kardex) · Pedido · Entregado · Pendiente ("—" si no queda).
- [ ] Card "Entregas": lista de movimientos (link mono, fecha · depósito, badge "Anulación", badge "Anulada por <n>"). Vacío: "Todavía no hubo entregas.". Anular una entrega desde el movimiento recalcula estado y avance del pedido.

## Nuevo pedido — `/dashboard/warehouse/requests/new`

- [ ] Raíz: page (metadata "Nuevo pedido | Almacenes"; `notFound()` sin `pedidos:create`) → header "← " + h1 "Nuevo pedido de materiales" → `Requests/components/NewRequestForm.tsx` (RHF + zod `materialRequestSchema`).
- [ ] Card "Pedido" ("Lo aprueba un responsable y después el almacén lo entrega, en una o varias veces."): `DestinationFields` (destino obligatorio) + separador + Observaciones ("Para qué se necesita, urgencia… (opcional)", máx. 1000).
- [ ] Card "Materiales": "N líneas" + **"· total estimado $X"** en vivo (solo con `movimientos:view_prices`, con el costo promedio vigente) + "Agregar línea". Por línea: material (`SearchCombobox`, sin badge de inactivo) + Cantidad + quitar (deshabilitado si es la única). **No muestra disponible** (quien pide no ve stock).
- [ ] Validaciones: destino y su recurso, al menos una línea, material, cantidad > 0 hasta 4 decimales. Servidor: material inactivo, serializado con cantidad no entera ("se entrega por unidad: la cantidad tiene que ser entera").
- [ ] Botones Cancelar (`router.back()`) / "Enviar pedido" ("Enviando…"). Toast "<n> creado: queda pendiente de aprobación" → navega al detalle.

## Entregar pedido — `/dashboard/warehouse/requests/[id]/deliver`

- [ ] Raíz: page (metadata "Entregar pedido | Almacenes"; `notFound()` si `!request.can.deliver`) → header "←" (vuelve al pedido) + h1 "Entregar <número>" → `Requests/components/DeliverRequestForm.tsx` (con `key` = pendientes, para remontar tras otra entrega).
- [ ] Sin depósitos activos: "No hay depósitos activos desde donde entregar.".
- [ ] Card "Entrega" ("Sale del depósito elegido y se imputa a <destino>."): Depósito (preelegido si hay uno; **cambiarlo limpia lotes y unidades elegidos**) · Fecha (default hoy) · Observaciones.
- [ ] Card "Materiales pendientes" ("Dejá en 0 lo que no se entrega ahora."): una fila por línea con pendiente: código + nombre, "Pendiente N <u> · disponible M <u>" (o "elegí el depósito para ver el disponible" / "consultando disponible…"); "A entregar" precargado con el pendiente; lote (Select FEFO, vencidos deshabilitados); serializados: "Unidades (N elegidas)" con grilla de checkboxes. Un lote por línea por entrega.
- [ ] Validaciones: al menos una cantidad ("Indicá al menos una cantidad a entregar"), cantidades válidas, lote en materiales por lote. Servidor: no se puede entregar más de lo pendiente, stock insuficiente, lote vencido.
- [ ] Botones Cancelar / "Registrar entrega" ("Registrando…"). Genera una **Salida** vinculada al pedido e imputada a su destino. Toast "<movimiento>: entrega de <pedido> registrada. Estado: <estado>" → vuelve al detalle; invalida pedidos, movimientos, stock y disponibilidad.

## Configuración — `/dashboard/warehouse?tab=config-almacen`

- [ ] Raíz: `Settings/SettingsTabContent.tsx` (server; fallback `Settings/fallback/SettingsSkeleton.tsx`) carga en paralelo categorías y unidades (activas e inactivas, con conteo de materiales), el monto de salida directa y, **solo con `movimientos:adjust`**, las cubiertas de Gomería sin stock y los depósitos activos. Tres bloques apilados: `SettingsPanel` (grilla de 2 columnas en `lg`), `DirectExitSection`, `TireInventorySection` (condicional).
- [ ] `Settings/components/SettingsPanel.tsx`: React Query (`WAREHOUSE_QUERY_KEYS.settings`) con `initialData` del server; dos Cards con el mismo patrón (`CatalogRow.tsx`, lista `divide-y`, sin DataTable):
  - **Categorías de materiales** ("Agrupan el catálogo: Lubricantes, Herramientas, EPP…"). Vacío: "Todavía no hay categorías. Los materiales pueden cargarse sin categoría.".
  - **Unidades de medida** ("En qué se cuenta cada material: unidad, litro, kilogramo…"); fila "<nombre> (<abrev>)".
- [ ] Fila: nombre (gris + badge "Inactiva" si está inactiva) + "Sin materiales" / "1 material" / "N materiales"; botones icono: Editar (Pencil, `config-almacen:update`) · Reactivar (RotateCcw, `update`, solo inactivas) · Dar de baja (Trash2 rojo, `config-almacen:delete`, solo activas). Botón "Agregar" (outline, Plus) en la cabecera con `config-almacen:create`.
- [ ] Dialog `sm:max-w-md` "Nueva categoría" / "Editar categoría": Nombre* (máx. 120, autofocus). Unidad: Nombre* (máx. 60) + Abreviatura* ("l, kg, u", máx. 10). Botones Cancelar / "Guardar" ("Guardando…"). Toasts "Categoría X creada/actualizada", "Unidad X creada/actualizada"; duplicado → mensaje de unicidad.
- [ ] Dar de baja → `ConfirmRemovalDialog` "¿Dar de baja "<nombre>"?" — "Si algún material la usa, se desactiva y deja de ofrecerse; si no, se elimina." Toasts "Categoría/Unidad eliminada" o "…desactivada: tiene materiales asignados"; "… reactivada".
- [ ] Tras guardar se invalidan configuración y materiales (las inactivas dejan de ofrecerse en el form de material).
- [ ] **Salida directa** (`Settings/components/DirectExitSection.tsx`, Card "Salida directa"): "Una salida desde "Nuevo movimiento" que supere este monto se rechaza y tiene que hacerse por pedido de materiales. Los materiales que requieren aprobación siempre van por pedido." Con `config-almacen:update`: form inline "Monto máximo ($)" ("Sin límite", "Vacío = sin límite.", hasta 2 decimales) + "Guardar" (deshabilitado si no cambió). Toast "Monto máximo de salida directa guardado" / "La salida directa queda sin límite de monto". Sin permiso: texto "Máximo $X" / "Sin límite de monto".
- [ ] **Inventario inicial de cubiertas** (`Settings/components/TireInventorySection.tsx`): visible **solo mientras haya cubiertas de Gomería sin stock** y con `movimientos:adjust`. Card "Inventario inicial de cubiertas": "Hay N cubiertas de Gomería sin stock. Al cargarlas entran al depósito con el costo de su tipo y marca; las montadas, en reparación o extraviadas quedan imputadas al equipo donde están." Depósito* (preelegido si hay uno) + una fila por tipo+marca ("<medida> <banda> · <marca>", "N cubiertas: X disponible, Y montada…") con "Costo unitario ($)" obligatorio por fila. Botón "Cargar N cubiertas al stock" ("Cargando…"). Toast "Inventario cargado: N cubiertas en <entrada> y K salida(s) a los equipos (…). Quedaron en el depósito M cubiertas sin equipo conocido". Invalida stock y movimientos + `router.refresh()` (la sección desaparece).

## Otras superficies del módulo

- [ ] `src/app/dashboard/warehouse/loading.tsx`: carga de la ruta.
- [ ] Sidebar: módulo "Almacenes" (`navigation.ts`, `MODULE_ICONS.almacenes` en `src/shared/constants/module-icons.ts`) con un sub-ítem por sección (Stock, Movimientos, Préstamos, Pedidos, Materiales, Depósitos, Configuración), cada uno gateado por su `view`.
- [ ] **Mail semanal de lotes por vencer** (`src/features/Jobs/jobs/warehouse-batch-expiry.ts`, template `Jobs/templates/warehouse-batch-expiry.ts`, disparado por `src/app/api/jobs/warehouse-batch-expiry/route.ts`): misma lista que el aviso de Stock. Se rediseña en la Fase 8 (mails).
- [ ] Manual de uso: `src/content/manual/almacenes/*.mdx` (8 páginas) + `procesos/circuito-de-materiales.mdx`, sección `Ayuda/Manual/catalog/sections/almacenes.ts`. Los cambios de pantalla del rediseño tienen que reflejarse ahí (ver `ayuda.md`).

## Afectaciones cruzadas (pantallas de otros módulos que Almacenes modificó)

Almacenes entró a `main` (PR #5) **después** de relevar las demás fichas (2026-10-07). Lo de abajo es lo que cambió en
pantallas que ya tienen ficha: **hay que sumarlo a esa ficha** antes de rediseñarla (o tildarlo acá si se rediseña
junto con el módulo dueño). Diff de referencia: `git diff 4a76efdc^1 4a76efdc -- src ':!src/features/Warehouses'`.

### Entregas de ropa — panel `/clothing/delivery` → actualizar `paneles-de-campo.md` §3

- [ ] Asistente "Registrar Entrega" (`ClothingDelivery/components/DeliveryWizard.tsx` + `StepAddItems.tsx`): nuevo Select **"Depósito"** arriba de los artículos ("Cargando..." / "No hay depósitos activos" / "Elegí el depósito"; con un solo depósito activo se usa ese sin elegir). Validación del paso: "Elegí el depósito del que sale la entrega." y **marca y talle obligatorios** ("Cada artículo tiene que tener marca y talle."). Texto del paso: "Agregue todos los artículos de la entrega, con marca y talle. Debe haber al menos uno."
- [ ] Opciones de talle con disponible del depósito: "<talle> · N disp." / "<talle> · Sin stock" (un talle sin stock se puede elegir; el servidor rechaza con el detalle) + línea "Disponible: N" (roja si la cantidad pedida lo supera). Cambiar de depósito recalcula.
- [ ] `StepConfirm.tsx`: bloque "Sale del depósito <nombre>". Si falla (stock), toast con el **mensaje del servidor** y el asistente **no se reinicia** (se corrige y se vuelve a confirmar); se refresca el disponible.
- [ ] Tabla "Todas las entregas" (`Clothing/AllDeliveries/AllDeliveriesList/`): nueva columna y filtro **Estado** (Vigente success + CheckCircle2 / Anulada destructive + Ban, con motivo debajo y tooltip "Anulada el DD/MM/YYYY HH:mm · Motivo"), export con el label; la tarjeta mobile (`DeliveryCard.tsx`) muestra el badge si está anulada. (Acá **no** hay acción de anular.)

### Entregas de ropa — ficha del empleado, pestaña Indumentaria → actualizar `empleados.md` (sección "Ficha — pestaña Indumentaria")

- [ ] `Clothing/EmployeeDeliveries/EmployeeDeliveriesList/`: columnas nuevas **Estado** (`Clothing/components/DeliveryStatusBadge.tsx`), **Depósito** ("—" en entregas anteriores a Almacenes; filtro con "Sin asignar") y **Costo** (solo con `almacenes:movimientos:view_prices`; "Sin costo"); filtros Estado y Depósito; orden por estado y depósito; export con labels.
- [ ] Acciones por fila (`Clothing/components/DeliveryRowActions.tsx`): constancia PDF + **"Anular"** (ghost rojo, Ban) solo en vigentes y con `empleados:indumentaria_empleado:delete` → `EmployeeDeliveries/components/CancelDeliveryDialog.tsx` "¿Anular la entrega a [legajo] Apellido Nombre?", Motivo obligatorio ("Ej.: se cargó un talle equivocado"), botones "Volver" / anular. Toast "Entrega anulada: la ropa volvió al depósito" (o "Entrega anulada" si no había descontado stock). Anula también la salida de stock.
- [ ] Constancia PDF (`Clothing/pdf/DeliveryReceiptLayout.tsx`): una entrega anulada se imprime con la franja "ANULADA el DD/MM/YYYY — Motivo: …" (impacta Fase 8).

### Catálogo y reportes de indumentaria — Configuración → Indumentaria → actualizar `configuracion.md` (Indumentaria)

- [ ] Artículos (`ClothingItems/components/ClothingItemForm.tsx` + `ItemBrandSizeManager.tsx`): cada combinación artículo+marca+talle **es un material de stock**; los chips de talle muestran el stock total ("· N", tooltip "Material <código> · stock total N" / "Se crea su material al guardar") y la nota "Junto a cada talle, el stock total en Almacenes. Cada combinación es un material de stock.". La matriz se lee fresca al abrir y se guardan **altas y bajas explícitas** (nunca "lo que no vino se borra"); "Guardar" deshabilitado mientras carga la matriz.
- [ ] Reportes (`ClothingReports/ClothingReportsList/`): mismas columnas/filtros Estado, Depósito y Costo que la ficha del empleado, y la acción **Anular** (permiso `empleados:indumentaria_empleado:delete`).

### Cubiertas en Gomería → actualizar `mantenimiento.md` (Gomería)

- [ ] Catálogo (`Gomeria/Catalogo/components/`): columnas nuevas **Depósito** ("<depósito>" / "Sin stock" / "Dada de baja" / "Afuera", con filtro) y **Costo** (solo con `movimientos:view_prices`, "Sin costo").
- [ ] **TireForm** alta: campos nuevos **Depósito** (preelegido si hay uno; "Elegí el depósito") y **Costo unitario** obligatorio (hasta 4 decimales): la cubierta entra al stock con una entrada. Edición de una cubierta con stock: aviso "La cubierta está en el stock de Almacenes: la serie, la marca y el tipo no se cambian." y esos campos bloqueados.
- [ ] **TireBulkForm**: Depósito + "Costo unitario" ("Ej: 450000") obligatorios; errores del servidor por toast ("Indicá el costo unitario…", "Los siguientes números de serie ya existen: …").
- [ ] "Marcar como encontrada / reparada" de una cubierta con stock afuera abre **`TireReturnDialog`** "Devolver la cubierta al depósito" (Select de depósito; "Cargando depósitos..." / "No hay depósitos activos para devolver la cubierta."). Mensajes nuevos: "Ese cambio de estado se hace desde una orden de gomería", "Dala de baja con un descarte; tiene stock".
- [ ] Órdenes: "Anular orden" ahora también anula los movimientos de stock de las cubiertas (texto del AlertDialog y toast "Orden anulada, cubiertas revertidas y movimientos de stock anulados").
- [ ] `TirePositionCard` (dashboard y QR): al pasar la cubierta actual a "Disponible" con stock, `Gomeria/shared/TireReturnWarehouseSelect.tsx` "Depósito al que vuelve *" (solo si hay más de un depósito; hook `useTireReturnWarehouse`). Descarte/Reparación siguen pidiendo motivo.
- [ ] `TireReplacePicker`: **se quitó "Crear cubierta rápida"**; muestra el depósito de cada cubierta disponible; vacío "No hay cubiertas disponibles en stock. Se dan de alta en el catálogo de cubiertas o con una entrada en Almacenes".
- [ ] Marcas y Tipos: crear/editar/activar sincroniza los materiales de stock de cada combinación tipo+marca (sin cambio visible). El panel QR de gomería (`paneles-de-campo.md` §2, "Operación de Gomería") hereda los cambios de `TirePositionCard` y `TireReplacePicker`.

### Cubiertas en la ficha del vehículo → actualizar `equipos.md` (pestaña Cubiertas)

- [ ] Editor de ejes / `DisplacedTiresDialog`: si alguna cubierta desplazada va a "Disponible" y tiene stock, Select "Depósito al que vuelven las disponibles" (con más de un depósito); "Confirmar" deshabilitado hasta elegirlo.
- [ ] "Restablecer a la plantilla del subtipo" (`vehicle-tire-diagram-section.tsx`): Select "Depósito al que vuelven las cubiertas con stock" en la confirmación; botón deshabilitado sin depósito; errores del servidor por toast.

### Pedidos de materiales desde el taller → actualizar `mantenimiento.md` (`OrderDetailDialog`) y `paneles-de-campo.md` §1

- [ ] `OrderDetailDialog` (Taller › En Taller y Seguimiento): nueva sección **"Materiales"** (`MaintenanceOrders/components/order-detail/OrderMaterialsSection.tsx`): lista de pedidos de la orden (link al pedido, `RequestStatusBadge`, "<OT> · fecha · N materiales"), vacío "Todavía no se pidieron materiales para esta orden.", bloque "Entregado" agrupado por OT con costos (solo con `movimientos:view_prices`) y "Total materiales: $X". Botón **"Pedir materiales"** (con `almacenes:pedidos:create` y orden `in_workshop`).
- [ ] Diálogo **"Pedir materiales"** (`Warehouses/Requests/components/MaintenanceMaterialRequestDialog.tsx`, compartido): "Para la orden X. El almacén elige de dónde sale cuando lo entrega."; Select "Orden de trabajo" con "Toda la orden (sin OT)" + OT abiertas; líneas material (`SearchCombobox`) + cantidad + quitar; "Agregar línea"; "Nota" ("Para qué es, urgencia… (opcional)"). Toast "<n> enviado: queda pendiente de aprobación". Errores: OT cerrada, OT de otra orden.
- [ ] Cierre de la orden: aviso ámbar "No se puede cerrar todavía: <n> sigue abierto. Entregalo, cerralo o cancelalo desde Almacenes → Pedidos." y **"Validar y Cerrar Orden" deshabilitado** mientras haya pedidos abiertos; el servidor también bloquea **rechazar** la orden.
- [ ] Historial (`ActivityHistoryModal`): nuevo evento "pedido de materiales" (`MATERIAL_REQUEST_CREATED`, etapa taller).
- [ ] PDF de la orden (`MaintenanceOrders/pdf/MaintenanceOrderReportLayout.tsx`): nueva tabla de materiales (Orden de trabajo · Material · Cantidad · Costo si hay permiso) (Fase 8).
- [ ] Panel del operario, detalle de OT (`OperatorPanel/components/WorkOrderDetail/WorkOrderMaterials.tsx`): sección "Materiales" con chip ámbar **"Esperando materiales"**, botón "Pedir materiales" (salvo OT cerrada/cancelada), lista de pedidos con "N de M <unidad>" entregado por línea; vacío "No pediste materiales para esta OT."; refresca cada 30 s. Usa el mismo diálogo con la OT fija.

## Rarezas y bugs previos (para `PLAN.md` §9; no se arreglan en el rediseño sin preguntar)

**Permisos y enlaces que terminan en 404**
- [ ] El link del nombre del material (Materiales, Préstamos, Movimientos, kardex, pedidos) va a `/materials/[id]`, que exige `stock:view`: un rol con `materiales:view` o `prestamos:view` pero sin `stock:view` cae en 404. Igual los links a movimientos desde Préstamos/ficha del material (exigen `movimientos:view`) y a pedidos desde el detalle de la orden de mantenimiento (exigen `pedidos:view` y, si no es propio, `view_all_requests`).
- [ ] La sección "Materiales" del `OrderDetailDialog` lista los pedidos de la orden **sin chequear ningún permiso de Almacenes** (`getMaintenanceOrderMaterials` solo valida la empresa).
- [ ] Dos permisos de precios distintos para el mismo dato: Stock y la ficha del material usan `stock:view_prices`; movimientos, total estimado del pedido, materiales de la orden, costo de entregas de ropa y de cubiertas usan `movimientos:view_prices`. Un rol con uno solo ve costos en unas pantallas y no en otras.
- [ ] La Configuración muestra el monto de salida directa ("Máximo $X") a quien tiene `config-almacen:view` aunque no tenga ningún `view_prices` (el error de la salida, en cambio, oculta el monto sin permiso).
- [ ] Anular entregas de ropa desde Configuración → Indumentaria → Reportes usa un permiso de Empleados (`empleados:indumentaria_empleado:delete`).

**Acciones que la UI ofrece y el servidor rechaza**
- [ ] El botón "Anular" del detalle aparece en movimientos de cubiertas (montaje/desmontaje), aunque el mismo detalle dice "Se corrige desde Gomería" y el servidor responde "Los movimientos de cubiertas no se anulan desde Almacenes".
- [ ] "Dar de baja" en Materiales aparece para materiales de Ropa y de Gomería, que el servidor rechaza ("se da de baja quitando la combinación" / "desactivando el tipo o la marca").
- [ ] Préstamos: una unidad prestada sin salida de origen (`exitMovementId` nulo) no muestra acciones y no se puede devolver ni dar de baja desde la UI.

**Estados que quedan desfasados**
- [ ] Anular desde Movimientos la salida de una entrega de ropa devuelve el stock pero la entrega sigue **"Vigente"** en Indumentaria hasta que alguien la anule ahí (diseño de la spec etapa 5 §3.3; la UI de Indumentaria no lo avisa).
- [ ] "Bajo mínimo" de la tabla de Stock cuenta materiales inactivos; el aviso de arriba solo los activos. Además los materiales agotados no aparecen en la tabla (solo en el aviso): el filtro "Bajo mínimo: Sí" no los encuentra.

**Formularios**
- [ ] Nuevo movimiento: cambiar el depósito **no limpia** los lotes ni las unidades ya elegidos en las líneas (la entrega de pedidos sí lo hace); la selección vieja la rechaza el servidor.
- [ ] Editar material: si su categoría o unidad está inactiva, el Select la muestra vacía (los catálogos del form traen solo activas).
- [ ] Editar material/depósito: si la lectura previa falla, el menú vuelve a su icono y **no hay toast** (falla silenciosa).
- [ ] Copy desactualizado en el form de material: "Las salidas de este material van a necesitar un pedido aprobado (cuando se habiliten los pedidos)" — los pedidos ya existen.
- [ ] La entrega de un pedido admite un solo lote por línea: para sacar de dos lotes hay que registrar dos entregas.
- [ ] Quien tiene `pedidos:approve` puede aprobar sus propios pedidos (no hay control de "otro aprobador"): confirmar si es intencional.

**Ya se corrigen solos con el rediseño (son de UI)**
- [ ] Colores fijos (26 usos en 9 archivos): avisos rojo/ámbar de Stock, `RequestStatusBadge` (ámbar, `bg-green-600 text-white`), links `text-blue-600` (Stock, Materiales, Movimientos, Préstamos, Pedidos), "Por debajo del mínimo" ámbar en la ficha; fuera del módulo: tooltip `bg-black text-white` de `DeliveryStatusBadge`, aviso ámbar de cierre en `OrderDetailDialog`, chip "Esperando materiales".
- [ ] Doble gate de permisos por sección (`SectionManagerServer` + `NoPermission` en cada TabContent): inofensivo, se puede unificar.
- [ ] Botón de cierre de los diálogos de pedido dice "Volver" y el de anular entrega de ropa también; el resto del módulo usa "Cancelar".

## Crecimiento (D7)

Mismo criterio que `crecimiento.md` (clasificación `acotado`/`crece`, estado, riesgo). Las 6 tablas del módulo
paginan en el servidor; el riesgo está en las listas manuales de la ficha del material y en cálculos que recorren
todo un catálogo.

| Riesgo | Superficie | Clasificación | Estado actual | Qué hacer |
|---|---|---|---|---|
| **medio** | Kardex de la ficha del material (`Materials/components/MaterialKardex.tsx` → `actions/materials-detail.server.ts:152` `getMaterialKardex`) | crece (por registro: cada línea de movimiento del material, incluidas entregas de ropa y montajes de cubiertas) | carga todo + recalcula saldo y promedio en JS (`replayKardex`) | Saldo/promedio acumulados en SQL (window function) y carga incremental ("ver más", últimos N primero) |
| **medio** | Ficha del material: "Unidades prestadas" y "Dadas de baja" (`MaterialHeader.tsx` → `materials-detail.server.ts:63, 68`) | crece por registro (las bajas nunca se borran) | carga todo | Carga incremental en las bajas |
| **medio** | Filtro y facet "Bajo mínimo" de Stock (`Stock/components/StockList/actions.server.ts:67` `getBelowMinMaterialIds`) | crece con el catálogo (Ropa crea un material por artículo+marca+talle y Gomería uno por tipo+marca) | trae todos los materiales con mínimo + `groupBy` de todos los saldos en **cada** página, export y facet con el filtro activo | Resolver en SQL (subquery `HAVING SUM(quantity) < min_stock`) |
| **medio** | Selector de clientes con contratos (`actions/options.server.ts:62` `getMovementFormLookups`; Nuevo movimiento y Nuevo pedido) | crece (catálogo) | carga todos los clientes activos con todos sus contratos | Búsqueda en servidor (como el resto de `DestinationFields`) |
| **medio** | Exports de Movimientos (`MovementsList/actions.server.ts:211`) y Pedidos (`RequestsList/actions.server.ts:204`) | crece a nivel empresa | todo lo filtrado, sin tope | Tope con aviso o lotes cuando el volumen lo pida |
| bajo | Tablas de Stock, Movimientos, Préstamos, Pedidos, Materiales, Depósitos (`*/actions.server.ts` `get*Paginated`) | crecen (movimientos, pedidos) / catálogo | paginado servidor (`stateToPrismaParams`), facetas con `groupBy`, avance de pedidos con 1 query agregada por página | — |
| bajo | Exports de Stock, Materiales, Depósitos, Préstamos abiertos | acotados (saldos > 0, catálogos, préstamos abiertos) | todo lo filtrado | — |
| bajo | Aviso de lotes vencidos/por vencer (`lib/expiring-batches.ts:15`, también el mail semanal) | ventana de 30 días + vencidos con saldo | carga todo, muestra 8 | — (los vencidos con saldo se acumulan hasta que se ajustan: es el objetivo del aviso) |
| bajo | Aviso bajo mínimo (`actions/stock-alerts.server.ts:19`) | catálogo | carga todo, muestra 8 | — |
| bajo | Selectores de material, empleado, vehículo, equipo, orden y responsable (`SearchCombobox`) | crecen | búsqueda en servidor, tope 30 con aviso "Mostrando X de Y" | — |
| bajo | Disponible y unidades de un material en un depósito (`options.server.ts:230`) | acotado | carga todo | — |
| bajo | Detalle de movimiento (líneas) y de pedido (líneas + entregas) | acotado (un registro) | carga todo | — |
| bajo | Categorías y unidades (Configuración), inventario inicial de cubiertas | catálogo chico / una vez | carga todo | — |
| bajo | Materiales de la orden (`Mantenimiento/MaintenanceOrders/actions/materials.server.ts:61`) y de la OT del operario (`OperatorPanel/actions/materials.server.ts:99`, refetch cada 30 s) | por registro | carga todo | — |

**Resumen: 14 filas — 0 alto, 5 medio, 9 bajo.** Volumen: el módulo recién se libera (sin datos de producción);
lo que más va a crecer es `stock_movement_lines` (cada entrega de ropa y cada montaje de cubierta es una línea).

<!-- estado: completo -->
