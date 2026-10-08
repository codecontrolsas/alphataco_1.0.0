# Inventario "antes" — Equipos

Ficha funcional de `/dashboard/equipment` y de la ficha `/dashboard/equipment/action`. Se tilda "después" cuando el
rediseño mantiene cada ítem. Rutas de archivos relativas a `src/features/` salvo indicación.

Convenciones: **(*)** = obligatorio en el form · `perm:` = `módulo:tab:acción` · DataTable = componente nuevo
`@/shared/components/common/DataTable` (client-side mode con `queryFn`, preferencias en BD, toggle de columnas y de
filtros, exportación Excel, paginación).

---

## Shell del módulo — `/dashboard/equipment` (`?tab=`)

- Página: `src/app/dashboard/equipment/page.tsx` → `Equipos/EquiposComponent.tsx` (`SectionManagerServer`, `paramName="tab"`, default `equipos`).
- `generateMetadata`: título `Equipos | <empresa>` (cookie `actualCompName` o `getCompanyName()`).
- Permisos cargados una vez con `getUserPermissionsMapServer()` y pasados a todas las tabs.
- [ ] Tab **Equipos** (icono Truck) — `?tab=equipos` — perm `equipos:equipos:view`
- [ ] Tab **Documentos de Equipos** (FileText) — `?tab=documentos-de-equipos` — perm `equipos:documentos-de-equipos:view`
- [ ] Tab **Tipos de Documentos** (FileType) — `?tab=tipos-de-documentos` — perm heredado `configuracion:documentos:view`
- [ ] Tab **Mantenimiento** (Wrench) — `?tab=type_of_repairs` — perm `equipos:type_of_repairs:view`
- [ ] Tabs sin permiso no se muestran (lo resuelve `SectionManagerServer`).
- [ ] Loading de ruta: `src/app/dashboard/equipment/loading.tsx`.

## Equipos — `?tab=equipos` (`&subtab=`)

- Componente: `Equipos/Equipos/EquiposTabContent.tsx` (`TabsManagerServer`, `paramName="subtab"`, default `vehicles`, `dependentParams=['inactive_subtab']` → al cambiar de subtab se limpia `inactive_subtab`).
- [ ] Subtab **Vehículos** (Car) — `&subtab=vehicles` — perm `equipos:vehicles:view` — fallback `VehicleTableSkeleton`
- [ ] Subtab **Equipamiento** (Package) — `&subtab=others` — perm `equipos:others:view` — fallback `OtherEquipmentTableSkeleton`
- [ ] Subtab **Dados de Baja** (XCircle) — `&subtab=inactive` — perm `equipos:inactive:view`

## Vehículos — `?tab=equipos&subtab=vehicles`

- Componente raíz: `Equipos/Equipos/VehicleList/VehicleTabContent.tsx` → `VehicleList.tsx` (Server; `tableId='vehicles'`, `stripPrefixFromSearchParams`, `getTablePreferences`, envuelto en `<Card><CardContent className="pt-6">`) → `components/_VehicleDataTable.tsx`.
- Datos: `actions/actions.server.ts` → `getVehiclesPaginated` (solo `is_active = true` y `type_of_vehicle = 1`).

### Tabla Vehículos
- Columnas: `Equipos/Equipos/VehicleList/columns.tsx` · Sistema: **DataTable nuevo** (`queryKey ['vehicles-list']`, `paramNamespace='vehicles'`, `tableId='vehicles'`, `data-testid="vehicles-table"`).
- [ ] Columnas (en orden): Dominio (link a ficha) · N° Interno (link a ficha) · Tipo (badge) · Subtipo (badge secondary) · Marca · Modelo · Año · Condición (badge con variante + icono por condición) · Estado (badge outline) · Posee certificación (badge Sí con check / No atenuado) · Vencimiento de certificación · N° de certificación · Cantidad de Checklist (badge rojo "Sin checklist" si 0) · Último Checklist (sin orden) · Kilómetros (badge "N km") · Horómetro (badge "N hs") · Afectaciones (M:M; 1 badge, o badge "+N" con popover si son varias; sin orden) · Propietario · Sector (badge secondary) · Chassis · Motor · Serie · Tipo de contrato · Vencimiento contrato · Inicio contrato · N° Contrato · Moneda · Precio · Tipo de costo · Centro de costo · Motivo de baja · Fecha de baja · Creado · Acciones.
- [ ] Ocultas por defecto: chassis, serie, engine, type_of_contract, contract_expiration_date, contract_start_date, contract_number, currency, price, cost_type, cost_center, reason_for_termination, termination_date, created_at, certification_expiration_date, certification_number.
- [ ] Filtros facetados (lazy `fetchFacet` → `getVehicleSingleFacet`): Condición, Estado, Tipo, Subtipo, Marca, Modelo, Propietario, Sector, Centro de costo, Afectaciones, Tipo de contrato, Tipo de costo, Moneda, Motivo de baja, Posee certificación (Sí/No con iconos Check/X). FK nullable con "Sin asignar".
- [ ] Filtros texto: Dominio, Chassis, Motor, Serie, N° Interno, N° Contrato, Año, Kilómetros, Horómetro, Precio, Cantidad de Checklist, N° de certificación.
- [ ] Filtros rango de fechas: Vencimiento contrato, Inicio contrato, Fecha de baja, Creado, Último Checklist, Vencimiento de certificación.
- [ ] Filtros visibles por defecto: Condición, Estado, Tipo (el resto con el toggle).
- [ ] Búsqueda: placeholder "Buscar por dominio, chassis, N° Interno..." (busca en domain, chassis, intern_number, engine).
- [ ] Orden por defecto: `domain asc` (desempate fijo tras el orden elegido). Columnas ordenables salvo Último Checklist, Afectaciones y Acciones.
- [ ] Exportación Excel: archivo `vehiculos`, título "Listado de Vehículos", hoja "Vehículos"; respeta filtros activos (`currentParams`); formatters: condición, estado, tipo de contrato, tipo de costo, moneda, motivo de baja (labels), fechas DD/MM/YYYY, precio a string, Posee certificación Sí/No.
- [ ] Selección múltiple / acciones masivas: **no tiene**.
- [ ] Acción por fila: link "Ver" → `/dashboard/equipment/action?action=view&id=<id>` (sin permiso).
- [ ] Botón toolbar **Agregar vehículo** (variant brand, icono Plus) → `/dashboard/equipment/action?action=new` — perm `equipos:vehicles:create` (`PermissionGuard`).
- [ ] Vacío: "No hay vehículos registrados".
- [ ] Carga: `VehicleTableSkeleton` (Suspense).

## Equipamiento (otros equipos) — `?tab=equipos&subtab=others`

- Componente raíz: `Equipos/OtherEquipment/OtherEquipmentTabContent.tsx` → `list/OtherEquipmentList.tsx` → `list/components/_OtherEquipmentDataTable.tsx`.
- Datos: `list/actions.server.ts`.

