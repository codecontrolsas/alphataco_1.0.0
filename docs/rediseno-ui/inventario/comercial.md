# Inventario ANTES — Comercial

Ficha funcional de lo que hoy hace cada pantalla del módulo Comercial. Se usa para tildar "después" en el rediseño.
Convenciones: `[perm módulo/tab/acción]` = condición de permiso (`PermissionGuard` o `hasPermission`).

**Notas comunes al `BaseDataTable` viejo** (`src/shared/components/data-table/base/data-table.tsx` + `toolbars/data-table-toolbar-base.tsx`):
filtros facetados con opciones armadas en el cliente (`createFilterOptions` sobre los datos ya cargados), selector de
filtros visibles (persistido en cookie `<tableId>-filters`), menú de columnas visibles (cookie `<tableId>`),
**Exportar a Excel client-side activado por defecto** (`showExport = true`), paginación client-side con tamaño de
página en cookie `pageSize-table` (default 10), sin búsqueda global salvo `searchableColumns`, orden por header
(`DataTableColumnHeader`). Ninguna tabla vieja de este módulo define orden por defecto (= orden en que llega del server).

Ruta principal: `/dashboard/comercial` → `src/app/dashboard/comercial/page.tsx` → `src/features/Comercial/ComercialComponent.tsx`
(`SectionManagerServer`, `?tab=comerce`, única sección "Comercial" `[perm comercial/comerce/view]`) →
`src/features/Comercial/Comerce/ComerceTabContent.tsx` (`TabsManagerServer`, `?subtab=`, default `customers`).
Cada subtab se muestra solo con `[perm comercial/<tabSlug>/view]`. Fallback de Suspense: `Skeleton h-[400px]` (Facturación usa `InvoicesTableSkeleton`).

| subtab | label | contenido |
|---|---|---|
| `customers` | Clientes | `Comerce/components/DataCustomersWrapper.tsx` |
| `service` | Contratos | `Comerce/components/ServiceComponentWrapper.tsx` |
| `mensure_units` | Unidades de Medida | `Comerce/components/MensureUnitsWrapper.tsx` |
| `reglas-precio` | Reglas de Precio | `ReglasPrecio/ReglasPrecioTabContent.tsx` |
| `certificaciones` | Certificaciones | `Certificaciones/CertificacionesTabContent.tsx` |
| `facturacion` | Facturación | `Facturacion/FacturacionTabContent.tsx` |
| `daily_reports` | Partes Diarios | `Comerce/components/DailyReportWrapper.tsx` |

---

## Clientes (listado) — `/dashboard/comercial?tab=comerce&subtab=customers`

- [ ] Raíz: `DataCustomersWrapper.tsx` (server; carga clientes, áreas, sectores, contratos, unidades, provincias y lee cookies de preferencias) → `Empresa/Clientes/components/CustomersPanel.tsx` (client).
- [ ] `CustomersPanel`: estado local `selectedId`; si hay cliente elegido muestra la **ficha** (`CustomerDetail`, ver abajo) en lugar del listado; "Cerrar" vuelve al listado. No cambia la URL.

### Tabla Clientes — `Empresa/Clientes/components/CustomersList.tsx` (columnas en el mismo archivo, `customerColumns`)
- [ ] Sistema: **BaseDataTable viejo**, `tableId="customers-table"`.
- [ ] Columnas: Cuit · Nombre · Email · Telefono · Estado (badge Activo verde / Inactivo rojo).
- [ ] Filtros (facetados): Nombre, Cuit, Email, Telefono, Estado (Activo/Inactivo).
- [ ] Búsqueda: no. Orden por defecto: el del server. Export Excel: sí (default). Selección/masivas: no.
- [ ] Click en fila → abre la ficha del cliente.
- [ ] Botón **"Registrar Cliente"** `[perm comercial/customers/create]` → Dialog `max-w-4xl` "Registrar Cliente" con `CustomerForm` (ver formulario). Al guardar cierra el dialog.

### Formulario de cliente — `Empresa/Clientes/components/CustomerForm.tsx` (schema `schemas/customer.ts`)
- [ ] Campos: **Nombre*** (min 2) · **CUIT*** (acepta guiones, se normaliza, valida dígito verificador) · fieldset "Datos fiscales" (texto "Se usan para facturar. Si faltan, no vas a poder emitirle facturas."): Condición frente al IVA (select; condiciones habilitadas + la guardada si es otra), Calle y número (máx 255), Localidad (máx 120), Provincia (select, carga `getProvinces` por React Query `['provinces']`), Código postal (máx 10) · Email (email válido) · Teléfono (mín 8, solo dígitos) · Dirección de contacto · Estado (radio Activo/Inactivo).
- [ ] Si Estado = Inactivo aparecen: Motivo de baja, Fecha de baja (`<input type="date">`).
- [ ] Botón submit "Crear Cliente" / "Actualizar Cliente" (deshabilitado mientras envía; oculto en `readOnly`). Ejecuta `saveCustomer` → toast éxito "Cliente guardado correctamente" / error; invalida `['customers']`, `onSuccess`, `router.refresh()`.
- [ ] Modo `readOnly`: inputs con `bg-muted`, selects y radio deshabilitados.

## Ficha del cliente (embebida) — desde el listado de Clientes (sin cambio de URL)

- [ ] Raíz: `Empresa/Clientes/components/CustomerDetail/CustomerDetail.tsx`. Header "Detalles del Cliente {nombre}" + botón "Cerrar".
- [ ] Pestañas locales (`Tabs`, no van a la URL), default `detalle`:
  - Detalle (siempre) · Empleados (siempre) · Equipos afectados (siempre)
  - Equipos del cliente `[perm comercial/equipos-cliente/view]`
  - Áreas `[perm comercial/areas-cliente/view]`
  - Sectores `[perm comercial/sectores-cliente/view]`
  - Contratos `[perm comercial/service/view]`

### Pestaña Detalle — `CustomerDetailTab.tsx`
- [ ] Título "Información del Cliente". Botón "Habilitar edición"/"Deshabilitar edición" `[perm comercial/detalle-cliente/update]`.
- [ ] `CustomerForm` en solo lectura hasta habilitar edición; al guardar vuelve a solo lectura. Se remonta cuando cambian los datos del cliente.

