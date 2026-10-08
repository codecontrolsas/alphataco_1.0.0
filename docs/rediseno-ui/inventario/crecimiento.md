# Crecimiento de registros: qué superficies necesitan paginación (D7)

Pedido del usuario: _"darle un especial ojo a registros que puedan crecer y necesiten paginación, para no mostrarlos
en una tabla simple y que en un futuro, con la acumulación de registros en el tiempo, se vuelva lento"_.

Escrito desde el código el 2026-10-07 (rama `feat/rediseno-ui`). Cada fila se verificó en la server action real
(`take`/`skip`, `stateToPrismaParams`, `where` obligatorio). Referencias de ruta relativas a `src/features/` salvo
que digan `src/`.

## Cómo leer este archivo

- **Clasificación**: `acotado` = catálogo chico o ítems de UN registro con tope natural (líneas de una factura,
  tipos de documento, unidades de medida). `crece` = se acumula con el uso (documentos, partes y sus líneas,
  prepartes, historiales, comentarios, entregas, órdenes, respuestas de checklist, facturas, diagramas…).
- **Estado actual**: `paginado servidor` (DataTable con `queryFn` o SSR, y la server action hace `skip/take`) ·
  `carga todo` (findMany sin `take`; el cliente recibe el array completo) · `slice en memoria` (pagina, pero
  después de traer TODO a Node) · `filtrado por registro` (todo lo de UN registro: crece con la vida de ese
  registro) · `ventana` (acotado por fecha/estado obligatorio) · `limit fijo N` (corta datos sin avisar).
- **Riesgo**: `alto` = crece a nivel empresa y hoy carga todo (o cuenta filas en JS sin ventana) · `medio` = crece
  por registro, o hay ventana pero no es obligatoria, o es un estado de workflow que normalmente es chico pero no
  tiene tope · `bajo` = acotado o ya paginado en servidor.
- **Qué hacer en el rediseño**: DataTable paginado en servidor · carga incremental ("ver más") para listas dentro de
  fichas/diálogos · búsqueda en servidor con límite para selectores · agregación en SQL para contadores ·
  `SimpleTable` solo si es acotado.

### Volumen de referencia (BD local, `pg_stat_user_tables`, 2026-10-07)

La BD local es un recorte (118 empleados, 120 vehículos; prod tiene ~652 empleados y ~377 equipos), pero sirve para
ver la **tasa** de crecimiento:

| Tabla | Filas | Lectura |
|---|---|---|
| `employees_diagram` | 39.865 | ~338 filas por empleado por año → en prod ~220k/año |
| `dailyreportrows` | 6.923 | ~22 líneas por parte (316 partes) |
| `dailyreportemployeerelations` / `dailyreportequipmentrelations` | 6.665 / 6.505 | 1 por línea |
| `certification_lines` | 3.328 | |
| `dailyreport_customer_equipment_relations` | 3.027 | |
| `remitos` | 2.919 | |
| `preparte` | 2.071 | |
| `daily_indicators` | 1.031 | 1 por día por indicador |
| `documents_employees` (+ `_logs`) | 957 (+957) | log 1:1 con cada alta/cambio |
| `checklist_answers` | 941 | |
| `clothing_delivery_items` / `clothing_deliveries` | 678 / 212 | |
| `documents_equipment` (+ `_logs`) | 666 (+666) | |
| `tires` | 208 | |
| `maintenance_activity_log` | 125 | crece con cada transición de pedido/orden |
| `maintenance_requests` / `maintenance_orders` / `work_orders` | 81 / 70 / 55 | módulo nuevo: recién empieza a acumular |
| `checklist_deviations` | 43 | |
| `invoices` | 8 | módulo recién liberado |

## Resumen

| Sección | Superficies | Estado actual | Alto | Medio | Bajo |
|---|---|---|---|---|---|
| 1. DataTables nuevas | 72 | 64 paginadas en servidor · 2 `slice` en memoria · 6 reciben el array completo (5 con `inMemory`: 3 de RRHH y 2 historiales de un equipo; 1 sin el flag) | 2 | 3 | 67 |
| 2. `BaseDataTable` en uso | 18 | 18 cargan todo (paginan en el navegador) | 1 | 8 | 9 |
| 3. Tablas manuales, listas, historiales y comentarios | 45 filas (las de riesgo bajo agrupan varios componentes) | carga todo / por registro; 2 con `limit` fijo que corta en silencio (OT del operario: 50; tickets: 200) | 4 | 17 | 24 |
| 4. Selectores con catálogos completos | 17 | 14 cargan todo un catálogo que crece; 3 ya buscan en servidor o son chicos | 0 | 14 | 3 |
| 5. Contadores, estadísticas y facetas | 18 | traen filas para contar en JS | 3 | 10 | 5 |
| 6. Exportaciones | 8 grupos | todo lo filtrado, sin tope (1 ZIP corta en silencio a la página cargada) | 1 | 6 | 1 |
| 7. Stores globales y cargas muertas | 4 | cargan todo y nadie lo lee | 2 | 1 | 1 |
| **Total** | **182** | | **13** (12 distintas: Formularios aparece en §1 y §5) | **59** | **110** |

### Riesgo alto: lo primero a resolver

1. **Comercial → Partes diarios** (`Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx:613`,
   BaseDataTable): `getFilteredDailyReportRows` (`Operaciones/Certificacion/actions/queries.server.ts:117`) solo exige
   la empresa; Buscar sin filtros trae **todas** las líneas de parte de la historia, con sus relaciones. §2.
2. **Grilla de diagramas** (`Employees/Diagrams/DiagramEmployeeView.tsx:331`): `searchEmployeeDiagrams`
   (`Employees/Diagrams/actions/diagram-search-actions.ts:110`) trae el historial **completo** de diagramas de cada
   empleado (el include anidado no tiene `where`) aunque la vista muestra 30 días, y refetchea todo cada 60 s. §3.1.
3. **Carga masiva de diagramas** (`Employees/Diagrams/components/EmployeeSelectionGrid.tsx:106`): misma query, los
   diagramas ni se usan. §3.1.
4. **Diagramas en la ficha del empleado** (`Employees/Diagrams/table/DiagramDetailTable.tsx:89`): `getEmployeeDiagrams`
   (`Employees/EmpleadoID/actions.server.ts:418`) trae todos los diagramas del empleado (~338/año) y filtra fechas en
   el cliente. §3.1.
5. **Respuestas de un formulario** (`Formularios/components/tables/data-table-answer.tsx:36`, `/dashboard/forms/[id]`):
   todas las respuestas, paginadas en el navegador. §3.1.
6. **Equipos con desvíos** (`Mantenimiento/EquiposConDesvios/actions.server.ts:111`): arma el dataset con **todos** los
   desvíos históricos de la empresa y pagina con `slice`. §1.1.
7. **Lista de Formularios** (`Formularios/Formularios/actions.server.ts:178,192`): trae el id de cada respuesta de
   checklist solo para contarlas. §1.1 y §5.
8. **Faceta "Puesto" del Reporte de diagramas** (`Employees/Diagrams/Reports/actions.server.ts:390`): recorre
   `employees_diagram` sin ventana para contar en JS. §5.
9. **Facetas "Afectación" de documentos mensuales** (`DocumentosEmpleados/Mensuales/actions.server.ts:785`,
   `DocumentosEquipos/Mensuales/actions.server.ts:782`). §5.
10. **Export del Reporte de diagramas** (`Employees/Diagrams/Reports/actions.server.ts:270`): sin ventana de fechas. §6.
11. **Store `loggedUser` → `getStoreDocuments`** (`src/shared/actions/session.server.ts:103`): todos los documentos de
    la empresa a memoria, y nadie los lee. §7.
12. **Store `loggedUser` → `getStoreEmployees`** (`session.server.ts:189`): todos los empleados con todos sus
    documentos, y nadie los lee. §7.

Patrones que se repiten y conviene resolver una sola vez en el rediseño: **historiales y comentarios por registro sin
"ver más"** (actividad de mantenimiento, historial de líneas de parte, cambios de preparte, revisiones de precio,
diagramas logs), **selectores que traen el árbol completo de clientes** (parte diario, preparte, comercial) y
**facetas M:M que cuentan en JS** (afectaciones de documentos).

---

## 1. DataTables nuevas (`@/shared/components/common/DataTable`) — 72