### Tabla Otros equipos
- Columnas: `Equipos/OtherEquipment/list/columns.tsx` · Sistema: **DataTable nuevo** (`queryKey ['other-equipment-paginated']`).
- [ ] Columnas: N° Serie (link) · N° Interno (link) · Tipo · Subtipo · Modelo · Propietario · Tipo de contrato · Marca · Afectaciones (M:M, sin orden) · Año · Condición · Estado · Posee certificación · Vencimiento de certificación · N° de certificación · Horómetro · Vinculado a (vehículo) · Sector · Tipo de costo · Centro de costo · Placa fabricante · Composición · N° Factura · Valor inicial · Moneda · Fecha de compra · Motivo de baja · Fecha de baja · Creado · Acciones. Links → `/dashboard/equipment/action?action=view&id=<id>&type=other`.
- [ ] Ocultas por defecto: manufacturer_plate, composition, invoice_number, initial_value, currency, purchase_date, cost_center, reason_for_termination, termination_date, created_at, certification_expiration_date, certification_number.
- [ ] Filtros facetados: Condición, Estado, Tipo de costo, Moneda, Motivo de baja, Tipo de contrato, Posee certificación, Tipo, Subtipo, Sector, Propietario, Centro de costo, Vinculado a, Marca, Modelo, Afectaciones.
- [ ] Filtros texto: N° Serie, N° Interno, Placa fabricante, N° Factura, Composición, Año, Horómetro, Valor inicial, N° de certificación.
- [ ] Filtros rango de fechas: Fecha de compra, Creado, Fecha de baja, Vencimiento de certificación.
- [ ] Visibles por defecto: Condición, Estado, Tipo.
- [ ] Búsqueda: "Buscar por N° Serie, N° Interno, placa..." (serial_number, intern_number, manufacturer_plate).
- [ ] Orden por defecto: `created_at desc`.
- [ ] Exportación: archivo `otros-equipos`, título "Listado de Otros Equipos"; respeta filtros.
- [ ] Sin selección múltiple ni acciones masivas.
- [ ] Acción por fila: link "Ver" a la ficha `&type=other`.
- [ ] Botón toolbar **Nuevo equipo** (variant brand, Plus; Link → `/dashboard/equipment/action?action=new&type=other`) — perm `equipos:others:create`.
- [ ] Vacío: "No hay equipos registrados". Carga: `OtherEquipmentTableSkeleton`.

## Dados de Baja — `?tab=equipos&subtab=inactive` (`&inactive_subtab=`)

- Componente: `Equipos/Equipos/DadosDeBaja/DadosDeBajaTabContent.tsx` (`TabsManagerServer`, `paramName="inactive_subtab"`, default `inactive_vehicles`). Las dos subtabs usan perm `equipos:inactive:view`.
- [ ] Subtab **Vehículos** (Car) — `&inactive_subtab=inactive_vehicles`
- [ ] Subtab **Otros Equipos** (Package) — `&inactive_subtab=inactive_others`

### Tabla Vehículos dados de baja — `&inactive_subtab=inactive_vehicles`
- Raíz: `DadosDeBaja/Vehiculos/InactiveVehicleList.tsx` → `components/_InactiveVehicleDataTable.tsx`; columnas `DadosDeBaja/Vehiculos/components/columns.tsx` · **DataTable nuevo** (`queryKey ['inactive-vehicles-list']`).
- [ ] Columnas: Dominio (link) · N° Interno (link) · Tipo · Subtipo · Marca · Modelo · Año · Condición · Estado · Kilómetros · Horómetro · Motivo de baja · Fecha de baja · Afectaciones (sin orden) · Chassis · Motor · Serie · Tipo de costo · Moneda · Precio · Tipo de contrato · N° Contrato · Inicio de contrato · Vencimiento de contrato · Centro de costo · Propietario · Sector · Creado · Acciones.
- [ ] Ocultas por defecto: chassis, engine, serie, sub_type, cost_type, currency, price, type_of_contract, contract_number, contract_start_date, contract_expiration_date, cost_center, owner, sector, created_at.
- [ ] Facetados: Motivo de baja, Condición, Estado, Tipo, Subtipo, Marca, Modelo, Tipo de costo, Moneda, Tipo de contrato, Sector, Propietario, Centro de costo, Afectaciones.
- [ ] Texto: Dominio, N° Interno, Chassis, Motor, Serie, N° Contrato, Año, Kilómetros, Horómetro, Precio.
- [ ] Fechas: Fecha de baja, Inicio de contrato, Vencimiento de contrato, Creado.
- [ ] Visibles por defecto: Condición, Motivo de baja, Tipo.
- [ ] Búsqueda: "Buscar por dominio, N° interno, chassis..." (domain, intern_number, chassis, engine, serie).
- [ ] Orden por defecto: `termination_date desc`, luego `created_at desc`.
- [ ] Exportación: `vehiculos-dados-de-baja`, título "Vehículos Dados de Baja".
- [ ] Sin botón de alta, sin selección ni acciones masivas. Acción por fila: link "Ver" → ficha.
- [ ] Vacío: "No hay vehículos dados de baja". Carga: `InactiveVehicleTableSkeleton`.

### Tabla Otros equipos dados de baja — `&inactive_subtab=inactive_others`
- Raíz: `DadosDeBaja/OtrosEquipos/InactiveOtherEquipmentList.tsx` (no recibe `permissions`) → `_InactiveOtherEquipmentDataTable.tsx`; columnas `DadosDeBaja/OtrosEquipos/components/columns.tsx` · **DataTable nuevo** (`queryKey ['inactive-other-equipment-list']`).
- [ ] Columnas: N° Serie (link) · N° Interno (link) · Tipo · Subtipo · Marca · Modelo · Año · Condición · Estado · Motivo de baja · Fecha de baja · Horómetro · Vinculado a · Afectaciones (sin orden) · Propietario · Sector · Tipo de costo · Centro de costo · Placa fabricante · Composición · N° Factura · Valor inicial · Moneda · Fecha de compra · Creado · Acciones (links `&type=other`).
- [ ] Ocultas por defecto: manufacturer_plate, composition, invoice_number, initial_value, currency, purchase_date, cost_center, cost_type, created_at.
- [ ] Facetados: Motivo de baja, Condición, Estado, Tipo, Subtipo, Marca, Modelo, Sector, Propietario, Centro de costo, Vinculado a, Afectaciones, Tipo de costo, Moneda.
- [ ] Texto: N° Serie, N° Interno, Placa fabricante, N° Factura, Composición, Año, Horómetro, Valor inicial.
- [ ] Fechas: Fecha de compra, Creado, Fecha de baja.
- [ ] Visibles por defecto: Motivo de baja, Condición, Tipo.
- [ ] Búsqueda: "Buscar por N° Serie, N° Interno, placa...".
- [ ] Orden por defecto: `created_at desc`.
- [ ] Exportación: `otros-equipos-dados-de-baja`, título "Listado de Otros Equipos Dados de Baja".
- [ ] Sin alta, sin selección. Vacío: "No hay equipos dados de baja". Carga: `InactiveOtherEquipmentTableSkeleton`.

## Documentos de Equipos — `?tab=documentos-de-equipos` (`&subtab=`)

- Componente raíz: `Equipos/DocumentosEquipos/DocumentosEquiposTabContent.tsx`. Las tablas y dialogs viven en `Documentacion/` y se detallan en **`documentacion.md`** (mismos componentes que `/dashboard/document`).
- [ ] Botonera superior `DocumentNav onlyEquipment` (→ `NewDocumentMulti`, carga multirecurso de equipos) — perm `equipos:documentos-de-equipos:create` (`PermissionGuardServer`).
- [ ] Subtab **Documentos Permanentes** (FileArchive) — `&subtab=docs-equipos-permanentes` (default) — perm `equipos:docs-equipos-permanentes:view` — `Documentacion/DocumentosEquipos/Permanentes/EquipmentPermanentDocumentsList` (fallback `EquipmentPermanentDocumentsSkeleton`).
- [ ] Subtab **Documentos Mensuales** (Calendar) — `&subtab=docs-equipos-mensuales` — perm `equipos:docs-equipos-mensuales:view` — `Documentacion/DocumentosEquipos/Mensuales/MonthlyEquipmentDocumentsList` (fallback `MonthlyEquipmentDocumentsSkeleton`).
- [ ] Columnas, filtros, export y acciones por fila (subir/reemplazar/renovar/ver/eliminar): ver `documentacion.md` → "Documentos de equipos".

## Tipos de Documentos — `?tab=tipos-de-documentos` (`&subtab=Equipos`)

- Componente raíz: `Documentacion/TiposDocumentos/TiposDocumentosTabContent.tsx` con `showOnlyEquipos` (solo la subtab **Equipos**, `TabsManagerServer paramName="subtab"`, default `Equipos`, perm `configuracion:tipos-docs-equipos:view`). Fallback del Suspense externo: `DataTableSkeleton columns={4}` (componente del sistema viejo `@/shared/components/data-table/base/`); interno `TiposDocumentosSkeleton`.
- Misma pantalla que Configuración → Documentos (`EmpresaComponent`), filtrada a Equipos.
- [ ] Botón **Crear tipo de documento** (Plus) en la barra de tabs — perm `configuracion:documentos:create` → abre `_DocumentTypeFormModal` (nuevo).