### Pestaña Empleados — `CustomerEmployeesTab.tsx`
- [ ] Título "Empleados del Cliente". Datos: `fetchAllEmployees2(customer.id)` por React Query `['customer-employees', id]`; tabla muestra solo los que tienen afectación. Loader spinner mientras carga.
- [ ] Tabla: `EmployeesTableReusable` (`Employees/Empleados/components/tables/data/employees-table.tsx`, **BaseDataTable viejo**, `tableId="employees-table"`). Detalle en la sección final.
- [ ] Botón **"Cargar empleados"** `[perm comercial/empleados-cliente/update]` → `AssignmentDialog` (ver abajo). Opciones con formato `[legajo] Apellido Nombre`, placeholder "Buscar por legajo o nombre...".

### Pestaña Equipos afectados — `CustomerEquipmentTab.tsx`
- [ ] Título "Equipos del Cliente" (equipos DE LA EMPRESA afectados al cliente). Datos: `fetchAllEquipment()` `['customer-equipment', id]`, filtrado client-side a los que tienen `contractor_equipment` de este cliente.
- [ ] Tabla **BaseDataTable viejo** `tableId="equipment-table-equipment"` (columnas en el mismo archivo): Número interno · Dominio · Tipo · Marca · Modelo · Año · Condición (label) · Estado (badge `employeeStatusBadges`).
- [ ] Filtros facetados: Número interno, Dominio, Tipo, Marca, Condición, Estado. Sin acciones por fila. Export Excel default.
- [ ] Botón **"Asignar Equipos"** `[perm comercial/equipos-cliente/update]` (ojo: usa el slug de la pestaña "Equipos del cliente", no uno propio) → `AssignmentDialog`. Opciones `interno - dominio`.

### Dialog de afectación M:M — `CustomerDetail/AssignmentDialog.tsx`
- [ ] Al abrir lee el baseline desde la base (`getCustomer…Assignments`); mientras tanto combo deshabilitado + "Cargando las afectaciones actuales del cliente..."; si falla toast de error y se cierra.
- [ ] Campo: MultiSelectCombobox con "seleccionar todo". Resumen en vivo: "N afectados actualmente. Se agregan X. (verde) Se quitan Y. (rojo)" o "Sin cambios.".
- [ ] Botones: Cancelar · **Guardar cambios** (deshabilitado sin baseline o enviando). Envía solo `{add, remove}`; sin cambios → toast info "No hay cambios para guardar". Éxito: toast con números reales ("Se afectaron N … y se desafectaron M …"), invalida la query de la pestaña.

### Pestaña Equipos del cliente — `CustomerOwnEquipmentTab.tsx`
- [ ] Equipos que aporta el cliente (`equipos_clientes`). React Query `['customer-own-equipment', id]`; skeleton de 3 filas.
- [ ] Botón "Nuevo equipo" → `equipos/CustomerEquipmentFormDialog.tsx` `[perm comercial/equipos-cliente/create]`.
- [ ] Tabla `equipos/customerEquipmentTable.tsx` (**BaseDataTable viejo**, `tableId="comercial-equipment-table"`): Nombre · Tipo de equipo · Acciones ("Editar", solo con `[perm comercial/equipos-cliente/update]`). Filtros: Nombre, Tipo de equipo.
- [ ] Dialog "Nuevo equipo del cliente"/"Editar equipo" (descr. "Los equipos que este cliente aporta a la operación."): **Nombre del equipo*** · **Tipo de equipo*** (Perforador, Perforador Spudder, Work over, Fractura, Coiled Tubing). Botón "Crear"/"Actualizar" ("Guardando..."). Invalida `['customer-own-equipment', id]` + `router.refresh()`.

### Pestaña Áreas — `CustomerAreasTab.tsx`
- [ ] Botón "Nueva área" → `area_clientes/AreaFormDialog.tsx` (guard interno `[perm comercial/areas-cliente/create|update]`).
- [ ] Tabla `area_clientes/areaTable.tsx` (**BaseDataTable viejo**, `tableId="areaTable"`): Nombre · Descripción · Provincias (badge primera + "+N" con tooltip) · Acciones ("Editar", solo con `[perm comercial/areas-cliente/update]`). Filtros: Nombre, Provincias.
- [ ] Dialog "Nueva área"/"Editar área" (descr. "Las áreas pertenecen a este cliente."): **Nombre del área*** · **Descripción corta*** (máx 5) · **Provincias*** (multi, ≥1) · cliente oculto fijo · sección separada "Vincular a contratos" (opcional; MultiSelect de contratos activos del cliente no vinculados aún; skeleton al cargar; aviso si no hay contratos). Botón "Crear"/"Actualizar" con spinner. Guarda área y luego vincula contratos; toasts diferenciados ("…y vinculada a N contratos", "Área guardada pero falló el vínculo").

### Pestaña Sectores — `CustomerSectorsTab.tsx`
- [ ] Botón "Nuevo sector" → `sector_clientes/SectorFormDialog.tsx` `[perm comercial/sectores-cliente/create|update]`.
- [ ] Tabla `sector_clientes/sectorTable.tsx` (**BaseDataTable viejo**, `tableId="comercial-sector-table"`): Nombre · Descripción · Acciones ("Editar", `[perm comercial/sectores-cliente/update]`). Filtro: Nombre.
- [ ] Dialog "Nuevo sector"/"Editar sector": **Nombre del sector*** · **Descripción corta***. Invalida `['preparte-sectors']`, `['preparte-contratos']` + refresh.

### Pestaña Contratos — `CustomerContractsTab.tsx`
- [ ] "Contratos del Cliente": `ServiceTable` filtrado al cliente, **sin** botón "Crear Contrato". Mismo comportamiento que la subtab Contratos (ver abajo).

## Ficha del cliente (página) — `/dashboard/configuration/customers/action?action=new|view&id=<uuid>`