Verificado con un barrido de los 72 archivos que montan `<DataTable>` y de las 66 funciones `get*Paginated`
(cuerpo de la función hasta el siguiente `export`, buscando `skip`/`take`/`stateToPrismaParams`). Las
`getXxxPaginated` que parecían sin paginar (`getPersonasDocTypesPaginated`, `getEquiposDocTypesPaginated`,
`getCompanyUsersPaginated`, `getMaintenanceOrdersPaginated`) son wrappers de una función interna que sí pagina.

**Resultado: 64 paginadas en servidor de verdad · 2 con `slice` en memoria · 6 que reciben el array completo.**

### 1.1 Las 8 que NO paginan en servidor

| Riesgo | DataTable | Server action | Entidad | Clase | Estado | Qué hacer |
|---|---|---|---|---|---|---|
| **alto** | `Mantenimiento/EquiposConDesvios/components/_EquiposConDesviosDataTable.tsx` | `Mantenimiento/EquiposConDesvios/actions.server.ts:111` (`getPendingDeviationsAggregateCached`) → `:281` `dataset.slice(skip, skip+take)` | Equipos con desvíos sin pedido | crece | slice en memoria: trae **todos** los `checklist_deviations` históricos de la empresa (no solo los pendientes) y después un `IN` con todos sus ids contra `maintenance_request_items` para descartar los que ya tienen pedido | Mover el "pendiente" a SQL (`NOT EXISTS` sobre `maintenance_request_items`) y agrupar por equipo en la BD (`groupBy`/`$queryRaw` con `count` + `max(created_at)`); paginar sobre el agregado. Está cacheado (`use cache`), lo que esconde el costo pero no lo elimina |
| **alto** | `Formularios/Formularios/components/_FormsDataTable.tsx` (SSR) | `Formularios/Formularios/actions.server.ts:152` (`getFormsPaginated`) | Formularios (plantillas de checklist + `custom_form`) | acotado (plantillas) | slice en memoria; el problema es que para cada plantilla trae `checklist_answers: { select: { id } }` y `form_answers: { select: { id } }` **solo para contarlos** (`.length`) → la lista de plantillas arrastra todas las respuestas históricas | Reemplazar por `_count: { select: { checklist_answers: true } }` (las respuestas de checklist son ~1 por equipo por día: en prod ~130k/año). Las plantillas son pocas: paginar en memoria es aceptable una vez sacado el arrastre. El export `getAllFormsForExport` (`:297`, `:311`) tiene el mismo problema |
| **medio** | `Mantenimiento/ApprovalInbox/components/_ValidationOrdersDataTable.tsx:230` (`totalRows={data.length}`, `searchParams={{}}`, **sin** `inMemory`) | `Mantenimiento/ApprovalInbox/actions/actionsServer.ts:249` (`getOrdersPendingValidationCached`) | Órdenes pendientes de validación de taller | crece (acotado por estado) | carga todo con `where: { status: 'pending_workshop_validation' }`, sin tope. Como no lleva `inMemory`, `manualPagination` queda activo y **todas las filas se dibujan en una sola página** (la paginación no funciona) | DataTable con `queryFn` paginado en servidor (mismo patrón que Seguimiento) |
| **medio** | `Equipos/OtherEquipment/maintenance/OtherEquipmentMaintenanceTable.tsx` (`inMemory`) | `Equipos/OtherEquipment/maintenance/actions.server.ts:23` (`getMaintenanceOrdersForOtherEquipment`) | Historial de órdenes de mantenimiento de UN equipamiento (con sus ítems) | crece (por registro) | filtrado por registro, carga todo | DataTable paginado en servidor (crece con la vida útil del equipo; cada orden trae sus ítems) |
| **medio** | `Equipos/EquipoID/components/rejected-requests/VehicleRejectedRequestsTable.tsx` (`inMemory`) | `Equipos/EquipoID/lib/actions/vehicle-operations-actions.ts:100` (`getRejectedRequestsForEquipment`) | Solicitudes rechazadas de UN equipo | crece (por registro) | filtrado por registro, carga todo | Paginado en servidor junto con el resto del historial del equipo (ver §2, `vehicle-operations-history`) |
| bajo | `Dashboard/Estadisticas/RecursosHumanos/components/DailyAbsenceTable/_DailyAbsenceDataTable.tsx` (`inMemory`) | `Dashboard/Estadisticas/RecursosHumanos/actions.server.ts:194` (`hr_get_daily_absence_timeseries`) | Ausentismo diario del mes en curso | acotado (≤31 filas) | ventana (mes actual, agregado en SQL) | `SimpleTable` o DataTable `inMemory` está bien |
| bajo | `Dashboard/Estadisticas/RecursosHumanos/components/DepartmentSummaryTable/_DepartmentSummaryDataTable.tsx` (`inMemory`) | `…/RecursosHumanos/actions.server.ts:241` (`hr_get_department_absence_summary`) | Resumen por departamento | acotado | agregado en SQL | `SimpleTable` |
| bajo | `Dashboard/Estadisticas/RecursosHumanos/components/EmployeeAbsenceTable/_EmployeeAbsenceDataTable.tsx` (`inMemory`, también dentro del modal de ausentismo diario) | `…/RecursosHumanos/actions.server.ts:172` (`hr_get_current_absent_employees`) | Ausentes de un día | acotado (≤ plantilla) | ventana (un día) | DataTable `inMemory` está bien |

### 1.2 Las 64 paginadas en servidor (riesgo bajo en la grilla)

Todas con `skip/take` reales. Las de entidades que crecen quedan bien resueltas; las de catálogos también (sobra,
pero no molesta). `SSR` = sin `queryFn`, el Server Component pagina y la navegación hace `router.push` (sigue
paginando en servidor, solo es más lenta al filtrar: conviene pasarlas a `queryFn` en el rediseño).