### Tabla Tipos de documentos de equipos
- Raíz: `TiposDocumentos/EquiposList/EquiposList.tsx` (`TABLE_ID='doc-types-equipos'`, Card) → `_EquiposDataTable.tsx`; columnas `TiposDocumentos/PersonasList/columns.tsx` → `getDocTypeColumns(includeEquipmentType=true, onEdit)` · **DataTable nuevo** (`queryKey ['doc-types','equipos']`).
- [ ] Columnas: Nombre · Obligatorio · Con vencimiento · Condicional · Multirrecurso · Mensual · Privado · Doc. de baja · Tipo de equipo · N° de Póliza · Estado (Activo/Inactivo) · Descripción (sin orden) · Fecha de creación · Acciones.
- [ ] Ocultas por defecto: multiresource, has_policy_number, is_it_montlhy, private, down_document, description.
- [ ] Facetados: Estado (Activo/Inactivo), Obligatorio, Con vencimiento, Condicional, Multirrecurso, N° de Póliza, Mensual, Privado, Doc. de baja (Sí/No con iconos), Tipo de equipo (labels de `getEquipmentTypeLabel`).
- [ ] Texto: Nombre. Fecha: Fecha de creación (rango).
- [ ] Visibles por defecto: Estado, Obligatorio, Con vencimiento, Condicional.
- [ ] Búsqueda: "Buscar por nombre...".
- [ ] Exportación: `tipos-documentos-equipos`, hoja "Tipos Documentos Equipos", título "Tipos de Documentos - Equipos"; booleanos Sí/No, Estado Activo/Inactivo, tipo de equipo con label, fecha DD/MM/YYYY.
- [ ] Sin selección múltiple.
- [ ] Acción por fila: botón lápiz "Editar" (ghost, sin chequeo de permiso en la columna) → `_DocumentTypeFormModal` en modo edición (`defaultApplies=Equipos`, recibe `permissionsMap`).
- [ ] Vacío: "No hay tipos de documentos".

### Dialog `_DocumentTypeFormModal` (crear / editar tipo)
- Título: "Nuevo Tipo de Documento" / "Editar Tipo de Documento".
- [ ] Nombre (*) — "El nombre es requerido".
- [ ] Aplica a (*) — select; deshabilitado al editar.
- [ ] Tipo de equipo — select, solo si Aplica a = Equipos.
- [ ] Opciones (checkboxes): Es obligatorio · Tiene vencimiento · Es mensual · Es privado · Documento de baja · (solo Persona) disponible para pre legajo · Es multirrecurso · (Equipos + multirrecurso) Lleva N° de póliza.
- [ ] Descripción (texto libre).
- [ ] Sección `_ConditionsSection`: switch "Documento condicional" + contador de condiciones; condiciones de equipo (`_EquipmentConditions`): Marca, Modelo, Tipo, Subtipo, Categoría Vehículo, Condición, Tipo de Costo, Tipo de Contrato, Clientes (multi-select con búsqueda).
- [ ] Contador "N equipo(s) coinciden con las condiciones configuradas" (con "Calculando coincidencias...").
- [ ] Validación: condicional sin condiciones → toast "Debe seleccionar al menos una condición" (no envía).
- [ ] Footer izq. (solo edición): botón **Desactivar** (destructive) / **Activar** → `_ToggleDocTypeDialog`; botón **Verificar documentos** (solo si editando + obligatorio + no mensual + perm `documentacion:tipos-docs-equipos:update`) → `_VerifyDocumentsDialog`.
- [ ] Footer der.: Cancelar · **Crear** / **Actualizar** ("Guardando..."). Toasts "Tipo de documento creado" / "Tipo de documento actualizado" / error con mensaje.

### Dialog `_ToggleDocTypeDialog` (AlertDialog)
- [ ] Título "Desactivar/Activar “<nombre>”"; carga impacto (skeletons); si falla, muestra error y deshabilita confirmar (botón "Cerrar").
- [ ] Desactivar: radio `deactivate_keep` · `deactivate_delete_empty` (si hay alertas vacías) · `hard_delete` "Eliminar permanentemente" (si `canHardDelete`, en rojo).
- [ ] Activar: radio `activate_recreate` · `activate_no_alerts`.
- [ ] Botón confirmar: "Desactivar" / "Eliminar permanentemente" / "Activar" ("Procesando..." con spinner). Toasts: desactivado / eliminado permanentemente / activado.

### Dialog `_VerifyDocumentsDialog`
- [ ] Título "Verificacion de Documentos"; estados: carga (`_VerifyDocumentsSkeleton`), error ("Error al verificar" + Reintentar), "Todo en orden".
- [ ] Cards "Alertas faltantes" y "Alertas sobrantes" con tablas (equipos: Dominio, N. Interno, Marca, Tipo).
- [ ] Botón **Corregir inconsistencias** (si hay) → AlertDialog "Confirmar correccion" ("Se crearan N alertas nuevas y se eliminaran M alertas vacias…") → Confirmar. Toast de éxito/error.

## Mantenimiento — `?tab=type_of_repairs` (`&subtab=`)

- Componente raíz: `Mantenimiento/TiposReparaciones/RepairTypes.tsx` (`moduleSlug="equipos"`; `TabsManagerServer paramName="subtab"`, default `equipments_with_deviations`). Solo se monta desde Equipos (`RepairTypes` no tiene otro consumidor). Es el pipeline viejo de mantenimiento: el módulo `/dashboard/maintenance` usa otros componentes.
- [ ] Subtab **Equipos con Desvíos** (AlertTriangle) — `&subtab=equipments_with_deviations` — perm `equipos:equipments_with_deviations:view`
- [ ] Subtab **Tipos de Reparación** (Settings) — `&subtab=type_of_repair` — perm `equipos:type_of_repair:view`
- [ ] Subtab **Grupos** (Users) — `&subtab=maintenance_groups` — perm `equipos:maintenance_groups:view`
- [ ] Subtab **Solicitudes de Mantenimiento** (ClipboardCheck) — `&subtab=maintenance_requests` — perm `mantenimiento:maintenance_requests:view`
- [ ] Subtab **Pedidos de Mantenimiento** (Calendar) — `&subtab=maintenance_orders` — perm `mantenimiento:maintenance_orders:view`
- [ ] Subtab **Operaciones** (Wrench) — `&subtab=maintenance_operations` — perm `mantenimiento:maint_operaciones:view`

### Equipos con Desvíos — `&subtab=equipments_with_deviations`
- Raíz: `Mantenimiento/EquiposConDesvios/EquiposConDesviosTabContent.tsx` → `EquiposConDesviosList.tsx` → `components/_EquiposConDesviosDataTable.tsx`; columnas `EquiposConDesvios/columns.tsx` · **DataTable nuevo**. Fallback `EquipmentsWithDeviationsSkeleton`.
- [ ] Columnas: Dominio (link a ficha) · Serie · N° Interno · Categoría · Tipo de Unidad · Subtipo de Unidad · Sector · Cantidad de Desvíos · Último Desvío · Acciones. Ninguna oculta por defecto.
- [ ] Facetados: Categoría, Tipo de Unidad, Subtipo de Unidad, Sector. Texto: Dominio, Serie, N° Interno. (Cantidad de Desvíos y Último Desvío sin filtro.)
- [ ] Visibles por defecto: Tipo de Unidad, Subtipo de Unidad, Sector.
- [ ] Búsqueda: "Buscar por dominio, serie, N° interno...".
- [ ] Orden: resuelto en memoria (`SORT_ACCESSORS`), no por `orderBy`.
- [ ] Exportación: `equipos-con-desvios`, título "Equipos con Desvíos Pendientes" (Último Desvío DD/MM/YYYY HH:mm).
- [ ] Acción por fila: botón **Resolver Desvíos** (outline, Wrench; sin chequeo de permiso) → carga desvíos pendientes sin solicitud (`getPendingDeviations(id, { onlyWithoutRequest: true })`) y abre `CriticalDeviationsRepairModal`; al cerrar/completar invalida la tabla. Si la carga falla solo se loguea (sin toast).
- [ ] Vacío: "No hay equipos con desvíos pendientes.".