- [ ] Raíz: `src/app/dashboard/configuration/customers/action/page.tsx` → `Empresa/Clientes/components/CustomerComponent.tsx`. `BackButton` arriba a la derecha.
- [ ] Sin `id`: card "Registrar Cliente" / "Completa este formulario con los datos de tu nuevo Cliente" + `CustomerForm`; al guardar navega a `/dashboard/configuration`. Sin guard de permiso en la página.
- [ ] Con `id`: `CustomerDetail` completo (mismas pestañas y permisos que la ficha embebida; "Cerrar" navega a `/dashboard/configuration`) + card **"Invitados"**: tabla manual (Nombre · Email · Rol · Alta DD/MM/YYYY) con los usuarios compartidos rol "Invitado" del cliente (del store `useLoggedUserStore.sharedUsers`); vacío: "Este cliente no tiene usuarios invitados.".
- [ ] Enlaces entrantes: facturación (`Facturacion/utils/invoice-links.ts` → `?action=view&id=`) y el manual de ayuda. Preferencias leídas de cookies `equipment-table-equipment*`.

## Contratos — `/dashboard/comercial?tab=comerce&subtab=service`

- [ ] Raíz: `Comerce/components/ServiceComponentWrapper.tsx` (server) → `Empresa/Clientes/components/Services/ServiceComponent.tsx` → `Services/ServiceTable.tsx` con `showCreateButton`. Preferencias en cookies (`services-table*`, `service-items-table*`).

### Tabla Contratos — `Empresa/Clientes/components/Services/ServiceTable.tsx` (columnas en `getServiceColumns`)
- [ ] Sistema: **BaseDataTable viejo**, `tableId="services-table"`.
- [ ] Columnas: Nombre del Servicio · Cliente · N° Contrato · Areas (badge primera + "+N", tooltip) · Sectores (ídem) · Estado (Activo/Inactivo) · Fecha Inicio · Fecha Vencimiento (DD/MM/YYYY, `dbDateToLocal`).
- [ ] Filtros facetados: Nombre del Servicio, Cliente, Número de Contrato, Estado (Activo/Inactivo), Sectores, Areas. Fechas sin filtro.
- [ ] Click en fila → reemplaza la tabla por el **detalle del contrato** (pestañas locales, default `detail`) + botón "Cerrar".
- [ ] Botón **"Crear Contrato"** (solo en esta subtab) dentro de `[perm comercial/service/create]` → Dialog "Crear Contrato" (`max-w-4xl`) con `ServicesForm`.

### Formulario de contrato — `Services/ServicesForm.tsx` (schema `schemas/service.ts`)
- [ ] Campos: **Cliente*** (select) · **Area*** (multi, filtradas por cliente) · **Sectores*** (multi, filtrados por cliente) · **Título del Contrato*** · **Inicio del Contrato*** / **Validez del Contrato*** (botón + Calendar en Popover, **sin escritura directa**) · Número de Contrato · Activo (radio Activo/Inactivo).
- [ ] Validación: validez > inicio ("La validez del servicio debe ser mayor que el inicio del servicio").
- [ ] Botón submit "Crear"/"Editar" envuelto en `[perm comercial/detalle-contrato/update]` (también en el alta) + "Cancelar" (resetea y cierra). Toasts "Contrato creado/actualizado correctamente"; `router.refresh()`.
- [ ] En edición arranca solo lectura (`startReadOnly`); botón "Habilitar Edicion"/"Ver" `[perm comercial/detalle-contrato/update]`.

### Detalle del contrato (pestañas locales)
- [ ] **Detalle** `[perm comercial/detalle-contrato/view]` → `ServicesForm` en edición.
- [ ] **Documentos** `[perm comercial/documentos-contrato/view]` → `Services/contractDocuments.tsx`:
  - Panel "Subir Documento": zona drag & drop + "Seleccionar archivos" (input file múltiple), lista de seleccionados, campos Tipo de documento y Descripción, botón "Subir documento" (spinner "Subiendo..."). Toasts con `use-toast` viejo.
  - Buscador "Buscar documentos..." + tabla manual: Nombre · Tipo · Fecha · Tamaño · Acciones (Ver → vista previa embebida PDF/imagen o "Vista previa no disponible" + "Descargar archivo"; Descargar → `window.open` de URL firmada; Eliminar → Dialog "Confirmar eliminación").
  - Vacíos: "No hay documentos para este contrato" / "Intenta con otro término de búsqueda". **Sin guards de permiso** en subir/eliminar (solo el de ver la pestaña).
- [ ] **Items del Servicio** `[perm comercial/items-contrato/view]` → `Services/ServiceItemsTable.tsx` (abajo).

### Tabla Items del contrato — `Services/ServiceItemsTable.tsx`
- [ ] Layout `ResizablePanelGroup`: panel izquierdo 30% con `ServiceItemsForm` (solo si `[perm comercial/items-contrato/create]` o `update`), derecho la tabla.
- [ ] Sistema: **BaseDataTable viejo**, `tableId="service-items-table"`. React Query `['service-items', contratoId]`.
- [ ] Botón "Ver Inactivos"/"Ver Activos" (filtra client-side; default activos).
- [ ] Columnas: Nombre · Estado · Req. Personal (Sí/No) · Req. Equipos (Sí/No) · Descripción · Codigo · Numero · UDM · Precio (solo `[perm comercial/items-contrato/view_prices]`; `$precio` + botón "Precios" → `PriceRevisionsDialog`) · Acciones ("Editar" → carga el ítem en el form lateral; solo `[perm …/items-contrato/update]`).
- [ ] Filtros: Nombre, Estado, Codigo, Numero, UDM.
- [ ] Form `Services/ServiceItemsForm.tsx` ("Nuevo Item"/"Editar Item", schema `schemas/service-item.ts`): **Nombre del Item*** · Código · Número · **Precio*** (≥0) · **Alícuota IVA*** (default id 5) · **Unidad de Medida*** · Descripción · Estado · checks Necesita Personal / Necesita Equipos (default sí). Submit "Crear"/"Guardar cambios" `[perm comercial/items-contrato/create|update]` + "Cancelar". Invalida `service-items` y `preparte-service-items`.
- [ ] Dialog **"Precios de {ítem}"** (`Services/PriceRevisionsDialog.tsx`): precio vigente grande; tabla historial (Vigencia · Precio · Anterior · Origen · Motivo) o "Este ítem todavía no tiene revisiones de precio."; form solo con `[perm comercial/items-contrato/update_prices]`: **Precio*** (texto, hasta 4 decimales) · **Vigente desde*** (`EnhancedDatePicker`) · Motivo (opcional); botón "Aplicar precio". Toast "Precio actualizado. La revisión anterior queda en el historial.".