| Entidad | Clase | DataTable → server action |
|---|---|---|
| Respuestas de checklist (SSR) | crece | `Checklists/ChecklistAnswers/components/_ChecklistAnswersDataTable.tsx` → `Checklists/ChecklistAnswers/actions.server.ts:240` |
| Entregas de indumentaria (todas) | crece | `Clothing/AllDeliveries/…/_AllDeliveriesDataTable.tsx` → `Clothing/AllDeliveries/AllDeliveriesList/actions.server.ts:194` |
| Entregas por empleado | crece | `Clothing/EmployeeDeliveries/…/_EmployeeDeliveriesDataTable.tsx` → `…/EmployeeDeliveriesList/actions.server.ts:141` |
| Reportes de indumentaria | crece | `Clothing/ClothingReports/…/_ClothingReportsDataTable.tsx` → `…/ClothingReportsList/actions.server.ts:162` |
| Marcas / prendas / talles de indumentaria | acotado | `_ClothingBrandsDataTable`, `_ClothingItemsDataTable`, `_ClothingSizesDataTable` → `actions.server.ts:65/65/61` |
| Facturas | crece | `Comercial/Facturacion/list/_InvoicesDataTable.tsx` → `Comercial/Facturacion/list/actions.server.ts:222` |
| Documentos por vencer (empleados / equipos) | crece | `Dashboard/Documentacion/{Empleados,Vehiculos}/_…ExpiringDocsDataTable.tsx` → `actions.server.ts:108` / `:157` |
| KPIs | acotado | `Dashboard/Estadisticas/KPIs/Indicadores/_KpisIndicadoresDataTable.tsx` → `actions.server.ts:118` |
| Empleados disponibles / vehículos disponibles / en reparación (diálogos del inicio) | acotado (plantilla/flota) | `Dashboard/Principal/components/Available{Employees,Vehicles}Dialog.tsx`, `VehiclesOnRepairDialog.tsx` → `Dashboard/Principal/actions/rrhh.server.ts:390`, `fleet.server.ts:373`, `:445` |
| Documentos de empleados (mensuales / permanentes) | crece | `Documentacion/DocumentosEmpleados/{Mensuales,Permanentes}/…` → `Mensuales/actions.server.ts:308`, `Permanentes/actions.server.ts:203` |
| Documentos de equipos (mensuales / permanentes) | crece | `Documentacion/DocumentosEquipos/{Mensuales,Permanentes}/…` → `Mensuales/actions.server.ts:306`, `Permanentes/queries.server.ts:16` |
| Documentos de empresa (mensuales / permanentes, SSR) y en Configuración (SSR) | crece | `Documentacion/DocumentosEmpresa/components/_CompanyDocs{Mensuales,Permanentes}DataTable.tsx`, `Empresa/General/Documentacion/components/_CompanyDocsDataTable.tsx` → `Documentacion/DocumentosEmpresa/actions.server.ts:222`, `Empresa/General/Documentacion/actions.server.ts:139` |
| Tipos de documento (personas / equipos / empresa) | acotado | `Documentacion/TiposDocumentos/{Personas,Equipos,Empresa}List/…` → `TiposDocumentos/actions/queries.server.ts:211/215/219` |
| Reporte de diagramas | crece (el que más) | `Employees/Diagrams/Reports/components/_DiagramReportsDataTable.tsx` → `Employees/Diagrams/Reports/actions.server.ts:215` (ver §5 y §6: su faceta "Puesto" y su export no tienen ventana) |
| Empleados | crece (lento) | `Employees/Empleados/EmployeeList/components/_EmployeeDataTable.tsx` → `EmployeeList/actions.server.ts:270` |
| Pre legajos | crece | `Seleccion/components/PreEmployeeList/components/_PreEmployeeDataTable.tsx` → `PreEmployeeList/actions.server.ts:137` |
| Accesos externos (clientes API) | acotado | `Empresa/AccesosExternos/list/_ExternalApiClientsDataTable.tsx` → `actions.server.ts:143` |
| Marcas / modelos / titulares / tipos / subtipos de equipo | acotado | `Empresa/Equipos/*/_…DataTable.tsx` → `Empresa/Equipos/*/actions.server.ts` (78, 103, 81, 108, 117) |
| Vehículos de un titular | crece (lento) | `Empresa/Equipos/EquipmentOwners/_VehiclesByOwnerDataTable.tsx` → `EquipmentOwners/actions.server.ts:365` |
| Centros de costo / jerarquías / aptitudes / tipos de contrato / tipos de diagrama / puestos / diagramas de trabajo | acotado | `Empresa/General/{CostCenter,Hierarchy}`, `Empresa/RRHH/*` → `actions.server.ts` (74, 74, 88, 74, 108, 94, 109) |
| Usuarios de la empresa | acotado | `Empresa/Usuarios/table/_UsersDataTable.tsx` → `Empresa/Usuarios/actions.server.ts:436` |
| Órdenes de gomería de UN vehículo | crece (por registro) | `Equipos/EquipoID/components/vehicle-tires/vehicle-tire-orders/_VehicleTireOrdersDataTable.tsx` → `vehicle-tires/actions.server.ts:468` |
| Equipos / otros equipos / dados de baja | crece (lento) | `Equipos/Equipos/{VehicleList,DadosDeBaja/*}/…`, `Equipos/OtherEquipment/list/…` → `actions.server.ts:301`, `:237`, `:230`, `OtherEquipment/list/actions.server.ts:245` |
| Cubiertas / marcas / tipos / plantillas de gomería | acotado–crece (cubiertas) | `Mantenimiento/Gomeria/{Catalogo,Marcas,Tipos,Plantillas}/…` → `actions/actions.server.ts` (120, 65, 66, 104) |
| Órdenes de gomería | crece | `Mantenimiento/Gomeria/Ordenes/components/_ServiceOrdersDataTable.tsx` → `Gomeria/Ordenes/actions/actions.server.ts:114` |
| Órdenes de mantenimiento (En taller) | crece | `Mantenimiento/MaintenanceOrders/table/components/_MaintenanceOrderDataTable.tsx` → `MaintenanceOrders/table/actions.server.ts:419` |
| Pedidos pendientes / confirmados | crece | `Mantenimiento/PedidosMantenimiento/{Pendientes,Confirmados}/…` → `Pendientes/actions.server.ts:158`, `Confirmados/actions.server.ts:319` |
| Solicitudes de mantenimiento | crece | `Mantenimiento/SolicitudesMantenimiento/_MaintenanceRequestDataTable.tsx` → `SolicitudesMantenimiento/actions/actionsTableServer.ts:141` |
| Seguimiento en taller | crece | `Mantenimiento/WorkshopTracking/_WorkshopTrackingDataTable.tsx` → `WorkshopTracking/actions.server.ts:298` |
| Tareas por sector (taller) | crece | `Mantenimiento/WorkshopView/WorkshopSectorTasksTable/_WorkshopSectorTasksDataTable.tsx` → `actions.server.ts:257` |
| Órdenes (gestión) — **código muerto** (README) | crece | `Mantenimiento/OrderManagement/_OrderManagementDataTable.tsx` (SSR) → `OrderManagement/actions.server.ts:264` |
| Selector de empleados / equipos del parte | acotado (plantilla/flota) | `Operaciones/PartesDiarios/detail/components/{Employee,Equipment}Selector/…` → `actions.server.ts:223` / `:210` |
| Líneas de un parte diario | crece (por registro, ~22/parte) | `Operaciones/PartesDiarios/detail/components/_DailyReportDetailDataTable.tsx` → `PartesDiarios/detail/queries.server.ts:60` |
| Partes diarios (SSR) | crece | `Operaciones/PartesDiarios/list/components/_DailyReportDataTable.tsx` → `PartesDiarios/list/actions.server.ts:100` |
| Prepartes | crece | `Operaciones/Preparte/list/components/_PreparteDataTable.tsx` → `Preparte/list/actions.server.ts:235` |

---

## 2. Tablas del sistema viejo (`BaseDataTable`) en uso — 18

**Ninguna pagina en servidor.** `BaseDataTable` (`src/shared/components/data-table/base/data-table.tsx:234`) siempre
recibe el array completo y pagina en el navegador con `getPaginationRowModel` (10 filas por página). La variante
`data-table-server.tsx` tiene modo `serverSide`, pero ninguna feature la usa. Todas son "carga todo"; lo que cambia
es si lo que cargan crece.