### Tipos de Reparación — `&subtab=type_of_repair`
- Raíz: `TiposReparaciones/RepairTypeFormWrapper.tsx` (Card; preferencias de visibilidad/filtros desde **cookies** `repair-type-table`, `repair-type-table-filters`) → `RepairTypeForm.tsx`. Layout `ResizablePanelGroup` horizontal: panel izquierdo (30%) con el formulario, derecho con la tabla. Fallback `Skeleton h-[400px]`.
- Tabla: columnas en `RepairTypeForm.tsx` (`getRepairTypeColumns`) · Sistema: **BaseDataTable viejo** (`tableId="repair-type-table"`, datos completos client-side).
- [ ] Columnas: Nombre · Descripción · Criticidad · Estado · Tipo de Mantenimiento · Autorizable · Acciones (solo si `canUpdate`).
- [ ] Filtros (facetados, opciones calculadas de los datos): Nombre, Criticidad, Tipo de Mantenimiento, Autorizable.
- [ ] Acción por fila: link **Editar** → carga el registro en el form (y sus sectores de taller) — perm `equipos:type_of_repair:update`.
- [ ] Panel de formulario visible solo con perm `equipos:type_of_repair:create` **o** `:update` (si no, la tabla ocupa 100%).
- [ ] Form: Nombre del tipo de reparación (* "Debe ingresar un nombre") · Descripción (* mín. 3: "Intenta explicar con un poco más de detalle") · Nivel de criticidad (* Baja/Media/Alta) · Tipo de mantenimiento (* Preventivo/Correctivo/Otro) · Autorizable (switch) · Sectores de taller (checkboxes "sector - taller"; vacío: "No hay sectores disponibles").
- [ ] Botón **Crear tipo de reparación** (toast.promise "Creando tipo de reparación..." / "Tipo de reparación creado con éxito" / error). En edición: **Actualizar tipo de reparación** + **Eliminar** (AlertDialog "¿Estás seguro de que deseas eliminar este tipo de reparación?" con aviso de pérdida de solicitudes relacionadas; botones "Cancel" / "Eliminar" → "Eliminando..."; toast "Tipo de reparación eliminado con éxito"). Eliminar no chequea permiso `delete`.

### Grupos — `&subtab=maintenance_groups`
- Raíz: `TiposReparaciones/MaintenanceGroupsWrapper.tsx` (Card; cookies `maintenance-groups-table`, `maintenance-groups-table-filters`) → `MaintenanceGroupsClient.tsx` (Resizable: form 30% + tabla) → `MaintenanceGroupForm.tsx` + `MaintenanceGroupsTable.tsx`. Monta además un `<Toaster />` propio (sistema `use-toast` viejo), aunque el form usa `sonner`.
- Tabla: **BaseDataTable viejo**, título "Grupos de Reparación".
- [ ] Columnas: Nombre · Tipos de reparación · Descripción · Estado · Acciones (si `canEdit`).
- [ ] Filtros: Nombre, Tipos de reparación, Estado.
- [ ] Acción por fila: **Editar** → carga el grupo en el form — perm `equipos:maintenance_groups:update`.
- [ ] Panel de form visible con perm `equipos:maintenance_groups:create` o `:update`.
- [ ] Form: Nombre del grupo (* "El nombre es requerido") · Descripción · Tipos de reparación asociados (`MultiSelectCombobox`, "Seleccione tipos de reparación") · Estado (radio Activo/Inactivo).
- [ ] Botones: **Crear** / **Editar** (variant brand) + **Limpiar** (modo crear) / **Cancelar** (modo edición). Toasts promise "Creando grupo..." / "Grupo de reparación creado con éxito" / "Error al crear el grupo" (y equivalentes de edición).

### Solicitudes de Mantenimiento — `&subtab=maintenance_requests`
- Raíz: `Mantenimiento/SolicitudesMantenimiento/SolicitudesMantenimientoTabContent.tsx` (se llama **sin** `searchParams`) → `MaintenanceRequestList` con `canApproveReject` → `_MaintenanceRequestDataTable.tsx`; columnas `tableColumns.tsx` · **DataTable nuevo** (`queryKey ['maintenance-requests-paginated']`). Fallback `SolicitudesTableSkeleton`.
- [ ] Columnas: Fecha Solicitud · Equipo · Legajo · Chofer · Supervisor ("Sin asignar") · Origen · Desvíos · Kilometraje · Horas Motor · Estado · acciones.
- [ ] Acciones por fila (iconos con title): Ver detalle · Ver historial · Aprobar · Rechazar · Reasignar supervisor.
- [ ] Búsqueda "Buscar solicitudes..."; vacío "No hay solicitudes de mantenimiento".
- Detalle de filtros/dialogs: inventariar en el módulo Mantenimiento (mismo componente que usa `OperacionesPipelineContent`).

### Pedidos de Mantenimiento — `&subtab=maintenance_orders` (`&pedidos_tab=`)
- Raíz: `Mantenimiento/PedidosMantenimiento/PedidosMantenimientoTabContent.tsx` (`TabsManagerServer paramName="pedidos_tab"`, default `pendientes`). **Se monta sin `searchParams` ni `permissions`** → ver rarezas al final.
- [ ] Subtab **Pendientes** (`pendientes`, perm `mantenimiento:pedidos_pendientes:view`) — `_PendingOrderDataTable` · DataTable nuevo · columnas Nro. Pedido, Equipo, Descripción, Items, Origen, Fecha Aprobación, Fecha Planificada ("Sin planificar"), Estado; acciones Ver detalle, Ver historial, Planificar fecha, Rechazar pedido; búsqueda "Buscar por equipo (dominio, serie) o nro. pedido..."; export `pedidos-pendientes`; vacío "No hay pedidos pendientes".
- [ ] Subtab **Confirmados** (`confirmados`, perm `mantenimiento:pedidos_confirmados:view`) — `_ConfirmedOrderDataTable` · DataTable nuevo · columnas Equipo, Condición Actual, Fecha Aprobación, Fecha Planificada (badges "Hoy"/"Vencido"); acciones Ver detalle, Ver historial, Aprobar Entrada a Taller; búsqueda "Buscar por dominio, serie..."; export `pedidos-confirmados`; vacío "No hay pedidos confirmados".
- [ ] Estado "Sin acceso — No tienes permisos para ver ninguna pestaña en esta sección." cuando no hay subtabs visibles (comportamiento genérico de `TabsManagerServer`).

### Operaciones — `&subtab=maintenance_operations` (`&operations_tab=`)
- Raíz: `Mantenimiento/Operaciones/OperacionesTabContent.tsx` (`TabsManagerServer paramName="operations_tab"`, default `operations_pending`; precarga `getMaintenanceOperations` + `getOrdersForWorkshop`). Fallback `OperacionesTableSkeleton`.
- [ ] Subtab **Pendientes de Ejecutar** (Clock, perm `mantenimiento:pendientes_ejecutar:view`) — `OperacionesTableClient` · **BaseDataTable viejo** · columnas Equipo, Condición Actual, Fecha Planificada (Hoy/Vencido), Km Actual; acciones Ver detalle, Ver historial, Aprobar entrada a taller, Rechazar.
- [ ] Subtab **Planificadas (Vista)** (Eye, perm `mantenimiento:maintenance_orders:view`) — `OperacionesPlanificadasTableClient` · **BaseDataTable viejo** · solo lectura (`columnsReadonly`): Equipo, Condición Actual, Estado, Fecha Planificada, Km Actual; Ver detalle, Ver historial.
- [ ] Subtab **Para Taller** (Warehouse, perm `mantenimiento:para_taller:view`) — `ParaTallerTableClient` · **BaseDataTable viejo** · Equipo, Condición Actual, Fecha Planificada, Km Actual; Ver detalle, Ver historial.

## Ficha de vehículo — `/dashboard/equipment/action?action=view|edit|new&id=<id>` (`&tab=`)