## Items del contrato (página suelta) — `/dashboard/configuration/services/[id]`

- [ ] Raíz: `src/app/dashboard/configuration/services/[id]/page.tsx` → `Empresa/Clientes/components/Services/ServiceItemsSection.tsx`.
- [ ] **Sin enlaces entrantes** en `src/` (solo URL directa) y **sin chequeo de permisos**. Probable pantalla legacy.
- [ ] Card "Items del Servicio" + `BackButton`; select Activos/Inactivos; tabla **manual** (`Table`): Nombre · Estado · Descripción · Unidad de medida · Precio · Cliente · Acciones ("Editar"). Loading: texto "Cargando...".
- [ ] Modal `EditModal` "Editar Item": inputs sin react-hook-form (Nombre del Servicio, Descripción del Servicio, Precio del Servicio, Unidad de Medida) + Guardar · Cancelar · "Dar de Baja"/"Dar de Alta". Colores hardcodeados (`bg-gray-100`, `text-gray-700`).

## Unidades de Medida — `/dashboard/comercial?tab=comerce&subtab=mensure_units`

- [ ] Raíz: `Comerce/components/MensureUnitsWrapper.tsx` → `Empresa/Clientes/components/meansure_units/MensureUnitsTab.tsx` (Resizable: form 30% si `[perm comercial/mensure_units/create]` o `update`, tabla 70%).
- [ ] Tabla `meansure_units/MensureUnitsTable.tsx` (**BaseDataTable viejo**, `tableId="meanureUnitsTable"`, título "Unidades de Medida"): Símbolo · Unidad · Tipo · acciones (iconos Editar / Eliminar, **ambos** con `[perm comercial/mensure_units/update]`; el borrado no usa `delete`). Filtros: Símbolo, Unidad, Tipo.
- [ ] Eliminar → `AlertDialog` "Eliminar unidad de medida" → `deleteMeasureUnit` → toast + `router.refresh()`.
- [ ] Form `meansure_units/MensureUnitsForm.tsx` `[perm …/mensure_units/create|update según modo]`: **Símbolo*** (máx 5) · **Tipo*** · **Unidad***. Botón "Crear"/"Actualizar" + "Cancelar" (solo en edición).

## Reglas de Precio — `/dashboard/comercial?tab=comerce&subtab=reglas-precio`

- [ ] Raíz: `ReglasPrecio/ReglasPrecioTabContent.tsx` → `ReglasPrecio/components/ReglasPrecioPanel.tsx`.
- [ ] Encabezado "Reglas de actualización de precios" + ayuda. Botón "Nueva regla" `[perm comercial/reglas-precio/create]`.
- [ ] Tabla **manual**: Nombre · Método (+ nombre del índice) · Alcance ("Cliente · Contrato" o "Toda la empresa") · Corridas · Estado (Activa/Desactivada) · acciones. Vacío: "Todavía no hay reglas cargadas." Sin filtros/orden/export.
- [ ] Acciones por fila: "Editar" `[perm comercial/reglas-precio/update]` · "Ejecutar" (activa, método ≠ manual, `[perm comercial/items-contrato/update_prices]`) · "Desactivar"/"Activar" `[perm comercial/reglas-precio/update]`.
- [ ] Dialog Nueva/Editar regla (`ReglasPrecio/components/PriceRuleFormDialog.tsx`, schema `Empresa/Clientes/schemas/price-rule.ts`): **Nombre*** · **Método*** (manual / índice / polinómica) · Alcance (Toda la empresa o un contrato) · si índice: **Índice de referencia*** · si polinómica: componentes (**nombre*** + **peso***, ≥1; agregar/quitar). Toasts "Regla creada/actualizada".
- [ ] Dialog "Ejecutar: {regla}": Vigente desde (`type=date`, default hoy) · Coeficiente del período (índice) o uno por componente (polinómica) · Nota. Toast "Se actualizaron N ítems".

## Certificaciones — `/dashboard/comercial?tab=comerce&subtab=certificaciones`

- [ ] Raíz: `Certificaciones/CertificacionesTabContent.tsx` (server; detalle bajo demanda con `getCertificationById`) → `Certificaciones/components/CertificacionesPanel.tsx`.
- [ ] Botón "Nueva certificación" `[perm comercial/certificaciones/create]`.
- [ ] Tabla **manual**: Número (mono) · Cliente · Contrato · Período (DD/MM/YYYY — DD/MM/YYYY) · Estado (`CertificationStatusBadge`: borrador, emitida, confirmada, anulada, facturada) · Líneas · Total (solo `[perm …/certificaciones/view_prices]`) · "Ver". Vacío: "Todavía no hay certificaciones…". Sin filtros/orden/export/paginación.
- [ ] Dialog "Nueva certificación": **Cliente*** · **Contrato*** (filtrado por cliente) · **Desde*** / **Hasta*** (`type=date`, hasta ≥ desde) · Observaciones. "Crear borrador" → toast y abre el detalle.
- [ ] Dialog detalle (`max-w-820`): número + estado; aviso de anulación con motivo; nota de facturas vinculadas (links a `/dashboard/comercial/facturacion/[id]`: "Facturada en…", "Incluida en… no se puede incluir en otra factura", "Estuvo facturada en… (anulada con nota de crédito)"); tabla de líneas Ítem · Descripción · Cantidad · Unitario/Importe (view_prices); Total (view_prices).
- [ ] Acciones del detalle según estado (`lib/state-machine.ts`): "Recalcular líneas" (editable + `update`) · "Eliminar borrador" (borrable + `delete`) · "Emitir" (borrador + `update`, deshabilitado sin líneas) · "Confirmar" (emitida + `approve`) · "Anular" (emitida/confirmada + `delete`) → Dialog "Anular certificación" con motivo obligatorio.

## Facturación (listado) — `/dashboard/comercial?tab=comerce&subtab=facturacion` (+ params `invoices_*` de la tabla)