| Riesgo | Tabla (dónde se monta) | Query | Entidad | Clase | Estado | Qué hacer al migrar (Fase 5) |
|---|---|---|---|---|---|---|
| **alto** | `Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx:613` (Comercial → Partes diarios, desde `Comercial/Comerce/components/DailyReportWrapper.tsx:672`) | `Operaciones/Certificacion/actions/queries.server.ts:117` (`getFilteredDailyReportRows`) | Líneas de parte diario con empleados, equipos, remitos, áreas y sectores | crece (la tabla que más crece del negocio) | carga todo: el único filtro obligatorio es `dailyreport.company_id`; fechas, cliente, contrato, ítem y estado son opcionales, y el botón Buscar (`DailyReportWrapper.tsx:621`) se habilita sin filtros | DataTable paginado en servidor (`queryFn`) con **rango de fechas obligatorio** (default: mes en curso) |
| medio | `Employees/Empleados/components/tables/data/employees-table.tsx:138` (ficha del cliente → Empleados, `Empresa/Clientes/components/CustomerDetail/CustomerEmployeesTab.tsx:85`) | `src/shared/actions/employees.actions.ts:53` (`fetchAllEmployees2`) | Empleados afectados al cliente | crece (activos e inactivos, con 8 relaciones) | carga **todos** los empleados de la empresa y filtra por cliente en el navegador | DataTable paginado en servidor con `contractor_employee: { some: { contractor_id } }` en el `where` |
| medio | `Empresa/Clientes/components/CustomerDetail/CustomerEquipmentTab.tsx:162` (ficha del cliente → Equipos) | `src/shared/actions/equipment.actions.ts:83` (`fetchAllEquipment`) | Equipos afectados al cliente | crece | carga todos los vehículos de la empresa con relaciones y filtra en el navegador (también alimenta el `AssignmentDialog`) | Igual que la anterior, filtrando por `contractor_equipment` |
| medio | `Mantenimiento/Operaciones/components/OperacionesTableClient.tsx:97` (Equipos → Mantenimiento) | `Mantenimiento/Operaciones/actions/queries.server.ts:28` (`getMaintenanceOperations`, `status: 'scheduled'`) | Órdenes programadas | crece (acotado por estado) | carga todo | DataTable paginado en servidor |
| medio | `Mantenimiento/Operaciones/components/OperacionesPlanificadasTableClient.tsx:86` (Equipos → Mantenimiento) | misma query `:28` | Órdenes planificadas | crece (acotado por estado) | carga todo | DataTable paginado en servidor |
| medio | `Mantenimiento/Operaciones/ParaTaller/components/ParaTallerTableClient.tsx:72` (Equipos → Mantenimiento) | `Mantenimiento/Operaciones/actions/queries.server.ts:127` (`getOrdersForWorkshop`, `status: 'date_confirmed'`) | Órdenes para taller | crece (acotado por estado) | carga todo | DataTable paginado en servidor |
| medio | `Equipos/EquipoID/components/vehicle-operations-history.tsx:316,365` (ficha del vehículo → Mantenimiento; SSR inicial en `src/app/dashboard/equipment/action/page.tsx:155`) | `Equipos/EquipoID/lib/actions/vehicle-operations-actions.ts:14` (`getMaintenanceOrdersForEquipment`) | Historial de órdenes de UN vehículo, con ítems → OT → ítems → reparaciones anidados | crece (por registro) | filtrado por registro, carga todo con anidado profundo | DataTable paginado en servidor; el detalle anidado se carga al abrir el diálogo |
| medio | `Empresa/Clientes/components/CustomersList.tsx:101` (Comercial → Clientes) | `Empresa/Clientes/actions/customers.server.ts:21` (`getCustomers`) | Clientes | crece (lento) | carga todo | DataTable paginado en servidor |
| medio | `Empresa/Clientes/components/Services/ServiceTable.tsx:277` (Comercial → Contratos y ficha del cliente: 2 montajes) | `Empresa/Clientes/actions/services.server.ts:48` (`getCustomerServices`) | Contratos | crece | carga todo (en la ficha trae todos los contratos de la empresa y filtra en el navegador, `CustomerContractsTab.tsx:12`) | DataTable paginado en servidor; en la ficha, filtrar por `customer_id` en el servidor |
| bajo | `Empresa/Clientes/components/area_clientes/areaTable.tsx:138` (ficha del cliente) | `Empresa/Clientes/actions/areas.server.ts:44` | Áreas del cliente | acotado | trae las áreas de toda la empresa y filtra en el navegador (`CustomerAreasTab.tsx:23`) | Filtrar por cliente en el servidor; `SimpleTable` |
| bajo | `Empresa/Clientes/components/sector_clientes/sectorTable.tsx:78` (ficha del cliente) | `Empresa/Clientes/actions/sectors.server.ts:28` | Sectores del cliente | acotado | igual que áreas (`CustomerSectorsTab.tsx:14`) | Filtrar por cliente en el servidor; `SimpleTable` |
| bajo | `Empresa/Clientes/components/equipos/customerEquipmentTable.tsx:89` (ficha del cliente, vía `CustomerOwnEquipmentTab.tsx:115`) | `Empresa/Clientes/actions/customer-equipment.server.ts:67` | Equipos propios del cliente | acotado | filtrado por registro | `SimpleTable` |
| bajo | `Empresa/Clientes/components/Services/ServiceItemsTable.tsx:225` (Comercial → Contratos) | `Empresa/Clientes/actions/service-items.server.ts:31` (`getServiceItemsByContract`) | Ítems de UN contrato | acotado | filtrado por registro | `SimpleTable` |
| bajo | `Empresa/Clientes/components/meansure_units/MensureUnitsTable.tsx:126` (Comercial → Unidades de medida) | `Empresa/Clientes/actions/measure-units.server.ts:22` | Unidades de medida | acotado | carga todo | `SimpleTable` |
| bajo | `Empresa/General/components/mantenimiento/talleres/TalleresTable.tsx:128` (Configuración → Mantenimiento) | `Empresa/General/actions/workshops.server.ts:89` (`fetchAllWorkshops`) | Talleres | acotado | carga todo | `SimpleTable` o DataTable `inMemory` |
| bajo | `Empresa/General/components/mantenimiento/sectores/SectoresTable.tsx:110` (Configuración → Mantenimiento) | `Empresa/General/actions/workshops.server.ts:205` (`fetchAllWorkshopSectors`) | Sectores de taller | acotado | carga todo | `SimpleTable` o DataTable `inMemory` |
| bajo | `Mantenimiento/TiposReparaciones/RepairTypeForm.tsx:485` (Configuración y Equipos → Mantenimiento) | `Mantenimiento/TiposReparaciones/actions/actions.ts:33` (`fetchAllTypesOfRepairs`) | Tipos de reparación | acotado | carga todo | DataTable `inMemory` o `SimpleTable` |
| bajo | `Mantenimiento/TiposReparaciones/MaintenanceGroupsTable.tsx:144` (Configuración y Equipos → Mantenimiento) | `Mantenimiento/TiposReparaciones/actions/maintenanceGroupActions.ts:182` | Grupos de mantenimiento | acotado | carga todo | DataTable `inMemory` o `SimpleTable` |

Son 18 filas: `ServiceTable` cuenta una vez aunque se monta en 2 lugares, y `CustomerEquipmentTab` y
`customerEquipmentTable` (que el README pone en la misma línea) cuentan por separado. Las 9 huérfanas del README no se
clasifican: se borran.

---

## 3. Tablas manuales, listas armadas a mano, historiales y comentarios

Superficies sin ningún DataTable: `<Table>` de shadcn, TanStack directo, `<table>`, y `.map` de registros en
tarjetas, acordeones o timelines.

### 3.1 Riesgo alto

| Superficie | Query | Entidad | Clase | Estado | Qué hacer |
|---|---|---|---|---|---|
| `Employees/Diagrams/EmployeesDiagramWrapper.tsx:53` → `Employees/Diagrams/DiagramEmployeeView.tsx:331` (grilla de diagramas: shadcn `<Table>`, una columna por día) | `Employees/Diagrams/actions/diagram-search-actions.ts:93` (`searchEmployeeDiagrams`): el `select` anidado de `employees_diagram` (`:110`) **no tiene `where` ni `take`** | Empleados + **todo su historial de diagramas** | crece (el que más: ~338 filas por empleado por año) | Los empleados se paginan de a 100 con "cargar más", pero cada página trae el historial completo de diagramas de cada empleado (en local, las ~40k filas) aunque la vista muestra 30 días. Además se refetchean todas las páginas cargadas cada 60 s (`REFETCH_INTERVAL_MS`, `:25`) | `where` con el rango visible (desde/hasta) en el include anidado; refetch solo de la ventana visible |
| `Employees/Diagrams/DiagramMassiveForm.tsx:160` → `components/EmployeeSelectionGrid.tsx:106` (grilla de tarjetas para elegir empleados) | mismo `searchEmployeeDiagrams` | Empleados (los diagramas se traen y no se usan) | crece | Mismo arrastre de diagramas completos | Búsqueda de empleados en servidor **sin** el include de diagramas |
| `Employees/EmpleadoID/components/EmployeeDiagramsSection.tsx:16` → `Employees/Diagrams/DiagramDetailEmployeeView.tsx:57` → `Employees/Diagrams/table/DiagramDetailTable.tsx:89` (TanStack directo + shadcn Table, paginación en cliente) | `Employees/EmpleadoID/actions.server.ts:418` (`getEmployeeDiagrams`) | Diagramas de UN empleado | crece (por registro, para siempre) | filtrado por registro, carga todo; el filtro de fechas corre en el cliente; el xlsx (`:140`) exporta el array cargado | Rango de fechas en el servidor (default 30 días) y DataTable paginado en servidor |
| `Formularios/components/tables/data-table-answer.tsx:36` (TanStack directo, paginación en cliente) vía `components/forms/CheckListAnwersTable.tsx`, en `src/app/dashboard/forms/[id]/page.tsx:128,150` | `Formularios/actions/form-actions.ts:106` (`fetchFormsAnswersByFormId`); para Invitado (`:90`) filtra el JSON `answer->>movil` en JS | Respuestas de UN formulario custom | crece | carga todo, sin ventana | DataTable paginado en servidor; el filtro por `movil` a SQL |

### 3.2 Riesgo medio