- Página: `src/app/dashboard/equipment/action/page.tsx` (rama "VEHÍCULOS", cuando no hay `type=other`). Contenedor `<div className="p-6 space-y-6"><Card className="p-4">`.
- Modo por `action` (default `view`); `new` sin id. Si `getVehicleById` falla → `notFound()` (404).
- `generateMetadata`: "Nuevo Equipo" (new) · "Equipo - <dominio|serie>" · "Equipo no encontrado".
- Precarga server: órdenes de mantenimiento + solicitudes rechazadas (para la tab Historial). Loading de ruta: `action/loading.tsx`.

### Encabezado — `EquipoID/components/vehicle-header.tsx` (no se muestra en `new`; fallback `VehicleHeaderSkeleton`)
- [ ] En `new`: solo `BackButton` arriba a la derecha.
- [ ] Foto del equipo (o placeholder), título = dominio (o "Nuevo Equipo").
- [ ] Condición: badge con variante + icono. Si la condición es **En preparación** y el usuario tiene perm `equipos:detalle-equipo:update`: select (borde punteado) que solo permite pasar a **Operativo** → `updateEquipmentCondition(id,'operativo','vehicles')`, toast "Equipo actualizado a Operativo" / "Error al actualizar la condición", `router.refresh()`.
- [ ] Botón **Editar** (modo view) → `?action=edit` — perm `equipos:detalle-equipo:update`.
- [ ] Botón **Cancelar** (modo edit, sin permiso) → `?action=view` + reset del form (`useVehicleFormReset`).
- [ ] Menú ⋯ `VehicleQuickActions` — perm `equipos:detalle-equipo:update` (ver abajo).
- [ ] `BackButton` (separador vertical antes).
- [ ] Datos: Año · Tipo · Subtipo · N° Interno · Estado (badge **Activo** / **Dado de Baja**).
- [ ] Si tiene baja: "Fecha de Baja:" (`toLocaleDateString`) y "Razón de Baja:" (valor crudo del enum).

### Menú ⋯ — `EquipoID/components/vehicle-quick-actions.tsx` (no renderiza en `new`)
- [ ] Activo → ítem **Dar de Baja Equipo** (rojo, Truck) → AlertDialog "¿Dar de baja equipo?" ("Esta acción dará de baja al equipo. Podrás reactivarlo más tarde si es necesario.") con form:
  - [ ] Motivo de Baja (*) — select: venta · destrucción total · devolución · otro ("La razón de baja es requerida.").
  - [ ] Fecha de Baja (*) — popover con calendario (solo calendario, sin escritura; deshabilita futuras y < 1900; formato `date-fns` `P` es) ("La fecha de baja es requerida.").
  - [ ] Botones **Dar de baja** ("Dando de baja...") y Cancelar → `toggleVehicleStatus(id,false,'no_operativo',motivo,fecha)`, toast "Equipo dado de baja correctamente" / "Error al dar de baja al equipo", `router.refresh()`.
- [ ] Inactivo → ítem **Activar Equipo** (verde) → AlertDialog "¿Activar equipo?" ("Esta acción activará al equipo y podrá acceder al sistema.") → **Activar** ("Activando...") → `toggleVehicleStatus(id,true,condición)`, toast "Equipo activado correctamente".

### Pestañas — `EquipoID/components/vehicle-tabs.tsx` (`TabsManagerClientSide`, `paramName="tab"`, default `basicData`; filtra por permisos en cliente con `usePermissions().canView`; skeleton mientras cargan los permisos; "Sin acceso" si no queda ninguna)
- [ ] **Datos Básicos** — `tab=basicData` — perm `equipos:datos-basicos:view` — punto rojo si hay errores en sus campos.
- [ ] **Asignación** — `tab=assignmentData` — perm `equipos:asignacion:view` — punto rojo si hay errores.
- [ ] **Documentos** — `tab=documents` — perm `documentacion:documentos-de-equipos:view` — deshabilitada en `new`.
- [ ] **QR** — `tab=qr` — perm `equipos:qr-equipo:view` — habilitada también en `new`.
- [ ] **Historial de Mantenimiento** — `tab=operations` — perm `equipos:historial-mantenimiento-equipo:view` — deshabilitada en `new`.
- [ ] **Checklist** — `tab=checklists` — perm `equipos:checklist-equipo:view` — deshabilitada en `new`.
- [ ] **Cubiertas** — `tab=tires` — perm `equipos:cubiertas-equipo:view` — deshabilitada en `new`.
- [ ] Grilla de tabs: `grid-cols-8` + clase dinámica según cantidad visible.

### Formulario del vehículo — `EquipoID/components/vehicle-form.tsx` (envuelve todas las pestañas en un solo `<Form>`)
- Schema: `EquipoID/schemas/vehicle.ts` (`vehicleFormSchema`) + refinamiento async "El dominio ya existe" (solo en alta, consulta `isVehicleDomainTaken`).
- [ ] Botón de envío (solo modo edit/new), debajo de las pestañas: **Agregar equipo** (new) / **Guardar cambios** (edit) → "Guardando..."; tooltip "¡Todo listo para guardar!" / "Completa todos los campos requeridos". Candado contra doble submit (queda deshabilitado hasta volver a modo lectura).
- [ ] Alta → `createVehicle` → toast "Equipo creado correctamente" → navega a `?action=view&id=<nuevo>`. Edición → `updateVehicle` → "Equipo actualizado correctamente" → `?action=view`. Error → toast con el mensaje del servidor o "Error al crear/actualizar el equipo".
- [ ] La fecha de certificación viaja como `YYYY-MM-DD` (o null si no tiene certificación).

#### Datos Básicos — `EquipoID/forms/vehicle-basic-data-form.tsx` (grilla 1/2 columnas; todos `disabled` en view)
- [ ] Foto del equipo (solo edit/new): subir imagen (input file oculto, se guarda como dataURL) y quitar.
- [ ] Tipo de equipo (*) — combobox con búsqueda "Buscar tipo de equipo..."; solo ofrece "Vehículos" (id 1).
- [ ] Dominio del equipo — input (obligatorio por schema para vehículos aunque el label no lleva `*`); validación por año: ≤2015 `AAA000`/`AAA00`, ≥2017 `AA000AA`/`AAA00`, 2016 cualquiera; mensajes "El dominio debe tener el formato … (verificar año)"; en alta "El dominio ya existe".
- [ ] Marca (*) — combobox "Buscar marca..."; al cambiar resetea Modelo y recarga modelos.
- [ ] Modelo (*) — combobox "Buscar modelo..."; deshabilitado sin marca o mientras carga.
- [ ] Año (*) — input; "El año es requerido" / "El año debe ser mayor a 1900 y menor al año actual".
- [ ] Motor del equipo — input.
- [ ] Tipo (`*` en label) — combobox "Buscar tipo..."; al cambiar resetea Subtipo.
- [ ] Sub Tipo de Unidad (`*` en label) — combobox "Buscar subtipo..."; deshabilitado sin tipo.
- [ ] Chasis del equipo — input; schema exige 2-30 caracteres para vehículos ("El chasis debe tener entre 2 y 30 caracteres").
- [ ] Serie del equipo — oculto para vehículos.
- [ ] Kilometraje (number ≥0) · Horómetro (number ≥0).
- [ ] Tipo de Contrato — combobox (Leasing/Alquiler/Propio/Prendado); al cambiar limpia Propietario y filtra propietarios por tipo de contrato (Propio = todos).
- [ ] Propietario — combobox "Buscar propietario..." (oculto si contrato = Propio).
- [ ] Fecha de inicio del <contrato> / Fecha de vencimiento del <contrato> — popover con calendario (sin escritura), mutuamente acotadas, rango de años actual-1 a +10; solo si contrato ≠ Propio y elegido.
- [ ] Número de Contrato — input.
- [ ] Posee certificación — checkbox; al destildar limpia fecha y número.
  - [ ] Fecha de Vencimiento de la Certificación — `Input type="date"` (*) si tilda — "La fecha de vencimiento de la certificación es requerida".
  - [ ] Número de Certificación (*) si tilda — "El número de certificación es requerido".