- [ ] Raíz: `Facturacion/FacturacionTabContent.tsx` (server). Encabezado "Facturación" / "Facturas y notas de crédito y débito electrónicas ante ARCA.".
- [ ] Botón **"Nueva factura ▾"** (`components/NewInvoiceMenu.tsx`, solo `[perm comercial/facturacion/create]`, si no, no se dibuja): DropdownMenu con 2 links reales → `/facturacion/nueva?origen=certificaciones` ("Desde certificaciones · Certificaciones confirmadas de un cliente") y `?origen=manual` ("Factura manual · Líneas cargadas a mano").
- [ ] Avisos (`components/InvoicingNotices.tsx`, Suspense propio, `role="note"`): ARCA simulado (modo demo) · homologación · "Todavía no podés emitir… falta X. Completar en Datos fiscales" (ámbar, link) · certificado por vencer en N días ("Renovar el certificado", link a Datos fiscales `#certificado-arca`). Colores ámbar hardcodeados.

### Tabla Comprobantes — `Facturacion/list/InvoicesList.tsx` → `list/_InvoicesDataTable.tsx` (columnas `list/columns.tsx`, actions `list/actions.server.ts`)
- [ ] Sistema: **DataTable nuevo**, `tableId="invoices"`, `paramNamespace`, client-side (`queryFn`, `queryKey ['invoices-paginated']`), preferencias en BD, facets lazy (`getInvoiceSingleFacet`).
- [ ] Columnas (meta.title): Fecha de emisión · Tipo (icono factura/NC/ND) · Número · Punto de venta · Cliente · CUIT · Estado (badge con icono) · Ambiente (badge + "Simulado") · Simulado · Moneda · Total (solo `[perm comercial/facturacion/view_prices]`, server-side) · CAE · Vencimiento CAE · Fecha de creación · acciones.
- [ ] Ocultas por defecto: CUIT, Moneda, Simulado, CAE, Vencimiento CAE, Fecha de creación.
- [ ] Filtros: facetados Estado, Tipo (solo tipos habilitados), Cliente (FK + "Sin asignar"), Punto de venta (FK), Ambiente, Simulado (Sí/No), Moneda (FK) · texto Número ("Ej: 00003-00000124 o 124..."), CUIT, CAE, Total (solo view_prices) · fecha Fecha de emisión, Vencimiento CAE, Fecha de creación. Visibles por defecto: Estado, Tipo, Cliente.
- [ ] Búsqueda: "Buscar por número, cliente o CAE...". Orden por defecto: Fecha de emisión desc.
- [ ] Export Excel: archivo `comprobantes`, hoja "Comprobantes", título "Listado de comprobantes electrónicos"; fechas DD/MM/YYYY, labels de tipo/estado/ambiente, Simulado Sí/No, total formateado. Respeta filtros activos.
- [ ] Selección/masivas: no. Acción por fila: **"Ver"** → `/dashboard/comercial/facturacion/[id]` (sin chequeo de permiso).
- [ ] Vacío: "Todavía no hay comprobantes. Creá uno con “Nueva factura”.". `data-testid="invoices-table"`.

## Nueva factura — `/dashboard/comercial/facturacion/nueva?origen=certificaciones|manual`

- [ ] Raíz: `src/app/dashboard/comercial/facturacion/nueva/page.tsx` → `Facturacion/NewInvoicePage.tsx` (server). Metadata "Nueva factura · Facturación". Ancho `max-w-5xl`. Link "← Facturación" arriba.
- [ ] Sin `[perm comercial/facturacion/create]`: aviso bloqueante con candado "Para crear facturas necesitás el permiso Crear en Facturación…".
- [ ] `InvoiceEnvironmentNotice` (scope draft). Si faltan datos fiscales o punto de venta activo: aviso bloqueante "Todavía no podés crear facturas: falta …" + link "Completar en Datos fiscales" (no muestra formulario).
- [ ] Sin `origen`: título "Nueva factura", `OriginChooser` (2 tarjetas-link: Desde certificaciones / Factura manual).
- [ ] `origen=certificaciones` → `components/new/CertificationsInvoiceForm.tsx`, título "Nueva factura desde certificaciones":
  - Sin clientes con certificaciones confirmadas: "No hay certificaciones confirmadas para facturar." + botón "Ir a Certificaciones".
  - **Cliente*** (combobox con buscador; label "Nombre · N certificaciones") → carga certificaciones por React Query (error con "Reintentar"; vacío "Este cliente no tiene certificaciones confirmadas sin facturar.").
  - Lista agrupada por moneda con **checkboxes** (≥1, "Elegí al menos una certificación"); las de otra moneda quedan deshabilitadas ("Otra moneda: se factura aparte."); muestra contrato, período, importe; contador "N certificaciones seleccionadas".
  - Botones "Cancelar" (link a la tab) · **"Crear borrador"** → toast "Borrador creado con N certificaciones." y navega a `/facturacion/[id]`.
- [ ] `origen=manual` → `components/new/ManualInvoiceForm.tsx`, título "Nueva factura manual": sin clientes activos "No hay clientes activos…"; **Cliente*** (combobox) — aviso si al cliente le falta la condición frente al IVA; **Moneda*** (select); "Cancelar" · **"Crear borrador"** → toast "Borrador creado para X en MON." y navega al borrador.

## Comprobante — `/dashboard/comercial/facturacion/[id]?resultado=emitida|rechazada|pendiente`

- [ ] Raíz: `src/app/dashboard/comercial/facturacion/[id]/page.tsx` → `Facturacion/InvoicePage.tsx` (server). `<title>` dinámico ("Factura A 00003-00000124 · Facturación" / "… · Borrador"). Id no UUID o inexistente → `notFound()`.
- [ ] Sin `[perm comercial/facturacion/view]`: "No tenés permiso para ver comprobantes de Facturación.". Permisos usados: create, delete, approve, view_prices.
- [ ] Estado borrador/rechazada → **Editor**; emitiendo/pendiente/autorizada → **Detalle**. `?resultado=` mueve el foco al panel de resultado.