| Superficie | Query | Entidad | Clase | Estado | Qué hacer |
|---|---|---|---|---|---|
| `Comercial/Certificaciones/components/CertificacionesPanel.tsx:189,210` (shadcn Table) | `Comercial/Certificaciones/actions/certifications.server.ts:45` (`getCertifications`, solo `where: { company_id }`) | Certificaciones | crece (1 por contrato por período) | carga todo, sin filtro de período | DataTable paginado en servidor |
| `CertificacionesPanel.tsx:395,413` (líneas en el detalle) | `certifications.server.ts:73` (`getCertificationById`) | Líneas de UNA certificación (el propio código avisa que pueden ser cientos) | acotado por registro, pero grande | filtrado por registro | `SimpleTable` con carga incremental |
| `Equipos/EquipoID/components/vehicle-checklists-tab-content.tsx:21,69,83` (shadcn Table sin paginación; título "Historial (N)") | `Equipos/EquipoID/actions/checklist-queries.ts:14` (`getChecklistAnswersByEquipment`) | Respuestas de checklist de UN equipo (+ desvíos) | crece (~1 por día por equipo) | filtrado por registro, carga todo | DataTable paginado en servidor |
| `Mantenimiento/components/ActivityHistoryModal.tsx:771` (timeline), `:817/:833` (acordeón por OT), `:454` | `Mantenimiento/Operaciones/actions/activity-log.server.ts:142, 232, 290, 297, 304, 471, 491, 498` | `maintenance_activity_log` de UN pedido / orden / OT | crece por registro (cada transición, rechazo o devolución suma) | filtrado por registro, carga todo | Carga incremental "ver más" (cursor por `performed_at`) |
| `Mantenimiento/MaintenanceOrders/components/order-detail/ValidationHistoryList.tsx:125` (en `OrderDetailDialog.tsx:804`) | `Mantenimiento/MaintenanceOrders/actions/queries.server.ts:481` (`getValidationHistory`) | Historial de validaciones de UNA orden | crece por registro | carga todo | "ver más" |
| `Mantenimiento/ApprovalInbox/components/ApprovalInboxClient.tsx:316` (tarjetas "Autorizaciones") | `Mantenimiento/ApprovalInbox/actions/actionsServer.ts:44` (`status: 'pending_approval'`) | Tareas pendientes de autorización | crece (acotado por estado) | carga todo | Carga incremental o DataTable paginado |
| `ApprovalInboxClient.tsx:430` (tarjetas "Reasignaciones") | `actionsServer.ts:145` (`status: 'reassignment_requested'`) | Tareas devueltas | crece (acotado por estado) | carga todo | Igual que la anterior |
| `OperatorPanel/components/WorkOrderList.tsx:212,227,232` (lista de `WorkOrderCard`, filtros y búsqueda en cliente) | `OperatorPanel/actions/queries.server.ts:67` (`getWorkOrdersForOperator`, `status in OPEN_STATUSES`, **`take: 50`**) | OT abiertas del sector | crece (acotado por estado) | **limit fijo 50 que corta sin avisar**: el "N activas", los contadores de las pills y la búsqueda solo ven las primeras 50 | Paginado en servidor o "ver más", contadores con `count()`, búsqueda en servidor. La pestaña "Completadas" (`:116`) ya pagina de a 10, pero su búsqueda filtra solo la página cargada |
| `Operaciones/PartesDiarios/detail/components/HistoryDialog.tsx:562` (timeline) y `Operaciones/PartesDiarios/components/HistoryModal.tsx:203` | `Operaciones/PartesDiarios/detail/history.server.ts:24` y `PartesDiarios/actions/queries.server.ts:172` (`get_dailyreportrow_history`) | Historial de UNA línea de parte | crece por registro | carga todo | "ver más" |
| `Operaciones/Preparte/components/PreparteDetailModal.tsx:403` (timeline) | `Operaciones/Preparte/actions/queries.server.ts:73` y `:98` (`getPreparteChangeLogs…`) | Cambios de UN preparte / orden | crece por registro | carga todo | "ver más" |
| `Employees/Diagrams/table/DiagramDetailTable.tsx:265` (historial, slice en cliente) | `Employees/EmpleadoID/actions.server.ts:389` (`getEmployeeDiagramHistory`) | `diagrams_logs` de UN empleado | crece por registro | carga todo | "ver más" o paginado con filtro de fechas |
| `Empresa/Clientes/components/Services/PriceRevisionsDialog.tsx:156,167` (shadcn Table) | `Empresa/Clientes/actions/price-revisions.server.ts:45` | Revisiones de precio de UN ítem | crece por registro | carga todo | "ver más" |
| `Ayuda/components/HelpCenter.tsx:88` → `Ayuda/components/MyTicketsList.tsx:90,96` (tarjetas, "ver más" de a 5 en cliente) | `Ayuda/actions/support-tickets.ts:79,145` (`getMyTicketsWithUnread`, `limit: 200`) | Tickets del usuario | crece | **limit fijo 200 que corta sin avisar** los tickets viejos; además hace hasta 25 fetches de comentarios | Paginado en servidor: ya existen `getMyTicketsPageWithUnread` (`:169`) y `useMyTicketsPage`, sin usar (archivos del CLI, ver D6) |
| `Documentacion/TiposDocumentos/components/_VerifyDocumentsDialog.tsx:69,280,323` (`<table>`) | `Documentacion/TiposDocumentos/actions/consistency.server.ts:57` (findMany en `:118, 125, 198, 205`) | Recursos con documentos faltantes / huérfanos de UN tipo | crece (los mensuales suman por período) | muestra 20 con "quedan N" (no corta en silencio), pero el servidor trae todo | Anti-join y `count` en SQL; devolver 20 + total |
| `Formularios/components/forms/FormCardContainer.tsx:117,147` (shadcn Table sin paginación) | `Formularios/actions/form-actions.ts:106` | Respuestas de UN formulario | crece | carga todo; solo alcanzable tipeando `?form_id=` en `/dashboard/forms/new` (ruta sin enlaces, README) | Borrar con la ruta, o DataTable paginado |
| `Dashboard/Estadisticas/Mantenimiento/components/CategorySection.tsx:81,229` (lista `.map`) | `Dashboard/Estadisticas/Mantenimiento/actions/actions.server.ts:224,249` (`getMaintenanceCategoryVehicles`) | Vehículos de una categoría + sus relaciones de parte del mes | acotado (flota) × mes | ventana (1 mes), cuenta días trabajados en JS | Días trabajados en SQL; `SimpleTable` |
| `Empresa/Clientes/components/Services/contractDocuments.tsx:322,333` (shadcn Table) | `Empresa/Clientes/actions/services.server.ts:258` (genera una URL firmada por documento) | Documentos de UN contrato | crece por registro (lento) | carga todo + una firma por fila | `SimpleTable`; firmar la URL al pedirla |

### 3.3 Riesgo bajo (acotados o ya resueltos)