- [ ] Valor del equipo — `PriceCurrencyInput` (precio > 0 "El precio debe ser mayor a 0" + moneda USD/EUR/GBP/ARS, default USD).
- [ ] Número interno del equipo — input.

#### Asignación — `EquipoID/forms/vehicle-assignment-data-form.tsx`
- [ ] Centro de costo — select "Seleccionar centro de costo".
- [ ] Tipo de costo (*) — select Directo/Indirecto ("El tipo de costo es requerido").
- [ ] Sector (*) — select de posiciones jerárquicas "Seleccionar sector".
- [ ] Card **Asignación a Contratistas**: en edición, checkboxes de todos los clientes; en view, badges de los asignados o "No hay contratistas asignados".

### Documentos — `tab=documents` (`&subtab=permanentes|mensuales`)
- Componente: `EquipoID/components/equipment-document-detail.tsx` (Server; `TabsManagerServer paramName="subtab"`, default `permanentes`). Tablas y dialogs: ver **`documentacion.md`** (mismos componentes, filtrados por `equipmentId`).
- [ ] Subtab **Documentos Permanentes** (perm `documentacion:docs-equipos-permanentes:view`) → `EquipmentPermanentDocumentsList equipmentId`.
- [ ] Subtab **Documentos Mensuales** (perm `documentacion:docs-equipos-mensuales:view`) → `MonthlyEquipmentDocumentsList equipmentId`.
- [ ] Encima de cada tabla: `DocumentNav onlyEquipment onlyNoMultiresource` dentro de `PermissionGuardServer documentacion:documentos-de-equipos:create` — hoy **no renderiza ningún botón** (con `onlyNoMultiresource` no muestra `NewDocumentMulti`); la subida individual está en el botón "Subir documento" de cada tabla (`SimpleDocument`).

### QR — `tab=qr`
- Componente: `EquipoID/components/vehicle-qr.tsx`.
- [ ] Código QR (300px, nivel H) a `<NEXT_PUBLIC_BASE_URL>/maintenance?equipment=<id>`.
- [ ] Botones **Descargar** (PNG `qr-code<dominio|serie>.png`), **Imprimir** (iframe oculto), **Copiar url** (toast "URL copiada al portapapeles").
- [ ] Texto "Información del QR" con lista de usos y aviso verde sobre cómo escanearlo.

### Historial de Mantenimiento — `tab=operations` (`&mant_subtab=orders|rejected`)
- Componente: `EquipoID/components/vehicle-operations-history.tsx` (`TabsManagerClientSide paramName="mant_subtab"`, default `orders`; sub-tabs sin permiso propio).
- [ ] Sub-tab **Órdenes de Mantenimiento** — tabla **BaseDataTable viejo** (`tableId="equipment-operations-history"`, datos de React Query `['equipment-maintenance-orders', id]` con `initialData` del server).
  - [ ] Columnas: N° Orden · Estado (badge) · Ingreso · Creada · Sectores (badges por sector con tooltip de progreso; "Sin asignar") · Items (sin diagnóstico) · OTs · Progreso (barra + %) · Acciones.
  - [ ] Filtro facetado: Estado (opciones de los datos), visible por defecto. Opciones de vista habilitadas.
  - [ ] Acciones por fila: **Detalle** (Eye) → `EquipmentOrderDetailDialog`; botón historial (tooltip "Ver historial completo") → `ActivityHistoryModal` "Historial Completo".
  - [ ] Vacío: card "No hay ordenes de mantenimiento para este equipo".
  - [ ] `EquipmentOrderDetailDialog` (solo lectura): título con N° de orden + botón historial; Ingreso / Creada / Cerrada / Fuente; "Secuencia de Sectores" (`SectorTimeline` + `ReadonlySectorCard` con tareas, bloque DIAGNOSTICO "Bloquea tareas restantes", "Sin tareas asignadas"); "Sin sectores asignados"; "Informacion de Validaciones" (Validado por Jefe de Taller / por Operaciones) + `ValidationHistoryTimeline`.
- [ ] Sub-tab **Solicitudes Rechazadas** — `rejected-requests/VehicleRejectedRequestsTable.tsx` · **DataTable nuevo en memoria** (`inMemory`, `tableId`/`paramNamespace` `equipment-rejected-requests`).
  - [ ] Columnas (`rejected-requests/columns.tsx`): Fecha de Rechazo · Tipo de Rechazo · Origen · Rechazado por · Motivo · Ítems Rechazados ("Solicitud completa") · Descripción · Supervisor ("Sin asignar") · Tipo Preventivo. Ocultas por defecto: Descripción, Supervisor, Tipo Preventivo.
  - [ ] Filtros: Tipo de Rechazo, Origen, Rechazado por (facetados), Motivo (texto "Buscar en el motivo...").
  - [ ] Búsqueda "Buscar por motivo, ítems u origen...".
  - [ ] Export `solicitudes-rechazadas` (hoja "Solicitudes Rechazadas", título "Solicitudes de Mantenimiento Rechazadas"; fecha DD/MM/YYYY, Total/Parcial, Checklist/Manual/Preventivo).
  - [ ] Sin acciones por fila. Carga: skeleton. Vacío: card "Este equipo no tiene solicitudes de mantenimiento rechazadas".

### Checklist — `tab=checklists`
- Componente: `EquipoID/components/vehicle-checklists-tab-content.tsx` (React Query `['equipment-checklist-answers', id]` y `['equipment-pending-deviations', id]`).
- [ ] Carga: texto "Cargando checklists...".
- [ ] Si hay desvíos pendientes: `PendingDeviationsAlert` arriba.
- [ ] Vacío: card "No hay respuestas de checklist para este equipo.".
- [ ] Card "Historial de Checklists (N)" con tabla **manual** (`<Table>` shadcn, sin filtros/orden/paginación/export): Fecha (DD/MM/YYYY HH:mm) · Checklist (nombre + descripción) · Resultado (Bueno verde / Malo rojo / Sin resultado) · Items Críticos Fallidos ("N item(s)" + resumen, o "Ninguno") · Unidad Tractor (botón-link a la ficha del tractor "dominio - interno") · Realizado por ("Usuario desconocido") · Observaciones (truncada con title) · Acciones.
- [ ] Acción por fila: **Ver** → abre `/dashboard/forms/<answerId>/view` en pestaña nueva.

### Cubiertas — `tab=tires`
- Componente: `EquipoID/components/vehicle-tires/vehicle-tires-tab.tsx` (Server; `canUpdate = equipos:cubiertas-equipo:update`).
- [ ] **Configuración de Cubiertas** — `vehicle-tire-diagram-section.tsx` (React Query plantilla + posiciones; `DiagramSkeleton` al cargar).
  - [ ] Sin configuración: "Este equipo no tiene configuración de cubiertas." + **Crear configuración personalizada** (si `canUpdate`) + **Ir a Plantillas** (link `/dashboard/maintenance?tab=gomeria&subtab=plantillas`, sin permiso).
  - [ ] Con configuración: título + nombre de plantilla + badge **Personalizada** / **Heredada de <subtipo>**; diagrama `TireDiagramRenderer` (solo lectura) con serial/marca/medida por posición; "No hay posiciones configuradas en esta plantilla.".
  - [ ] Botón **Editar** (si `canUpdate`): si hereda del subtipo abre AlertDialog "Crear configuración personalizada" (Cancelar / **Crear configuración propia**); si es propia abre el editor.
  - [ ] Botón **Restablecer** (si `canUpdate`, override y el subtipo tiene plantilla) → AlertDialog "Restablecer configuración" (advierte sobre cubiertas instaladas) → **Restablecer** ("Restableciendo...") → toast "Configuración restablecida al sub-tipo" / error.