### Editor de borrador — `components/editor/InvoiceEditor.tsx` + `InvoiceDraftForm.tsx` (schema `editor-form.ts`)
- [ ] Encabezado: link "← Facturación" (si hay cambios sin guardar abre AlertDialog **"¿Salir sin guardar?"** — "Seguir editando" / salir); caja de letra (A/B/C) + "{Tipo} · {Borrador|Rechazada}" + cliente · moneda; `InvoiceStatusBadge`; "Cambios sin guardar" / "Guardado DD/MM/YYYY HH:mm" (aria-live). `beforeunload` con cambios sin guardar.
- [ ] Avisos: ambiente; fallo de emisión (`role=alert`); panel de **rechazo de ARCA** (códigos y textos); `IssueProblemsPanel` ("Antes de emitir, corregí N cosas", cerrable); sin create: "Podés ver este borrador pero no modificarlo…"; si es NC/ND: "asociada a {factura}" (link) + saldo disponible para acreditar (view_prices).
- [ ] Columna principal (`fieldset` deshabilitado sin `create`): `InvoiceHeaderFields` (**Punto de venta*** — inactivos deshabilitados; **Fecha de emisión***; Concepto (radio; fijo "Servicios" si viene de certificaciones); Período facturado desde/hasta y **Vencimiento del pago** "Con servicios, ARCA lo pide.") · `InvoiceReceiver` (datos fiscales del cliente + link externo a la ficha del cliente + botón refrescar) · nota de moneda extranjera · `InvoiceLinesEditor` (filas: Descripción · Cantidad · Precio unitario neto (sin IVA) · IVA (select) · importe · quitar línea; "Agregar línea"; vacío "La factura no tiene líneas…"; sin view_prices oculta importes) · `IncludedCertifications` (lista + "Quitar" → AlertDialog "¿Quitar {n} de la factura?" → "Quitar certificación"; exige guardar antes si hay cambios) · **Observaciones** (máx 1000, "Se imprimen en la factura.").
- [ ] Columna lateral sticky (desktop): letra + motivo; aviso si cambia el tipo al guardar; `InvoiceTotals` (Neto gravado, IVA por alícuota, Total; "La Factura C no discrimina IVA.", solo view_prices); hasta 5 problemas de emisión ("y N más").
- [ ] Botones: **"Emitir {tipo}"** (aria-disabled sin `approve` o sin `view_prices`, con motivo visible; valida y guarda antes) · **"Guardar borrador"** (`create`; toast "Borrador guardado. Total …") · **"Descartar borrador"** (`delete`) → AlertDialog "¿Descartar el borrador?" ("Seguir editando" / "Descartar borrador").
- [ ] Celular (< lg): `MobileIssueBar` barra inferior fija con Total + "Emitir".
- [ ] Dialog **"¿Emitir {tipo} {número esperado}?"** (`IssueInvoiceDialog.tsx`): consulta a ARCA el próximo número ("Consultando…", error "No se pudo consultar a ARCA. No se envió nada." + "Reintentar"); resumen Cliente / Incluye N certificaciones / Asociada a; botones "Cancelar" · "Emitir {tipo} por {MON total}"; estado "Enviando a ARCA…". Resultado: autorizada (toast con CAE, va a `?resultado=emitida`), rechazada, pendiente (toast warning), inválida (panel de problemas), error.

### Detalle de comprobante emitido — `components/detail/InvoiceDetail.tsx`
- [ ] Encabezado: link "← Facturación", letra, número completo, receptor · "Emitida el DD/MM/YYYY", `InvoiceStatusBadge` (observaciones / revisión).
- [ ] Autorizada: panel "{comprobante} autorizada." con CAE y vencimiento; observaciones de ARCA (ámbar); **PDF** (`InvoicePdfActions.tsx`, solo view_prices; si no: "El PDF tiene importes: necesitás el permiso Ver precios."): "Descargar PDF" · "Ver PDF" (nueva pestaña) · mientras no existe "Generando PDF…" con polling, luego "Generar PDF" (regenera server-side con `pdf/render-invoice-pdf.server.ts` + `pdf/InvoicePdfDocument.tsx`).
- [ ] **Notas de ajuste** (`AdjustmentActions.tsx`, si autorizada + `create` + no es NC): menú con "Nota de crédito total" (bloqueada si ya hay NC autorizada: "Ya tiene notas de crédito: cargá una parcial por el saldo."), "Nota de crédito parcial", "Nota de débito" → crea borrador y navega.
- [ ] Pendiente/emitiendo: panel ámbar + `ReconcileInvoicePanel` "Consultar estado en ARCA" (requiere approve + view_prices, si no texto explicativo).
- [ ] Documento: Emisor ("Los datos del emisor se fijan al autorizarse.") · Receptor · tabla de líneas (Descripción · Cantidad · Unitario · IVA · Importe) · totales (Neto gravado, IVA, Total; ocultos sin view_prices) · Observaciones · comprobante asociado (link) · sección "Notas de crédito y débito" con links · sección "Certificaciones" incluidas.

## Partes Diarios (comercial) — `/dashboard/comercial?tab=comerce&subtab=daily_reports`

- [ ] Raíz: `Comerce/components/DailyReportWrapper.tsx` (client). Opciones de filtros por `Operaciones/Certificacion/hooks/useFilterOptions` (React Query). Datos por `getFilteredDailyReportRows` (React Query sin caché, `['filtered-daily-report-rows', filtros]`), solo tras "Buscar".
- [ ] Card "Filtros de Reportes" (Accordion abierto por defecto), filtros multi-select (`MultiSelectCombobox`): Cliente · Servicio (requiere cliente) · Ítem (requiere servicio) · Equipos del Cliente / Áreas / Sectores (requieren cliente) · Empleado · Equipo · Estado (Pendiente, En Certificación, Ejecutado, Reprogramado, Cancelado, Sin Recursos Asignados) · Fecha Desde / Fecha Hasta (`DataTableDatePicker`). Cambiar cliente limpia servicio/ítem/equipos/áreas/sectores.
- [ ] Botones: **"Crear Línea"** `[perm comercial/daily_reports/create]` (abre el Sheet en modo alta) · "Limpiar" (deshabilitado sin filtros) · "Buscar" (spinner SVG "Buscando...").
- [ ] Estados: skeleton mientras carga; antes de buscar "Utilice los filtros para buscar reportes."; sin resultados "No se encontraron resultados para los filtros seleccionados.".
- [ ] "Ver" y "Ver historial" del wrapper (`handleViewRow/handleViewHistory`) solo muestran un toast; la tabla abre sus propios modales (ver abajo).