| Superficie | Entidad | Por qué es bajo | Qué hacer |
|---|---|---|---|
| `Comercial/Facturacion/components/detail/InvoiceDetail.tsx:295,328,384,410`, `components/editor/IncludedCertifications.tsx:73`, `components/ArcaMessagesList.tsx:5` | Líneas, IVA, ajustes y certificaciones de UNA factura | ítems de un registro | `SimpleTable` |
| `Comercial/Certificaciones/components/CertificacionesPanel.tsx:65,89` | Facturas de UNA certificación | ítems de un registro | `SimpleTable` |
| `Comercial/ReglasPrecio/components/ReglasPrecioPanel.tsx:87,106` (`Empresa/Clientes/actions/price-rules.server.ts:33`) | Reglas de precio | catálogo chico | `SimpleTable` |
| `Empresa/Clientes/components/Services/ServiceItemsSection.tsx:133,160` | Ítems de UN contrato | ítems de un registro | `SimpleTable` |
| `Empresa/Clientes/components/CustomerComponent.tsx:110` | Usuarios invitados | catálogo chico | `SimpleTable` |
| `Empresa/General/FiscalData/components/SalesPointsSection.tsx:102` | Puntos de venta | catálogo chico | `SimpleTable` |
| `Dashboard/Principal/components/ServicesSection.tsx:47,110` y `ServicesDetailDialog.tsx:42,190` (`Dashboard/Principal/actions/services.server.ts:54`) | Líneas de parte agrupadas por cliente | ventana de 1 día (agrupa en JS) | Agrupar en SQL; `SimpleTable` |
| `Dashboard/Estadisticas/KPIs/components/KpiDetailModal.tsx:30,128` (`KPIs/actions/actions.ts:136`) | Revisiones de UN KPI | crece muy lento | "ver más" si se alarga |
| `Dashboard/Estadisticas/Mantenimiento/components/MaintenanceByTypeCard.tsx:79,238,285` | Vehículos que entraron a taller en el mes | ventana de 1 mes | — |
| `Documentacion/DetalleDocumento/components/{CompanyInfoCard,DocumentTypeCard,EmployeeInfoCard,EquipmentInfoCard}.tsx` | UN documento (clave/valor). No hay UI de logs de documentos: se incluyen con `take: 1` | un registro | — |
| `Employees/Diagrams/DiagramFormUpdated.tsx:577,656`, `ConflictResolutionModal.tsx:119,185`, `DiagramMassiveResults.tsx:247,293,353` | Resultados / conflictos de una carga de diagramas | rango × empleados elegidos | `SimpleTable` (tope visible si la operación es enorme) |
| `Operaciones/PartesDiarios/components/ServiceDetailModal.tsx:251,331`, `detail/components/ServiceDetailDialog.tsx:207,269,333`, `detail/components/BulkEditModal.tsx:375`, `CloneRowsConflictView.tsx:41,54`, `Certificacion/components/BulkCertificacionModal.tsx:88` | Recursos de UNA línea / la selección / un parte | ítems de un registro | `SimpleTable` |
| `Operaciones/PartesDiarios/remitManager/components/RemitosManagerModal.tsx:133,161`, `RemitTab.tsx:126`; `LinkRemitoDialog.tsx:106` (`take: 10` con búsqueda en servidor) | Remitos de UNA línea / búsqueda de remitos | por registro / búsqueda con límite | — |
| `Mantenimiento/MaintenanceOrders/components/OrderDetailDialog.tsx` (`:354, 537, 635, 662, 686, 725`), `SectorTimeline`, `SectorCard`, `ExternalWorkshopCard`, `RequestedItemsDialog`, `OrderStatusSections`, `Operaciones/components/OperacionDetailDialog.tsx:100`, `ParaTaller/components/ParaTallerDetailDialog.tsx:147`, `components/ItemComments.tsx:116`, `components/ActivityHistory/RequestItemComments.tsx:89` (`operations-select.ts:191`), diálogos de Pedidos y Solicitudes, `OrderManagement/components/wizard/*` | Hijos y comentarios de UNA orden / pedido / ítem | ítems de un registro | `SimpleTable` / acordeón; "ver más" en comentarios si los hilos se alargan |
| `Equipos/EquipoID/components/equipment-order-detail-dialog.tsx:397,464,646,689` | Log, OT y comentarios de UNA orden | por registro, acotado | — |
| `Mantenimiento/WorkshopView/components/WorkshopSectorsAccordion.tsx:137` | Sectores con contadores (`groupBy` en SQL); cada sector contiene un DataTable paginado | acotado | — |
| `Mantenimiento/WorkshopView/WorkshopSectorTasksTable/components/WorkOrderTasksDialog.tsx:97,177`, `OperatorPanel/components/WorkOrderDetail/TaskList.tsx:137,219` | Tareas de UNA OT | ítems de un registro | — |
| `Mantenimiento/Gomeria/Ordenes/components/ServiceOrderDetailView.tsx:134` (shadcn Table) | Ítems de UNA orden de gomería | ítems de un registro | `SimpleTable` |
| `Equipos/OtherEquipment/components/OtherEquipmentCertifications.tsx:65,266`, `Equipos/EquipoID/components/vehicle-tires/vehicle-tire-diagram-section.tsx:83` | Certificaciones / posiciones de cubiertas de UN equipo | acotado | — |
| `Seleccion/components/PreEmployeeDocumentChecklist.tsx:48,115` | Tipos de documento × UN candidato | acotado | — |
| `Ayuda/components/ApproverAllTickets.tsx:30` (paginado en servidor), `ApproverInbox.tsx:30` / `detail/TicketApprovalBanner.tsx:24` (`limit 100`), `detail/TicketCommentsThread.tsx:22,35`, `TicketTimeline.tsx:39,63`, `detail/TicketAttachmentsList.tsx:35` | Tickets a aprobar / comentarios y adjuntos de UN ticket | paginado, pendiente de aprobación, o por registro | "ver más" en comentarios si se alargan; mostrar total en la bandeja de aprobación |
| `UserPermissionsManager/components/ManageRoleUsersDialog.tsx:36,123,140` (`Permissions/actions/roles.server.ts:250,266`) | Usuarios de la empresa | acotado | — |
| `Mantenimiento/Checklists/components/checklists-list-client.tsx:64`, `Empresa/CCT/components/TreeFile.tsx` | Plantillas activas / gremio → convenio → categoría | catálogos | — |
| `Clothing/AllDeliveries/AllDeliveriesList/components/DeliveryCard.tsx:61` | Tarjeta mobile de una fila del DataTable paginado (`items.slice(0,3)`) | ya paginado | — |

---

## 4. Selectores y comboboxes que cargan catálogos completos

Los catálogos chicos (tipos, marcas, puestos, sectores, convenios, talles…) están bien cargados enteros. Acá van solo
los que crecen con la operación (empleados, equipos, clientes con todo su árbol, cubiertas):

| Riesgo | Selector | Query | Catálogo | Estado | Qué hacer |
|---|---|---|---|---|---|
| medio | `Operaciones/PartesDiarios/detail/components/DailyReportRowForm/EmployeeSection.tsx:53` | `Operaciones/PartesDiarios/detail/form-data.server.ts:176` (`getEmployeesForForm`) | Empleados activos con relaciones, al abrir el form de línea | carga todo | Reusar el `EmployeeSelector` paginado que ya existe, o búsqueda en servidor con límite |
| medio | `…/DailyReportRowForm/EquipmentSection.tsx:123,337` | `form-data.server.ts:227`, `:273` | Vehículos y otros equipos | carga todo | Búsqueda en servidor con límite |
| medio | `…/DailyReportRowForm/CustomerServiceSection.tsx:155,305` | `form-data.server.ts:24` (`getCustomersForForm`) | Clientes con contratos e ítems anidados | carga todo | Contratos e ítems por cliente, a demanda |
| medio | `Comercial/Comerce/components/DailyReportWrapper.tsx:477-568` (9 `MultiSelectCombobox`) | `Operaciones/Certificacion/actions/catalogs.server.ts:14-136` | Clientes, contratos, empleados, vehículos, ítems de todos los contratos, equipos del cliente, áreas, sectores | carga todo | Búsqueda en servidor con límite para empleados, vehículos e ítems |
| medio | `Operaciones/Certificacion/components/DailyReportRowFormRefactored.tsx:35`, `form-sections/CustomerDataSection.tsx:128,257`, `form-sections/ResourcesSection.tsx:120,247` | `Operaciones/PartesDiarios/actions/comercial-rows.server.ts:24, 96, 111` (la de empleados filtra solo por empresa, **no por activos**, pese al nombre) | Clientes con todo su árbol; empleados; vehículos | carga todo | Igual que arriba |
| medio | `Operaciones/Preparte/list/PreparteList.tsx:36` → `components/PreparteManager.tsx` → `preparte-form/CustomerContractSection.tsx:52,84`, `PreparteReportModal.tsx:540` | `Operaciones/Preparte/actions/actions.ts:22` (`fetchCustomersWithRelations`) + `Equipos/EquipoID/actions/vehicle-actions.ts` (`fetchAllContracts`) | Clientes con contratos, ítems, sectores, áreas y equipos, **en cada render de la lista** | carga todo | Opciones livianas + carga por cliente (los helpers por contrato de `usePreparteFormOptions` ya existen) |
| medio | `Empresa/Clientes/components/CustomerDetail/AssignmentDialog.tsx` | `src/shared/actions/employees.actions.ts:53`, `src/shared/actions/equipment.actions.ts:83` | Todos los empleados / vehículos | carga todo | Búsqueda en servidor con límite |
| medio | `Comercial/Certificaciones/components/CertificacionesPanel.tsx:274,301` (alta), `Comercial/ReglasPrecio/components/PriceRuleFormDialog.tsx:252` | `Comercial/Certificaciones/CertificacionesTabContent.tsx:15` (`getCustomerServices` con includes completos solo para opciones), `price-rules.server.ts:72` | Clientes / contratos | carga todo | Query de opciones liviana con búsqueda en servidor |
| medio | `Mantenimiento/NuevoPedido/components/nuevo-pedido/StepEquipmentSelector.tsx:130` (muestra "Mostrando X de Y") | `Mantenimiento/actions/equipment-basic.ts:25` (`vehicles.findMany(withCompany({}))`, **incluye inactivos**) | Flota | carga todo | Búsqueda en servidor con límite (el patrón `searchEquipmentByDomain`, `take: 10`, ya existe) |
| medio | `Mantenimiento/Gomeria/Ordenes/components/TireReplacePicker.tsx:106` (filtro en cliente `:53`) | `Mantenimiento/Gomeria/Ordenes/actions/actions.server.ts:796` (`status in ['AVAILABLE','MISSING']`) | Stock de cubiertas | carga todo | Búsqueda en servidor con límite |
| medio | `Checklists/components/sections/ChecklistGeneralInfoSection.tsx:98` (equipo) y `:285` (chofer, solo dashboard) | `Checklists/actions/checklist-queries.ts:238`, `Checklists/actions/actionsServer.ts:314` | Flota activa del tipo / empleados activos | carga todo | Búsqueda en servidor con límite; en QR alcanza con el equipo escaneado |
| medio | `src/app/dashboard/forms/[id]/view/page.tsx:30,100`, `view/[answerId]/page.tsx:45` | `src/shared/actions/equipment.actions.ts:55` (`fetchAllEquipment`, activos e inactivos) + clientes y empleados | Flota / clientes / empleados **para mostrar UNA respuesta** | carga todo | Traer solo el equipo seleccionado |
| medio | `Documentacion/shared/components/SimpleDocument.tsx:83,261` (Command) | `Documentacion/shared/actions/document-resources.server.ts:52` | Empleados / vehículos activos | carga todo | Búsqueda en servidor con límite |
| medio | `Documentacion/shared/components/UploadDocumentMultiEmployee.tsx:168,209` / `UploadDocumentMultiEquipment.tsx:171,213` | `src/shared/actions/documents.server.ts:144` (`getAllDocumentsByIdDocumentTypeCientSide`: todos los `applies` del tipo, todos los períodos) | Documentos existentes del tipo | carga todo (crece por período en los mensuales) | Filtrar por el `period` elegido, o `distinct applies` |
| bajo | `Checklists/components/sections/HitchEquipmentDialog.tsx:63`, `Mantenimiento/NuevoPedido/…/NuevoPedidoChecklistForm.tsx:178` | `checklist-queries.ts:492`, `equipment-basic.ts:190` | Vehículos compatibles / otros equipos activos | carga todo (filtrado) | Búsqueda con límite si la flota crece |
| bajo | `Comercial/Facturacion/components/new/ManualInvoiceForm.tsx:89`, `Employees/Diagrams/DiagramFormUpdated.tsx:85`, `Empresa/Contactos/components/ContactComponent.tsx:180` | `invoices.server.ts:255`, `Employees/Diagrams/actions/queries.server.ts:29`, `contacts.server.ts:46` | Clientes / empleados activos | carga todo | Búsqueda en servidor si pasan ~1–2k |
| bajo (ya bien) | `Clothing/ClothingDelivery/components/StepSelectEmployee.tsx:49,123`, `Mantenimiento/AnonymousLogin/components/EquipmentSelectionStep.tsx:81`, `Mantenimiento/Gomeria/Ordenes/components/ServiceOrderWizard.tsx:331,409`, `Empresa/Usuarios` (`searchEmployeesForLink`), `src/shared/components/common/_MultiSelectField.tsx:78`, `src/shared/components/modal/dependency-utils.ts:96,108` | `take` 50 / 10 / 20 con búsqueda en servidor | — | búsqueda con límite | Indumentaria: sin texto corta en 50 por orden alfabético sin decirlo → agregar "Mostrando 50, escribí para buscar" |