- [ ] **Editor de ejes** (Sheet) — `vehicle-axle-editor.tsx`: título "Crear/Editar configuración de cubiertas"; `AxleConfigurator` (grilla por eje: Eje · Tipo Simple (1)/Dual (2) · Medida "Ej: 295/80R22.5 (opcional)" · checkbox Tractor · checkbox Auxilio (fuerza 1 por lado) · quitar eje; botones **Agregar eje** y **Agregar auxilio**; vacío "No hay ejes configurados. Agregue al menos un eje."); "Vista previa" del diagrama; Cancelar / **Crear configuración** | **Guardar cambios** ("Guardando..."). Validación: sin ejes → toast "Debe configurar al menos un eje.". Toasts de éxito/error de creación/actualización.
  - [ ] Si el cambio deja cubiertas sin posición → `DisplacedTiresDialog` "Neumáticos desplazados": por cada cubierta (serial, marca, "Posición N") radio Disponible / Reparación / Descarte; **Confirmar** deshabilitado hasta elegir todas.
- [ ] **Medidas de cubierta** — `vehicle-axle-sizes-form.tsx` (si la plantilla tiene ejes): "Configurá la medida específica para cada eje. Si dejás un eje vacío, hereda de la plantilla."; por eje: número, badges (tracción/auxilio), "Plantilla: <medida>", input de medida, botón limpiar override (title "Limpiar override (volver a heredar)"), badge "Sin configurar"; **Guardar medidas** (solo si hay cambios; "Guardando...") → toast "Medidas actualizadas correctamente" / error. Badge de override geométrico.
- [ ] **Historial de Órdenes de Gomería** — `vehicle-tire-orders-list.tsx` → `vehicle-tire-orders/_VehicleTireOrdersDataTable.tsx` · **DataTable nuevo** (`queryKey ['vehicle-tire-orders', id]`, `tableId`/`paramNamespace` `vehicle-tire-orders`). Fallback `VehicleTiresSkeleton ordersOnly`.
  - [ ] Columnas: Fecha · Kilómetros · Estado · Intervenciones · Creado por · Cerrado · Acciones.
  - [ ] Filtros: Estado, Creado por (facetados) · Fecha, Fecha cierre (rango) · Kilómetros (texto).
  - [ ] Búsqueda "Buscar por kilómetros..."; orden por defecto `service_date desc`.
  - [ ] Export `ordenes-gomeria-equipo`, título "Historial de Órdenes de Gomería".
  - [ ] Acción por fila: **Ver detalle** → `ServiceOrderDetailView` (módulo Gomería).
  - [ ] Vacío "No hay órdenes de gomería para este equipo.".

## Ficha de otro equipo (equipamiento) — `/dashboard/equipment/action?type=other&action=view|edit|new&id=<id>` (`&tab=`)

- Página: `src/app/dashboard/equipment/action/page.tsx` (rama `type=other`). Contenedor `p-6` + `Card p-4`.
- Si `getOtherEquipmentById` falla → `notFound()`. Modo `new` si `action=new` o sin id.
- `generateMetadata`: "Nuevo Otro Equipo" · "Equipo - <serie|interno|Sin identificador>" · "Equipo no encontrado".
- Precarga server: catálogos (marcas, tipos `other_equipment`, propietarios, modelos, subtipos, clientes, centros de costo, posiciones jerárquicas, vehículos para vincular) y certificaciones del equipo.

### Encabezado — `OtherEquipment/components/OtherEquipmentHeader.tsx` (no en `new`; fallback `OtherEquipmentHeaderSkeleton`)
- [ ] En `new`: solo `BackButton`.
- [ ] Ícono Package (sin foto), título = N° serie o N° interno ("Equipo sin identificador"), subtítulo "Tipo / Subtipo" ("Sin tipo").
- [ ] Botón **Editar** (view) → `?action=edit` — perm `equipos:detalle-otro-equipo:update`. **Cancelar** (edit, sin permiso) → `?action=view`.
- [ ] Menú ⋯ `OtherEquipmentQuickActions` — perm `equipos:detalle-otro-equipo:update`.
- [ ] `BackButton`.
- [ ] Datos: Año · N° Serie · N° Interno · Condición (si **En preparación** y perm update → select para pasar a **Operativo**, toast "Equipo actualizado a Operativo"; si no, badge) · Estado (Activo / Dado de Baja).
- [ ] Si tiene baja: "Fecha de Baja:" (DD/MM/YYYY) y "Razón de Baja:" (label del mapper).

### Menú ⋯ — `OtherEquipment/components/OtherEquipmentQuickActions.tsx`
- [ ] Activo → **Dar de Baja Equipo** → AlertDialog "¿Dar de baja el equipo?": Motivo de Baja (*) venta/destrucción total/devolución/otro · Fecha de Baja (*) popover calendario (formato `moment LL`, sin futuras) · **Dar de baja** / Cancelar. Toast "Equipo dado de baja correctamente" / error.
- [ ] Inactivo → **Activar Equipo** → AlertDialog "¿Activar equipo?" → toast "Equipo activado correctamente" / "Error al activar el equipo".

### Pestañas — `OtherEquipment/components/OtherEquipmentTabs.tsx` (`TabsManagerClientSide paramName="tab"`, default `basicData`, grid según cantidad)
- [ ] **Datos Básicos** — `basicData` — perm `equipos:datos-basicos-otro:view` — indicador de error.
- [ ] **Asignación** — `assignmentData` — perm `equipos:asignacion-otro:view` — indicador de error.
- [ ] **Documentos** — `certifications` — perm `equipos:certificaciones-otro:view` — deshabilitada en `new`.
- [ ] **Mantenimiento** — `maintenance` — perm `mantenimiento:ordenes_mantenimiento:view` — deshabilitada en `new`.
- [ ] **QR** — `qr` — perm `equipos:qr-otro-equipo:view` — **solo si el tipo tiene `generates_qr`** y hay id.

### Formulario — `OtherEquipment/components/OtherEquipmentForm.tsx`
- Schema local (`otherEquipmentBaseSchema` + `superRefine` async): certificación obligatoria si se tilda; duplicados de N° de serie / N° interno (`checkOtherEquipmentDuplicates`, excluye el propio en edición) con el mensaje que devuelve el servidor.
- [ ] Botón submit (edit/new): **Agregar equipo** / **Guardar cambios** ("Guardando..."), tooltip de validez. Toasts "Equipo creado correctamente" / "Equipo actualizado correctamente" / error del servidor o "Error al crear/actualizar el equipo". Tras guardar: `?action=view&id=…`.
- [ ] La condición NO se edita desde el form.

#### Datos Básicos — `OtherEquipmentBasicDataForm.tsx`
- [ ] Tipo (*) — combobox "Buscar tipo..." ("El tipo es requerido").
- [ ] Sub Tipo — combobox "Buscar subtipo..." (deshabilitado sin tipo).
- [ ] Marca — combobox "Buscar marca..." · Modelo — combobox "Buscar modelo..." (deshabilitado sin marca).
- [ ] N° de Serie · N° Interno (validación de duplicados).
- [ ] Año ("Ej: 2022") · Horómetro ("Horas de uso").
- [ ] Placa del Fabricante · Composición · N° de Factura.
- [ ] Valor Inicial — `PriceCurrencyInput` (moneda USD/ARS, default ARS).
- [ ] Fecha de Compra — `Input type="date"`.
- [ ] Tipo de Contrato — combobox (Leasing/Alquiler/Propio/Prendado).
- [ ] Propietario, Fecha de Inicio del Contrato, Fecha de Vencimiento del Contrato (`type="date"`) — solo si hay contrato y no es Propio. Número de Contrato.
- [ ] Posee certificación (checkbox) → Fecha de Vencimiento de la Certificación (`type="date"`, *) y Número de Certificación (*).
- [ ] Vehículo Vinculado — combobox "Buscar por dominio..." con opción "Sin vincular"; "No se encontraron vehículos"; descripción "Vincula este equipo a un vehículo (opcional)".
- [ ] (Solo con id y no `new`) sección **Fotos** "Imágenes del equipo (máx. 4)" y sección **Planos** "Documentos técnicos y planos del equipo" — `OtherEquipmentFileUpload` (ver abajo).