### Tabla — `Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx` (formatters `export-formatters.ts`)
- [ ] Sistema: **BaseDataTable viejo**, `tableId="enhanced-comercial-report-table"`.
- [ ] Columnas: Fecha · Cliente · Servicio · Ítem · Descripción Ítem · Equipo Cliente · Área · Sector · Tipo de Servicio · N° de Remito · Estado · Empleados · Equipo Empresa · Jornada · Descripción · Acciones.
- [ ] Filtros (definidos en el wrapper, opciones de los datos traídos): Rango de Fechas (date-range) + facetados Cliente, Servicio, Ítem, Tipo de Servicio, Estado, Empleados, Equipo Empresa, Equipo Cliente, Área, Sector, N° de Remito, Jornada. Visibles al inicio: Cliente, Servicio, Ítem.
- [ ] Búsqueda: "Buscar en descripción...". Export Excel con encabezados y formatters propios (empleados, equipos, equipo cliente, remitos).
- [ ] Selección: filas en estado "ejecutado" y solo con `[perm comercial/daily_reports/update]` → acción masiva **"Enviar a certificación"** → `BulkCertificacionModal` ("Actualización masiva a En certificación", lista de filas, Cancelar/confirmar; toasts `use-toast` viejo).
- [ ] Acciones por fila: Editar (`update`, fila no "en_certificacion"; deshabilitado con tooltip "debe editarse desde Operaciones" si el parte está abierto) · Ver detalle (`ServiceDetailModal`) · Ver historial (`HistoryModal`) · Gestionar Remitos (`RemitosManagerModal`, `update` + fila "en_certificacion").
- [ ] Color de fila: amarillo si se creó después del cierre del parte; azul si tuvo edición comercial (`last_comercial_edit_at`). Colores hardcodeados.

### Sheet alta/edición de línea — `Operaciones/Certificacion/components/DailyReportRowFormRefactored.tsx` (store `useDailyReportFormStore`, secciones en `form-sections/`)
- [ ] Título "Crear Línea de Parte Diario" / "Editar Parte Diario" + badge "Fecha: DD/MM/YYYY". Descripción en alta: "Estado inicial: En certificación.".
- [ ] Secciones: Datos del cliente (Cliente · Servicio · Ítem · Sector del Cliente · Área del Cliente · Equipos de Cliente (Máx. 2)) · Tipo de servicio (Mensual / Adicional / Adicional Permanente; obligatorio en alta) · Fecha del Parte Diario* · Jornada · Hora de inicio / Hora de fin · Recursos (Empleados / Equipos Empresa, según `needs_personnel`/`needs_equipment` del ítem) · Estado · Número de Remito · Observaciones.
- [ ] Comportamiento: en edición el estado pasa solo entre "pendiente" ↔ "sin_recursos_asignados" según falten recursos requeridos. Si la validación falla, toast con el primer error. Botones "Cancelar" · "Crear"/"Actualizar" (spinner). Usa `date-fns` (viola la regla moment).

---

## Tablas del sistema viejo (BaseDataTable)

Comunes a todas: filtros facetados client-side (`createFilterOptions`), Exportar Excel client-side **activo por defecto** (`showExport=true`) y selector de columnas activo por defecto (`showViewOptions=true`) — al migrar hay que conservar ambos. Visibilidad y filtros visibles en cookies (`<tableId>`, `<tableId>-filters`). Ninguna tiene búsqueda salvo `EnhancedComercialReportTable`. Cadenas verificadas con imports reales hasta un `page.tsx`.

**Conteo: 13 BaseDataTable, 13 EN USO, 0 huérfanas.** `SimpleDocument.tsx` no es BaseDataTable (solo la nombra en un comentario, l.63). 2 tienen versión nueva parcial/modelo; 11 no tienen equivalente.

| # | Archivo | Estado | Dónde (ruta / pestaña) | tableId | Versión nueva equivalente |
|---|---|---|---|---|---|
| 1 | `Empresa/Clientes/components/CustomersList.tsx` | EN USO | `CustomersPanel` ← `DataCustomersWrapper` ← `ComerceTabContent` ← `ComercialComponent` ← `app/dashboard/comercial/page.tsx` · `?subtab=customers` | `customers-table` | Ninguna |
| 2 | `Empresa/Clientes/components/CustomerDetail/CustomerEquipmentTab.tsx` | EN USO | `CustomerDetail` (ficha embebida en Clientes y `app/dashboard/configuration/customers/action/page.tsx`) · pestaña "Equipos afectados" | `equipment-table-equipment` | Ninguna (`Equipos/Equipos/VehicleList` no filtra por cliente) |
| 3 | `Empresa/Clientes/components/area_clientes/areaTable.tsx` | EN USO | `CustomerAreasTab` ← `CustomerDetail` · pestaña "Áreas" | `areaTable` | Ninguna |
| 4 | `Empresa/Clientes/components/sector_clientes/sectorTable.tsx` | EN USO | `CustomerSectorsTab` ← `CustomerDetail` · pestaña "Sectores" | `comercial-sector-table` | Ninguna |
| 5 | `Empresa/Clientes/components/equipos/customerEquipmentTable.tsx` | EN USO | `CustomerOwnEquipmentTab` ← `CustomerDetail` · pestaña "Equipos del cliente" | `comercial-equipment-table` | Ninguna |
| 6 | `Empresa/Clientes/components/Services/ServiceTable.tsx` | EN USO (2) | (a) `ServiceComponent` ← `ServiceComponentWrapper` · `?subtab=service`; (b) `CustomerContractsTab` ← `CustomerDetail` · pestaña "Contratos" | `services-table` | Ninguna |
| 7 | `Empresa/Clientes/components/Services/ServiceItemsTable.tsx` | EN USO | `ServiceTable` → detalle de contrato · pestaña "Items del Servicio" (2 rutas de arriba) | `service-items-table` | Ninguna |
| 8 | `Empresa/Clientes/components/meansure_units/MensureUnitsTable.tsx` | EN USO | `MensureUnitsTab` ← `MensureUnitsWrapper` · `?subtab=mensure_units` | `meanureUnitsTable` | Ninguna |
| 9 | `Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx` | EN USO | `DailyReportWrapper` · `?subtab=daily_reports` | `enhanced-comercial-report-table` | Ninguna |
| 10 | `Empresa/General/components/mantenimiento/talleres/TalleresTable.tsx` | EN USO | `TalleresTabClient` ← `mantenimiento/TalleresTab.tsx` ← `EmpresaComponent` ← `app/dashboard/configuration/page.tsx` · `?tab=mantenimiento&subtab=talleres` | `talleres-table` | Ninguna |
| 11 | `Empresa/General/components/mantenimiento/sectores/SectoresTable.tsx` | EN USO | `SectoresTabClient` ← `mantenimiento/SectoresTab.tsx` ← `EmpresaComponent` · `?tab=mantenimiento&subtab=sectores_taller` | `sectores-table` | Ninguna |
| 12 | `Employees/Empleados/components/tables/data/employees-table.tsx` (`EmployeesTableReusable`) | EN USO | `CustomerEmployeesTab` ← `CustomerDetail` · pestaña "Empleados" | `employees-table` | Parcial: `Employees/Empleados/EmployeeList/components/_EmployeeDataTable.tsx` (server-side, sin filtro por cliente afectado) |
| 13 | `Equipos/EquipoID/components/vehicle-operations-history.tsx` | EN USO | `app/dashboard/equipment/action/page.tsx` → `vehicle-tabs.tsx` · pestaña "Historial de Mantenimiento" (`equipos/historial-mantenimiento-equipo`), sub `mant_subtab=orders` | `equipment-operations-history` | Modelo: `Equipos/OtherEquipment/maintenance/OtherEquipmentMaintenanceTable.tsx` (DataTable nuevo, no la reemplaza) |
| — | `Documentacion/shared/components/SimpleDocument.tsx` | NO APLICA | Modal "Subir documento" usado desde 4 `columns.tsx` de DataTables nuevas (documentos empleados/equipos mensuales y permanentes) | — | — |