---

## 5. Contadores, estadísticas y facetas que traen filas para contarlas en JS

| Riesgo | Dónde | Query | Qué cuenta | Estado | Qué hacer |
|---|---|---|---|---|---|
| **alto** | Faceta "Puesto" del Reporte de diagramas | `Employees/Diagrams/Reports/actions.server.ts:390` | Todas las filas de `employees_diagram` que cumplen el filtro, para agrupar por puesto | sin ventana de fechas por defecto (`buildWhereClause`, `:83`): con la tabla entera son ~220k filas/año en prod | `GROUP BY` en SQL (`$queryRaw` con join a `employees`) + ventana de fechas por defecto |
| **alto** | Faceta "Afectación" de documentos mensuales de empleados y de equipos | `Documentacion/DocumentosEmpleados/Mensuales/actions.server.ts:785`, `Documentacion/DocumentosEquipos/Mensuales/actions.server.ts:782` | Todos los documentos mensuales que cumplen el filtro, con sus afectaciones | crecen todos los meses | `GROUP BY` en SQL a través del join |
| **alto** | Lista de Formularios (ver §1.1) | `Formularios/Formularios/actions.server.ts:178,192` | ids de todas las respuestas de cada plantilla | sin ventana | `_count` |
| medio | 7 facetas de documentos permanentes de equipos | `Documentacion/DocumentosEquipos/Permanentes/facets.server.ts:152, 185, 216, 247, 280, 311, 342` | Documentos permanentes que cumplen el filtro | crece con la flota | `groupBy`/SQL |
| medio | Faceta sub_type/titular de documentos por vencer de vehículos | `Dashboard/Documentacion/Vehiculos/actions.server.ts:397` | Documentos filtrados | ventana de 30 días | SQL con join |
| medio | Bandeja de aprobaciones: badges `pendingTasks.length` / `returnedTasks.length` | `Mantenimiento/ApprovalInbox/components/ApprovalInboxClient.tsx:246` | filas cargadas | acotado por estado | `count()` (ya existe en `Mantenimiento/Pipeline/TallerPipeline/actions/pipeline-counts.server.ts:144,158`) |
| medio | Badge "N OT" del panel de operario | `OperatorPanel/components/OperatorHeader.tsx:24` | las 50 filas truncadas (§3.2) | corta en 50 | `count()` |
| medio | Alerta de desvíos pendientes del equipo (panel QR, modal de EquiposConDesvios, ficha del vehículo) | `Mantenimiento/actions/maintenance-actions.ts:346` (`getPendingDeviations`), usado en `src/shared/components/pending-deviations-alert.tsx:24,78`, `critical-deviations-repair-modal.tsx:438,465`, `_EquiposConDesviosDataTable.tsx:108` y `Equipos/EquipoID/components/vehicle-checklists-tab-content.tsx:28` (solo para `.length > 0`) | **todos** los desvíos históricos del equipo; filtra los pendientes en JS (`:382`) | por registro, crece | Filtrar pendientes en SQL; `count()` / `findFirst` para el badge |
| medio | Badge de tickets sin leer en el sidebar, **en cada página del dashboard** | `Layout/sidebar/components/NavMain.tsx:84` → `useUnreadSupportTicketsCount` → `Ayuda/actions/support-tickets.ts:79` | hasta 200 tickets + hasta 25 fetches de comentarios | limit 200 | Endpoint de conteo dedicado |
| medio | Sala de Control → Gestión de pedidos | `Dashboard/Estadisticas/SalaDeControl/actions/preparte-kpi.server.ts:42` (`getPreparteKpiData`) | 12 meses de prepartes agregados en JS por día/cliente/estado | ventana fija de 12 meses, alto volumen | `groupBy date_trunc('day'), customer_id, status` en SQL |
| medio | Estadísticas → Operaciones | `Dashboard/Estadisticas/Operaciones/actions/actions.server.ts:55` (CTE `row_cost_center_pairs`, `:65-71`) | agrega en SQL, pero la CTE agrupa **toda** `dailyreportequipmentrelations` sin filtro de empresa ni fecha | 12 meses en el resto de la query | Filtro de empresa y fechas dentro de la CTE |
| medio | Estadísticas → Mantenimiento (resumen del mes) | `Dashboard/Estadisticas/Mantenimiento/actions/actions.server.ts:80,91` (`getMaintenanceMonthSummary`) | flota × relaciones de parte del mes, contadas en JS | ventana de 1 mes | `count(distinct date) group by equipment_id` en SQL |
| medio | Seguimiento: faceta "condición"; En taller: filtro/faceta "sector actual" | `Mantenimiento/WorkshopTracking/actions.server.ts:449`; `Mantenimiento/MaintenanceOrders/table/actions.server.ts:181` (`getOrdersWithCurrentSector`, calcula el sector en JS; el facet de estado incluye `completed`, `:494`) | órdenes que cumplen el filtro | acotado por estados activos salvo "incluir completadas" | `groupBy`/SQL |
| bajo | Inicio: indicadores de RRHH, flota y servicios; facetas de sus diálogos | `Dashboard/Principal/actions/rrhh.server.ts:55,66,104,516`, `fleet.server.ts:48,350`, `services.server.ts:54` | filas del día / flota activa | ventana (hoy) o acotado | Pasar a `count`/`groupBy` cuando se toque |
| bajo | Tareas por sector: facetas | `Mantenimiento/WorkshopView/WorkshopSectorTasksTable/actions.server.ts:509,525,570` | OT abiertas | acotado (`OPEN_WORK_ORDERS_ONLY`) | `groupBy` donde se pueda |
| bajo | Pedidos confirmados: faceta "condición" | `Mantenimiento/PedidosMantenimiento/Confirmados/actions.server.ts:502` | órdenes confirmadas | acotado por estado | — |
| bajo | Distribución de empleados (género/puesto/contrato) | `Dashboard/Estadisticas/RecursosHumanos/actions.server.ts:291,321` | empleados activos | acotado (plantilla) | `groupBy` |
| bajo | Nota de crédito restante | `Comercial/Facturacion/lib/invoice-context.server.ts:114` | NC de UNA factura sumadas en JS | por registro | `aggregate` |