#### `OtherEquipmentFileUpload` (fotos `image/*` máx. 4 · planos `.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.dwg,.dxf` sin máximo)
- [ ] Subida inmediata (no espera al submit), tope 10MB ("El archivo no puede superar los 10MB"), "No puedes agregar más de N …", "Subiendo...".
- [ ] Botón **Agregar foto/plano**, eliminar por archivo (`aria-label "Eliminar <archivo>"`, con AlertDialog "¿Eliminar esta foto/este plano?"), contador "N de M fotos", aviso "Límite de 4 fotos alcanzado".
- [ ] En modo view (`readOnly`) solo muestra; sin permisos propios.

#### Asignación — `OtherEquipmentAssignmentForm.tsx`
- [ ] Centro de Costo · Tipo de Costo (Directo/Indirecto) · Sector — selects, **ninguno obligatorio** (a diferencia de vehículos).
- [ ] Card **Asignación a Contratistas**: checkboxes (edit) / badges o "No hay contratistas asignados" (view).

### Documentos — `tab=certifications`
- Componente: `OtherEquipment/components/OtherEquipmentCertifications.tsx` (no usa el módulo Documentación: documentos propios del equipamiento).
- [ ] Título "Documentos" + botón **Agregar documento** (Plus; sin permiso y visible también en modo view) → Dialog "Nuevo Documento": Nombre (*) "Nombre del documento" · Archivo (máx. 10MB) · Fecha de vencimiento (popover calendario "Seleccionar fecha") → Cancelar / **Crear documento** ("Subiendo..."). Toast "Documento creado correctamente" / error.
- [ ] Lista de cards por documento: nombre, "Vence:" badge (rojo si vencido; fecha `LL`), link **Ver archivo** (pestaña nueva), botón eliminar (Trash, sin permiso) → AlertDialog "¿Eliminar documento?" → toast "Documento eliminado correctamente".
- [ ] Vacío: "No hay documentos registrados".

### Mantenimiento — `tab=maintenance`
- Componente: `OtherEquipment/maintenance/OtherEquipmentMaintenanceTable.tsx` · **DataTable nuevo en memoria** (`inMemory`, `tableId="other-equipment-maintenance"`, React Query `['other-equipment-maintenance-orders', id]`).
- [ ] Columnas (`maintenance/columns.tsx`): N° Orden · Estado · Origen · Fecha Planificada · Ingreso a Taller · Reparaciones · Creada · Descripción. Ocultas por defecto: Creada, Descripción.
- [ ] Filtros: Estado, Origen (facetados). Búsqueda "Buscar por N° de orden…".
- [ ] **Sin exportación** y sin acciones por fila.
- [ ] Error: "No se pudo cargar el historial de mantenimiento." + **Reintentar**. Vacío: "Sin órdenes de mantenimiento" + "Acá vas a ver las órdenes de este equipamiento. Se generan desde Mantenimiento → Nuevo Pedido, eligiendo el camino Equipamientos." Filtros sin resultados: "Sin resultados para los filtros aplicados".

### QR — `tab=qr` (solo tipos con `generates_qr`)
- Componente: `OtherEquipment/components/OtherEquipmentQr.tsx`.
- [ ] QR a `<NEXT_PUBLIC_BASE_URL>/maintenance?equipment=<id>`; botones **Descargar** (`qr-code-<serie|interno>.png`; error "Error al descargar el código QR"), **Imprimir**, **Copiar url** ("URL copiada al portapapeles"); bloque "Información del QR" igual al de vehículos.

## Rarezas encontradas (no se arreglan en el rediseño: se anotan en PLAN §9 y se avisa)

- [ ] **Pedidos de Mantenimiento (Equipos → Mantenimiento) siempre muestra "Sin acceso"**: `RepairTypes` monta `<PedidosMantenimientoTabContent />` sin `permissions` ni `searchParams`; su `TabsManagerServer` recibe `{}` y filtra todas las subtabs.
- [ ] `SolicitudesMantenimientoTabContent` también se monta sin `searchParams` (el SSR ignora filtros/página de la URL).
- [ ] **"Verificar documentos" nunca aparece** en el modal de tipo de documento: chequea `documentacion:tipos-docs-equipos:update`, pero ese slug vive en el módulo `configuracion`.
- [ ] Botón "Crear tipo de documento" desde Equipos no pasa `defaultApplies=Equipos` (el modal arranca con el default general).
- [ ] Botón "Editar" de la tabla de tipos de documentos sin chequeo de permiso en la columna.
- [ ] Form de vehículo, `getVehicleTypeFields` compara `typeOfVehicle === 'Vehículos'` pero el valor es `'1'`: `isVehicle` siempre es false → el segundo campo Dominio (con mayúsculas automáticas y `*`) nunca se muestra; se ve el primero (sin `*` y sin pasar a mayúsculas) aunque el schema lo exige; Chasis sin `*` pero obligatorio; Tipo/Subtipo con `*` pero no obligatorios para vehículos.
- [ ] Schema de vehículo: `sector: z.string()` acepta `''` → "Sector (*)" no es realmente obligatorio. Mensaje de año "menor al año actual" pero acepta el año actual.
- [ ] Ficha de vehículo: tab QR habilitada en `new` (genera QR a `?equipment=undefined`).
- [ ] Ficha de vehículo → Documentos: el `DocumentNav onlyNoMultiresource` no renderiza nada (contenedor vacío con `mb-4`).
- [ ] Permisos cruzados: la tab Documentos de la ficha usa `documentacion:*`, mientras la tab Documentos de Equipos del listado usa `equipos:documentos-de-equipos`. La tab Mantenimiento de otro equipo usa `mantenimiento:ordenes_mantenimiento`.
- [ ] `vehicle-quick-actions.tsx`: usa `date-fns` (`format`, locale `es`) — regla del proyecto: moment. Textos copiados de empleados: "Elige la razón por la que deseas dar de baja al empleado", "podrá acceder al sistema" (también en otro equipo).
- [ ] Header de vehículo: "Razón de Baja" muestra el valor crudo del enum (en otro equipo se usa el label) y la fecha con `toLocaleDateString` (otro equipo usa moment).
- [ ] Date pickers sin escritura directa (regla `date-pickers.md`): fechas de contrato del vehículo, fecha de baja (vehículo y otro equipo), fecha de vencimiento de documentos de otro equipo.
- [ ] Documentos de otro equipo (`OtherEquipmentCertifications`): agregar/eliminar sin permiso y disponible también en modo lectura.
- [ ] Medidas de cubierta (`VehicleAxleSizesForm`) editables sin chequear `equipos:cubiertas-equipo:update` (el resto de la sección sí lo chequea).
- [ ] "Resolver Desvíos" (Equipos con Desvíos) sin chequeo de permiso; si falla la carga de desvíos no hay toast.
- [ ] Tipos de Reparación: Eliminar sin chequeo de permiso `delete`; botón "Cancel" en inglés.
- [ ] Grupos: monta su propio `<Toaster />` del sistema `use-toast` viejo aunque el form usa `sonner`.
- [ ] Tablas viejas **BaseDataTable** en este alcance (6): Tipos de Reparación, Grupos de Reparación, Operaciones ×3 (Pendientes de Ejecutar, Planificadas, Para Taller) y Órdenes de Mantenimiento de la ficha del vehículo (`equipment-operations-history`). Preferencias en cookies en Tipos de Reparación y Grupos.
- [ ] Fallback de Tipos de Documentos usa `DataTableSkeleton` del sistema viejo (`@/shared/components/data-table/base/`).
- [ ] Tabla manual sin filtros/orden/paginación/export: Historial de Checklists de la ficha.
- [ ] Columnas sin filtro (regla "1 filtro por columna"): Descripción (tipos de documentos), Cantidad de Desvíos y Último Desvío (Equipos con Desvíos), Intervenciones (órdenes de gomería), varias columnas de órdenes/rechazadas.
- [ ] Placeholder de búsqueda de Vehículos dice "dominio, chassis, N° Interno" pero también busca por motor.
- [ ] Dados de Baja → Otros Equipos: `InactiveOtherEquipmentList` no recibe `permissions` (no hay acciones que lo requieran hoy).
- [ ] `vehicle-tabs.tsx` declara `grid-cols-8` con 7 tabs (se pisa con la clase dinámica).

<!-- estado: completo -->