Detalle de las tablas que no se describen arriba en este archivo:

### 10. `TalleresTable.tsx` — Configuración → Mantenimiento → Talleres
- [ ] Columnas: Nombre · Tipo · Direccion · Provincia · Ciudad · Proveedor · Estado · Acciones. Filtros: Nombre, Tipo, Provincia.
- [ ] `VerActivosButton` alterna activos/inactivos. "Editar" por fila (carga el store del form lateral) `[perm configuracion/talleres/update]`; form visible con `create` o `update`.

### 11. `SectoresTable.tsx` — Configuración → Mantenimiento → Sectores de taller
- [ ] Columnas: Nombre · Descripcion · Taller · Cupo · Estado · Acciones. Filtros: Nombre, Taller.
- [ ] Alterna activos/inactivos. "Editar" `[perm configuracion/sectores_taller/update]`; form con `create` o `update`.
- [ ] Nota: `talleres/TalleresTab.tsx` y `sectores/SectoresTab.tsx` (copias) **no las importa nadie**; las vivas son `mantenimiento/TalleresTab.tsx` y `mantenimiento/SectoresTab.tsx`.

### 12. `employees-table.tsx` — ficha del cliente → Empleados
- [ ] Columnas (`tables/data/columns.tsx`): Nombre, Nacionalidad, Nacimiento, Cuil, Tipo de Documento, Documento, Genero, Estado Civil, Nivel de Educacion, Calle, Altura, Provincia, Ciudad, CP, Teléfono, Email, Legajo, Sector, Puesto, Diagrama, Horas, Tipo de Contrato, Afectaciones, Fecha de ingreso, Centro de costo, Estado de afiliación, Estado.
- [ ] Filtros facetados sobre casi todas; "Sector" y "Estado" aparecen **duplicados**. Click en fila → `/dashboard/employee/action?action=view&employee_id=`.

### 13. `vehicle-operations-history.tsx` — ficha del equipo → Historial de Mantenimiento
- [ ] Columnas: N° Orden · Estado · Ingreso · Creada · Sectores · Items · OTs · Progreso · Acciones. Filtro: Estado.
- [ ] Acciones por fila: "Detalle" (`EquipmentOrderDetailDialog`) · "Historial" (`ActivityHistoryModal`). Vacío: "No hay ordenes de mantenimiento para este equipo". Deshabilitada en modo alta. La otra sub-pestaña ("Solicitudes Rechazadas", `VehicleRejectedRequestsTable`) no es BaseDataTable.

---

## Hallazgos (bugs previos / inconsistencias — anotar en §9 del plan, no arreglar en silencio)

- [ ] `/dashboard/configuration/services/[id]` (`ServiceItemsSection`): sin enlaces entrantes ni permisos; edición sin RHF/zod, colores hardcodeados. Candidata a código muerto.
- [ ] Botón "Asignar Equipos" (Equipos afectados) usa el permiso `equipos-cliente/update`, el mismo de la pestaña "Equipos del cliente".
- [ ] "Crear Contrato": el submit está dentro de `PermissionGuard detalle-contrato/update` aun en el alta (un rol con `service/create` sin ese permiso no ve el botón Crear).
- [ ] Documentos de contrato: subir y eliminar sin chequeo de permiso.
- [ ] Unidades de medida: eliminar usa `update`, no `delete`.
- [ ] Date pickers sin escritura directa: Inicio/Validez del contrato (`ServicesForm`).
- [ ] `date-fns` en `DailyReportRowFormRefactored` y `form-sections/DateTimeSection` (regla moment).
- [ ] `use-toast` viejo en `contractDocuments.tsx`, `DailyReportWrapper.tsx`, `BulkCertificacionModal.tsx` (Fase 1 lo migra a sonner).
- [ ] Wrapper de Partes diarios: `onView`/`onViewHistory` del wrapper solo tiran un toast (la tabla usa sus propios modales).
- [ ] `/customers/action` sin `id`: al crear navega a `/dashboard/configuration` (no a Comercial).
- [ ] Colores hardcodeados: avisos ámbar de facturación, `bg-green-50`/`text-slate-*` en documentos de contrato, filas amarillo/azul del reporte comercial, `text-green-600` en `AssignmentDialog`.

<!-- estado: completo -->