Ya agregan en SQL con ventana (sin cambios): KPIs (`get_kpi_range`), desvíos de Sala de Control (24 meses de
`daily_indicators`), ausentismo de RRHH (`hr_get_*`), `RequestSourceCard`, `MaintenanceKindCard`, contadores del
acordeón de taller, tarjetas de estado de prepartes, cabecera del parte (`clone.server.ts:451`), jobs
(`Jobs/documents-expiry.ts` con `DEFAULT_DETAIL_LIMIT = 20`).

---

## 6. Exportaciones (traen todo lo filtrado: es legítimo, se anota por volumen)

Todas las exportaciones de los DataTables respetan los filtros activos (`currentParams`) y no tienen tope. Exportar
"todo lo filtrado" es correcto; el riesgo aparece cuando la entidad crece sin ventana y se exporta sin filtrar.

| Riesgo | Export | Entidad | Qué hacer |
|---|---|---|---|
| **alto** | `Employees/Diagrams/Reports/actions.server.ts:270` (`getDiagramReportsForExport`) | `employees_diagram` sin ventana de fechas (~220k filas/año en prod) | Exigir rango de fechas (o default de 1 mes) y armar el archivo por lotes en el servidor |
| medio | Descarga ZIP de documentos permanentes: `Documentacion/DocumentosEmpleados/Permanentes/components/_EmployeePermanentDocumentsDataTable.tsx:104,428` y `Employees/Empleados/DocumentosEmpleados/PermanentDocumentsDownloadButton.tsx:49` | Usa la **página cargada** (`data` / `getFilteredRowModel`): **corta en silencio** las otras páginas | Server action con los filtros completos |
| medio | `Documentacion/DocumentosEmpleados/Mensuales/actions.server.ts:366`, `Documentacion/DocumentosEquipos/Mensuales/actions.server.ts:362` | Documentos mensuales (suman cada período) | Default de período o tope con aviso |
| medio | `Operaciones/PartesDiarios/list/actions.server.ts:162`, `Operaciones/Preparte/list/actions.server.ts:263`, `Operaciones/Preparte/actions/report.server.ts:86` (reporte Excel: desde/hasta obligatorios pero sin límite de rango) | Partes / prepartes | Tope de rango (p. ej. 3 meses) o lotes |
| medio | `Checklists/ChecklistAnswers/actions.server.ts:300`, `Formularios/Formularios/actions.server.ts:297` | Respuestas de checklist / formularios (este último arrastra ids de respuestas) | Lotes; `_count` en formularios |
| medio | `Clothing/AllDeliveries/…/actions.server.ts:244`, `ClothingReports/…/actions.server.ts:213`, `EmployeeDeliveries/…/actions.server.ts:191`, `Comercial/Facturacion/list/actions.server.ts:257`, Mantenimiento (`MaintenanceOrders/table/actions.server.ts:444, 634`; `PedidosMantenimiento/Pendientes/actions.server.ts:223`, `Confirmados/actions.server.ts:379`; `SolicitudesMantenimiento/actions/actionsTableServer.ts:257`; `WorkshopTracking/actions.server.ts:350`; `WorkshopView/WorkshopSectorTasksTable/actions.server.ts:314`; `Gomeria/Ordenes/actions/actions.server.ts:165`) | Entregas, facturas, pedidos, órdenes, OT | Tope con aviso o lotes cuando el volumen lo pida |
| medio | `Documentacion/DocumentosEmpleados/Permanentes/actions.server.ts:260`, `DocumentosEquipos/Permanentes/queries.server.ts:76`, `DocumentosEmpresa/actions.server.ts:277` | Documentos permanentes | — |
| bajo | Exports de catálogos, empleados, equipos, pre legajos, usuarios, cubiertas, documentos por vencer (ventana 30 días), detalle de UN parte (`PartesDiarios/detail/export.server.ts:37`), órdenes de gomería de UN vehículo | acotados o por registro | — |

---

## 7. Stores globales y cargas que nadie usa

| Riesgo | Dónde | Query | Qué carga | Qué hacer |
|---|---|---|---|---|
| **alto** (se dispara poco) | `src/shared/store/loggedUser.ts:214` (`documetsFetch`), disparado por `setActualCompany` (`Empresa/General/components/CreateCompanyButton.tsx:53`) y por `Empresa/General/Documentacion/components/AddCompanyDocumentForm.tsx:57,96` | `src/shared/actions/session.server.ts:103` (`getStoreDocuments`) | **Todos** los `documents_employees` + `documents_equipment` + `documents_company` de la empresa, sin `take` ni filtro de `archived_at`. Nadie lee el resultado (`Alldocuments`, `documentsToShow`, `pendingDocuments`, `companyDocuments`) | Borrar la carga (confirmar importadores con LSP) |
| **alto** (mismo disparo) | `loggedUser.ts:177` | `session.server.ts:189` (`getStoreEmployees`) | Todos los empleados **con todos sus `documents_employees`**. Nadie lee `employees` / `employeesToShow` | Borrar |
| medio | `Documentacion/shared/components/SimpleDocument.tsx:193` → `documentDrawerEmployees` / `documentDrawerVehicles` | `session.server.ts:270, 284` | Todos los documentos del empleado/vehículo después de cada subida; nadie lee `DrawerEmployees` / `DrawerVehicles` | Borrar |
| bajo | `src/shared/store/countries.ts:73-82` (`ensureLoaded`) | países, provincias, jerarquías, diagramas, clientes, contactos | catálogos chicos | — |

**Código muerto con queries sin tope** (no se cuenta; si se revive, entra como riesgo alto): `getDailyIndicators`
(`Dashboard/Estadisticas/KPIs/Graficos/actions/getChartData.ts:54`, historial completo de `daily_indicators`; sus 7
gráficos no se montan), `getVehiclesNotInDailyReport` / `getEmployeesNotInDailyReport` / `getVehiclesOnRepair`,
`getServicesDetailPaginated` y su export, `ChecklistDeviationsDashboard` (comentado en `PrincipalTabContent.tsx:24`),
`useDailyReports` / `fetchDailyReportsWithFilters` (`Operaciones/PartesDiarios/actions/queries.server.ts:70`, fechas
opcionales), `Operaciones/PartesDiarios/components/BulkStatusModal.tsx`, la carpeta `Mantenimiento/Planificacion/`,
`Mantenimiento/OrderManagement/` (tabla), `getMaintenanceRequests` (`SolicitudesMantenimiento/actions/queries.server.ts:48`),
`PedidosMantenimiento/actions/actionsServer.ts:146,248,362`, `getMonthlyEmployeeDocumentsFacets` /
`getMonthlyEquipmentDocumentsFacets` (bulk), `getTicketsForApprover` (`Ayuda/actions/support-approval.ts:49`),
`getExternalApiClients`, `getVehiclesForSelect`, y las listas duplicadas `DailyAbsenceList` / `DepartmentSummaryList` /
`EmployeeAbsenceList` de RRHH. Los logs `external_api_access_logs` y `arca_call_logs` solo se escriben: no tienen UI.
No existe UI de notificaciones (`notifications` no se consulta en `src`).

### Hallazgos fuera de la pregunta (para `PLAN.md` §9; no se arreglan en el rediseño)

- `getMaintenanceOrdersForOtherEquipment` (`Equipos/OtherEquipment/maintenance/actions.server.ts:19`) **no filtra por
  `company_id`** (la versión de vehículos sí).
- `getSupportTicketById` (`Ayuda/actions/support-tickets.ts:116`) llama a `listTicketsForApprover` sin límite cuando el
  usuario no es el reporter; dentro del fan-out de 25 tickets del badge se multiplica.
- `getStoreVehicles` solo se llena por `setActualCompany`: la lista que lee `Formularios/components/forms/Inputs.tsx:553`
  probablemente queda vacía.
- `getPreparteKpiData` incluye prepartes con `company_id IS NULL` (posiblemente de otras empresas).
- `_ValidationOrdersDataTable` no pagina (todas las filas en una página, ver §1.1).

<!-- estado: completo -->
