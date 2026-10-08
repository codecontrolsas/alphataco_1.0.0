# Inventario ANTES — Dashboard (`/dashboard`)

Ficha funcional previa al rediseño. Cada `- [ ]` se tilda "después" al verificar que sigue igual.

- Página: `src/app/dashboard/page.tsx` → `src/features/Dashboard/DashboardComponent.tsx`.
- Metadata: `title = "Dashboard | <empresa>"` (cookie `actualCompName` o `getCompanyName()`).
- Navegación por secciones: `SectionManagerServer` con `?tab=` (`principal` por defecto | `documentacion` | `estadisticas`).
  Cada sección se muestra solo si `isTabVisible('dashboard', <tabSlug>)` (mismo checker que el sidebar). Si no hay
  ninguna visible: mensaje "Sin acceso / No tenés permisos para ver ninguna sección acá."
- Sub-tabs de Documentación y Estadísticas: `TabsManagerServer` con `?subtab=`, filtradas por permiso
  (`dashboard:<subtab>`), mensaje "Sin acceso / No tienes permisos para ver ninguna pestaña en esta sección." si no hay ninguna.

---

## Principal — `/dashboard` o `/dashboard?tab=principal`

- [ ] Componente raíz: `features/Dashboard/Principal/PrincipalTabContent.tsx` (Server). Fallback `PrincipalSkeleton`.
- [ ] Layout: fila de KPIs arriba + grilla 1 col / 2 col en `xl` con 4 secciones (Servicios, RRHH, Estado de Equipos, Estado de Flota), cada una con su `Suspense` + `SectionSkeleton`.
- [ ] `ChecklistDeviationsDashboard` (desvíos de checklist pendientes) está **comentado** en el layout: no se muestra hoy.

### Fila de KPIs — `Principal/components/KpiCardsRow.tsx` (Server, fallback `KpiCardsSkeleton`)
Grilla 2 / 3 (`lg`) / 6 (`xl`) columnas. Sin permisos ni acciones.
- [ ] Empleados — `activeEmployees`, "empleados activos" (ícono Users, `--chart-2`).
- [ ] Equipos Activos — `activeVehicles`, "unidades activas" (Truck, `--chart-5`).
- [ ] Flota Total — `fleetMinusRepair`, "total flota (activos - en reparacion)" (Container, `--chart-3`).
- [ ] Servicios del día — `totalServices`, "servicios registrados" (ClipboardList, `--chart-1`).
- [ ] Operatividad — `operativityPercentage` en %, "activos / flota total"; **tooltip** con la fórmula `(Equipos activos / Flota total) × 100 = (x / y) × 100`; color por umbral: ≥75 verde, ≥50 ámbar, <50 rojo (clases `emerald/amber/red` hardcodeadas).
- [ ] Equipos sin checklist — `ChecklistMissingCard.tsx` (client): **Switch** "Mes" / "Histórico" alterna entre `monthCount` (sin checklist en el mes en curso) y `historicalCount` (nunca tuvieron checklist); texto y tooltip cambian según el modo (ticket 685). Estado local, no persiste.
- [ ] Números con `toLocaleString('es-AR')` y `tabular-nums`.

### Servicios del Día — `Principal/components/ServicesSection.tsx` (client; datos SSR de `getServicesSummary`)
- [ ] Header: título + fecha de hoy (`DD/MM/YYYY`) + botón **"Ver detalle"** (sin permiso) → abre `ServicesDetailDialog` (carga diferida `next/dynamic`, `ssr:false`).
- [ ] Tabla **manual** (shadcn `Table`, presentación): Tipo de Servicio (punto de color + label Mensual/Adicional/Adicional Permanente) · Cantidad · % (Badge) + fila **Total** con Badge 100%.
- [ ] Donut "Distribución por Cliente" (recharts) con total al centro ("Servicios") + leyenda `Cliente: n`. Datos por `useQuery(['services-detail-by-client-today'])` (client). Vacío: "Sin servicios para hoy".
- [ ] Paleta `CHART_COLORS` de 8 hex hardcodeados (también usada por la tabla).

#### Dialog `ServicesDetailDialog.tsx` — "Detalle de servicios por cliente"
- [ ] Descripción: "Distribución detallada de servicios mensuales y adicionales por cliente".
- [ ] Selector **Fecha** (Popover + Calendar, botón con fecha larga en español). **No permite escribir la fecha** (regla date-pickers: candidato a corregir, preguntar).
- [ ] `useQuery(['services-detail-by-client', fecha])`, `enabled: open`. Skeleton de 5 filas mientras carga.
- [ ] Tabla **manual**: Cliente · Mensuales · Adicionales · Total · Estados (badges por estado) + fila totales (badge `bg-gray-700` hardcodeado).
- [ ] Botón **"Descargar imagen"** (deshabilitado si exporta, carga o sin datos): genera **PNG** con `html-to-image` (`toPng`, fondo blanco, pixelRatio 2); quita el overflow con `flushSync` antes de capturar; en la imagen aparecen título y descripción que en pantalla están ocultos. Nombre: `servicios-por-cliente-YYYY-MM-DD-<total>-servicios.png`. Error silencioso.

### Recursos Humanos — `Principal/components/RrhhSection.tsx` → `RrhhSectionClient.tsx`
- [ ] Header: "Recursos Humanos" + fecha de hoy + **filtro por posición** (`CookieFilter`: MultiSelectCombobox con "seleccionar todo", placeholder "Filtrar por posicion..." + botón **"Filtrar"**). Guarda cookie `position-filter` (1 día) o la borra si queda vacío, y hace `router.refresh()`. El SSR lee la cookie.
- [ ] Donut "Novedades cargadas" (tipos de diagrama con su color de BD), total al centro "Empleados". Vacío: "Sin diagramas para hoy".
- [ ] Leyenda ordenada desc, cada ítem es **link en pestaña nueva** a `/dashboard/employee?tab=diagrams&subtab=old&diagOld_diagramType=<id>[&diagOld_position=<ids>]`.
- [ ] `IndicatorStats`: Con diagrama · En operacion · **Disponibles (clickeable → `AvailableEmployeesDialog`)**.
- [ ] `RadialGauge` "Operativos" (`indicatorPercent`).
- [ ] Pie: "Indicador = Empleados con diagrama − Empleados en operacion".

#### Dialog `AvailableEmployeesDialog.tsx` — "Empleados Disponibles (n)"
- [ ] Tabla **DataTable nuevo**, client-side mode (`queryFn` → `getAvailableEmployeesPaginated(params, positionIds)`), `paramNamespace="avail-emp"`, sin `tableId` (no persiste preferencias).
- [ ] Columnas: Legajo · Nombre (link a `/dashboard/employee/action?action=view&employee_id=`) · CUIL · Posición · Clientes (badges; "Sin afectar"; sin orden) · Diagrama (badge con color) · Comentario.
- [ ] Filtros (faceted lazy `fetchFacet`): Posición, Clientes ("Sin afectar"), Diagrama. Los 3 visibles por defecto.
- [ ] Búsqueda: "Buscar por legajo, nombre o CUIL...". Toggle de filtros. Vacío: "No hay empleados disponibles".
- [ ] Export Excel: `empleados-disponibles`, hoja/título "Empleados Disponibles", con `currentParams`.
- [ ] Sin selección ni acciones por fila. Respeta el filtro de posición de la cookie.

### Estado de Equipos — `Principal/components/EquipmentOperationSection.tsx` → `EquipmentOperationClient.tsx`
- [ ] Header: "Estado de Equipos" / "Operativos, Fuera de Servicio y En Operaciones por Tipo" + `CookieFilter` cookie `type-filter`, placeholder "Filtrar por tipo...", botón "Filtrar".
- [ ] Gráfico de barras horizontal apiladas (máx. 8 tipos): Operativos (`--chart-2`), Fuera de Servicio (`--chart-1`), Trabajando (`--chart-5`); label del tipo a la derecha (truncado a 20); alto dinámico (44px por barra). Vacío: "Sin datos de equipos para hoy".
- [ ] Stats: Operativos · En Operaciones · **Disponible / Sin asignar (clickeable → `AvailableVehiclesDialog` con `typeIds` de la cookie)**.
- [ ] `RadialGauge` "Operatividad". Pie: "Indicador = Equipos operativos − Equipos en operaciones".

### Equipos — Estado de Flota — `Principal/components/EquipmentFleetSection.tsx` → `EquipmentFleetClient.tsx`
- [ ] Bloque "Solo Unidades Motoras (Chasis & Tractor)" — solo si `motorFleet > 0`:
  - [ ] Donut disponibilidad (Operativos / No disponibles, colores hex `#34C759`/`#e74c3c`) centro "Total"; stats Operativos · En reparacion · Total; gauge "Indicador de flota".
  - [ ] Donut uso (En Operaciones / Disponible-Sin asignar, `#3a86ff`/`#06d6a0`) centro "Operativos"; stats En Operaciones · **Disponible / Sin asignar (clickeable si > 0 → `AvailableVehiclesDialog` filtrado a tipos Chasis/Tractor)** · Total operativos; gauge "Eficiencia de uso".
- [ ] "Disponibilidad — Todos los Equipos": donut centro "Flota"; stats Operativos · **En reparacion (clickeable si > 0 → `VehiclesOnRepairDialog`)** · Total flota; gauge "Disponibilidad".
- [ ] "Uso — Todos los Equipos": donut centro "Operativos"; stats En Operaciones · **Disponible / Sin asignar (clickeable si > 0 → `AvailableVehiclesDialog` sin filtro)** · Operativos; gauge "Uso".
- [ ] Pie con 2 fórmulas: Disponibilidad = Total de flota − Equipos en reparacion; Uso = Equipos operativos − Equipos en operaciones.
- [ ] Ojo: los botones con conteo 0 siguen pareciendo clickeables (cursor/hover) pero no abren nada.

#### Dialog `AvailableVehiclesDialog.tsx` — "Disponible / Sin asignar (n)"
- [ ] "Vehiculos operativos que no estan en el parte diario de hoy."
- [ ] **DataTable nuevo**, client-side (`getAvailableVehiclesPaginated(params, typeIds)`), `queryKey ['dashboard-available-vehicles', ...typeIds]`, `paramNamespace="veh-avail-dialog"`.
- [ ] Columnas: Dominio (link a `/dashboard/equipment/action?action=view&id=`) · Serie · N° Interno · Tipo · Subtipo · Condición (badge success) · Afectaciones (badges / "Sin afectar", sin orden).
- [ ] Filtros faceted lazy: Tipo, Subtipo, Afectaciones ("Sin afectar"). Búsqueda "Buscar por dominio, serie, N° interno...". Toggle filtros y columnas. Vacío "No hay vehiculos disponibles".
- [ ] Export Excel `vehiculos-disponibles-sin-asignar`, hoja/título "Disponible - Sin asignar" (Condición con label).

#### Dialog `VehiclesOnRepairDialog.tsx` — "Vehiculos no disponibles (n)"
- [ ] "Vehiculos que se encuentran actualmente no operativos." Clon del anterior (columnas, filtros, búsqueda idénticos; Condición en badge destructive), `getRepairVehiclesPaginated`, `paramNamespace="veh-repair-dialog"`, vacío "No hay vehiculos en reparacion".
- [ ] Export `vehiculos-en-reparacion`, hoja/título "Vehiculos en Reparacion".

---

## Documentación (próximos vencimientos) — `/dashboard?tab=documentacion&subtab=empleados|vehiculos`

- [ ] Componente raíz: `features/Dashboard/Documentacion/DocumentsTabContent.tsx` (Server).
- [ ] Card "Proximos vencimientos" / "Documentos que vencen en los proximos 30 dias" (header y footer vacío con `bg-surface`).
- [ ] Sub-tabs (`?subtab=`, default `empleados`): **Empleados** (Users, permiso `dashboard:empleados`) · **Vehículos** (Truck, `dashboard:vehiculos`). Fallback Suspense genérico con 2 Skeleton.
- [ ] Regla de datos (server): documentos con `validity` no nula y ≤ hoy+30 días (incluye **ya vencidos**), `archived_at IS NULL`, recurso `is_active = true`, de la empresa activa. Si el usuario filtra Vencimiento, su rango **reemplaza** la ventana de 30 días.

### Tabla Empleados — `Documentacion/Empleados/` (`EmployeeExpiringDocsList.tsx` → `_EmployeeExpiringDocsDataTable.tsx`, `columns.tsx`)
- [ ] Sistema: **DataTable nuevo**, client-side, `TABLE_ID='dashboard-employee-expiring-docs'` (preferencias en BD), `paramNamespace`, `queryKey ['dashboard-employee-expiring-docs']`, `data-testid="employee-expiring-docs-table"`.
- [ ] Columnas: Legajo (con tooltip "Número de legajo del empleado", mono, **sin orden**) · Empleado (link a ficha `/dashboard/employee/action?action=view&employee_id=`) · Tipo de Documento · Vencimiento (vencido: ícono AlertTriangle + rojo; ≤7 días: CircleDot + naranja hardcodeado) · Estado (Badge con ícono y variante por estado) · Subido el · acción.
- [ ] Filtros: Estado (faceted enum) · Tipo de Documento (faceted FK) · Vencimiento (dateRange) · Subido el (dateRange) · Legajo (text, igualdad exacta server). Visibles por defecto: Estado, Tipo de Documento, Vencimiento.
- [ ] Búsqueda "Buscar por empleado o tipo de documento...". Vacío "No hay documentos de empleados por vencer".
- [ ] Orden por defecto: `validity asc`. Ordenables: created_at, validity, state, employee, document_type.
- [ ] Export Excel `documentos-empleados-por-vencer`, título "Documentos de Empleados por Vencer", hoja "Documentos".
- [ ] Acción por fila (sin permiso): link **"Ver documento"** → `/dashboard/document/<id>?resource=Persona`. Sin selección ni masivas.

### Tabla Vehículos — `Documentacion/Vehiculos/` (`VehicleExpiringDocsList.tsx` → `_VehicleExpiringDocsDataTable.tsx`, `columns.tsx`)
- [ ] Sistema: **DataTable nuevo**, client-side, `TABLE_ID` propio, `queryKey ['dashboard-vehicle-expiring-docs']`.
- [ ] Columnas: Equipo (nombre display, link `/dashboard/equipment/action?action=view&id=`) · Subtipo · Propietario · Tipo de Documento · Vencimiento (mismo resaltado) · Estado · Subido el · acción.
- [ ] Filtros: Estado (faceted) · Tipo de Documento (faceted) · Subtipo (faceted FK) · Propietario (faceted FK) · Vencimiento (dateRange) · Subido el (dateRange) · Dominio (text, `contains` insensible, sobre columna `vehicle`). Visibles por defecto: Estado, Tipo de Documento, Vencimiento, Dominio (**4**, excede la regla de 3).
- [ ] Búsqueda "Buscar por equipo o tipo de documento...". Vacío "No hay documentos de equipos por vencer".
- [ ] Orden por defecto `validity asc`; ordenables: created_at, validity, state, vehicle, document_type, sub_type, owner.
- [ ] Export Excel `documentos-equipos-por-vencer`, título "Documentos de Equipos por Vencer", hoja "Documentos".
- [ ] Acción por fila: **"Ver documento"** → `/dashboard/document/<id>?resource=Equipos`.

---

## Estadísticas — `/dashboard?tab=estadisticas&subtab=operaciones|rrhh|mantenimiento|desvios`

- [ ] Componente raíz: `features/Dashboard/Estadisticas/EstadisticasTabComponent.tsx`.
- [ ] Envuelto en `FeatureFlagShow("mostrar_tab_de_graficos_en_dashboard")`, que hoy **no evalúa nada** (siempre muestra; el hook de PostHog está comentado).
- [ ] Sub-tabs (`?subtab=`, default `operaciones`): **Operaciones** (Calendar, `dashboard:operaciones`) · **RRHH** (Users, `dashboard:rrhh`) · **Mantenimiento** (Wrench, `dashboard:mantenimiento`) · **Sala de Control** (MonitorDot, slug `desvios`).
- [ ] Nota: existe `Estadisticas/KPIs/` (Indicadores + Gráficos, `?kpiview=`) pero **no se monta acá**: lo usa `Empresa/General/GeneralTabContent.tsx` (Configuración). Va en el inventario de Empresa.

### Operaciones — `Estadisticas/Operaciones/OperacionesTabContent.tsx` → `OperacionesChartsDynamic` (dynamic `ssr:false`) → `OperacionesChartsClient.tsx`
- [ ] Datos SSR completos (`getOperationsChartData`); todo el filtrado es client-side. Fallback `OperacionesChartsSkeleton`.
- [ ] Card "Historico de servicios": descripción = período + "(n clientes)" + "(n centros de costo)" si hay filtros.
- [ ] Navegador de mes ◀ ▶ (deshabilitados antes del primer mes con datos / después del mes actual).
- [ ] ToggleGroup granularidad: Diario (default) · Semanal · Mensual · Trimestral · Anual — cambia la ventana (mes; 3 meses; 3 meses; 4 trimestres; 12 meses).
- [ ] MultiSelect "Todos los clientes" (con seleccionar todo). MultiSelect "Todos los centros de costo" (+ opción "Sin asignar" `__null__`).
- [ ] 3 botones-stat que cambian la vista del gráfico: Total · Mensual · Adicional.
- [ ] Área apilada (`ServiceHistoryAreaChart`) con series por centro de costo; aviso de que la suma de líneas puede superar el total si hay >1 centro.
- [ ] Card "Servicios por cliente" (`ClientRankingChart`): barras por cliente (Mensual/Adicional), top 7 + botón "+n clientes" / "Mostrar menos".
- [ ] Sin export ni permisos internos.

### RRHH — `Estadisticas/RecursosHumanos/absenteeism-dashboard.tsx` (dentro de `<Card>`)
- [ ] `SummaryCards`: "Medición del día de hoy: <fecha larga>" + 6 `CardInfo`: Dotación Día Anterior · Altas (verde) · Bajas (rojo) · Total Ausentes (ámbar) · Dotación Actual · % Ausentismo Diario (ámbar). Colores hardcodeados.
- [ ] Columna izquierda: Variación de Ausentismo · Resumen por Sector · Distribución (2 gráficos). Derecha: Motivos por Departamento · Ausentismo Diario · Variación de Dotación. Abajo: Detalle de Ausencias por Empleado.
- [ ] **Variación de Ausentismo** (`AbsenteeismTrendChart.tsx`, client, `useQuery`): `YearMonthPicker` "Buscar por mes" + botón X "Limpiar filtro de mes"; Select rango Últimos 90/30/7 días (default 7d) — **oculto en mobile** (`hidden sm:flex`); labels de valores solo en 7d sin mes; pie con "Incremento/Reducción de x%" y "Ausentismo actual: x%".
- [ ] **Variación de Dotación** (`HeadcountTrendChart.tsx`): mismos controles.
- [ ] **Motivos de Ausencia por Departamento** (`DepartmentAbsenceCharts.tsx`, server): un mini-gráfico por departamento con ausentes; vacío "No se registran ausentes en los departamentos para el período actual." (título de depto `text-gray-700` hardcodeado).
- [ ] **Distribución de Empleados** (género × posición) y **Tipos de Contrato**; si falla la carga, cards con "Error al cargar los datos".

#### Tabla "Resumen por Sector" — `components/DepartmentSummaryTable/_DepartmentSummaryDataTable.tsx` + `columns.tsx`
- [ ] **DataTable nuevo** en modo datos-por-prop (sin `queryFn`), `tableId`/`paramNamespace="dept-summary"`.
- [ ] Columnas: Sector · Dotación · Ausentes · % Ausentismo · acción. Filtro: Sector (text). Búsqueda "Buscar sector...". Vacío "No hay datos de sectores disponibles.".
- [ ] Export `resumen-ausentismo-sectores`, hoja "Resumen por Sector".
- [ ] Acción por fila **"Ver ausentes"** (deshabilitada si 0) → Dialog "Ausentes en <sector>" con tabla `_EmployeeAbsenceDataTable` (`tableId="dept-summary-modal"`); vacío "No hay ausentes para este sector.".

#### Tabla "Ausentismo Diario - <Mes Año>" — `components/DailyAbsenceTable/_DailyAbsenceDataTable.tsx` + `columns.tsx`
- [ ] **DataTable nuevo** datos-por-prop, `tableId`/`paramNamespace="daily-absence"`, **sin filtros** (array vacío).
- [ ] Columnas: Fecha · Dotación · Altas · Bajas · Vacaciones · Total Dotación · Total Ausentes · % Ausentismo (chip rojo/amarillo/verde por umbral, colores hardcodeados) · acción. Búsqueda "Buscar por fecha...". Vacío "No hay datos de ausentismo diario.".
- [ ] Export `ausentismo-diario`, hoja "Ausentismo Diario", % con 2 decimales.
- [ ] Acción **"Ver ausentes"** (deshabilitada si 0) → Dialog "Empleados ausentes el <fecha>": `useQuery(['daily-absence-detail', companyId, fecha])`, skeleton; si hay detalle, Tabs **Bajas (n) / Ausentes (n) / Altas (n)** (deshabilitadas si 0), cada una con `_EmployeeAbsenceDataTable` (`daily-absence-modal-bajas|ausentes|altas`); si no, tabla simple (`daily-absence-modal`). Mensajes vacíos por caso.

#### Tabla "Detalle de Ausencias por Empleado" — `components/EmployeeAbsenceTable/_EmployeeAbsenceDataTable.tsx` + `columns.tsx`
- [ ] **DataTable nuevo** datos-por-prop, `tableId` default `employee-absence` (reutilizada en los 4 dialogs con otro id).
- [ ] Columnas: Legajo · Nombre (link a ficha del empleado) · Tarea · Línea · Turno · Motivo · Desde · Hasta · Días Caídos · Observaciones.
- [ ] Filtros: Legajo (text) · Nombre (text) · Cargo (faceted, opciones desde los datos en memoria) · Sector (faceted) · Turno (faceted) · Motivo (faceted) · Observaciones (text). Títulos de filtro "Cargo"/"Sector" ≠ títulos de columna "Tarea"/"Línea".
- [ ] Búsqueda "Buscar por legajo o nombre...". Vacío "No hay ausencias registradas.". Export `ausencias-empleados`, hoja "Ausencias".

### Mantenimiento — `Estadisticas/Mantenimiento/MantenimientoTabContent.tsx` → `MantenimientoChartsDynamic` → `MantenimientoChartsClient.tsx`
- [ ] SSR del resumen del mes actual; cambios de mes por `useQuery`. Fallback `MantenimientoChartsSkeleton`.
- [ ] Card "Mantenimiento de equipos": "Distribución de la flota por tipo de tenencia · <mes>" + "(x de y días transcurridos)" + spinner al refetch; navegador de mes ◀ ▶.
- [ ] `OwnershipDonutChart`: donut por tenencia (Propios / Leasing / Contratados) — **click en categoría = drill-down** (filtra, abre y hace scroll+resaltado a su sección); chips de estado (Operativos / Op. condicionado / En preparación / No operativos / En reparación) **toggle multi-selección** + botón "Limpiar (n)"; `WorkdaysProgress`.
- [ ] Card **"Equipos en mantenimiento por tipo"** (`MaintenanceByTypeCard`, propio estado de mes): ◀ mes ▶ + Popover/Calendar para saltar de mes; MultiSelect "Todos los tipos"; barras por tipo clickeables (selecciona/deselecciona) → lista de equipos del tipo con tooltip (dominio, estado, Km, Hs, solicitudes abiertas). Vacío "Sin equipos en mantenimiento este período".
- [ ] Card **"Origen de las solicitudes de mantenimiento"** (`RequestSourceCard`) y **"Mantenimiento preventivo vs. correctivo"** (`MaintenanceKindCard`): cada una con `PeriodSelector` propio (Día / Mes / Trimestre / Año, ◀ ▶, botón "Hoy"); paleta en `MaintenanceStatsColorVars`.
- [ ] 3 secciones colapsables `CategorySection` (Propios, Leasing, Contratados): badge con total, buscador "Buscar patente" (deshabilitado si cerrada), MultiSelect de tipos ("Sin tipos"/"Todos los tipos"); al abrir carga equipos con `useQuery`; error con botón "Reintentar"; filas `EquipmentRow` con estado (chip con ícono y label).

### Sala de Control — `/dashboard?tab=estadisticas&subtab=desvios` → `SalaDeControl/SalaDeControlTabContent.tsx`
- [ ] SSR en paralelo de desvíos + KPI de prepartes. Fallback `SalaDeControlSkeleton`.
- [ ] **Desvíos del parte diario** (`DesviosChartsClient.tsx`): "<período> — la meta es 0 desvíos"; ◀ mes ▶; ToggleGroup Diario/Semanal/Mensual; MultiSelect "Todos los clientes" (con `startTransition`); toggles de series (Desvíos Empleados, Desvíos Equipos, Empleados Duplicados, Equipos Duplicados visibles por defecto; "Filas con desvíos" oculta); aviso de dato estimado en Desvíos Equipos; estados: "Sin datos para este período", "Sin desvíos … en el período", aviso de días sin registro (con denominador). Colores por `SeriesColorVars`.
- [ ] **Gestion de Pedidos — Sala de Control** (`OrderManagementClient.tsx`): ◀ mes ▶; ToggleGroup Diario/Semanal/Mensual (default)/Trimestral/Anual; MultiSelect clientes; botones-stat Total · Confirmados · Pendientes · Rechazados · Cancelados (cambian vista); gráfico; vacío "No hay datos de pedidos para este periodo"; barras por cliente (`OrderManagementBarChart`) si hay datos.

---

## Resumen de la sección

- [ ] PDFs generados: ninguno. Única descarga no-Excel: PNG de "Detalle de servicios por cliente".
- [ ] Botones con permiso explícito: ninguno dentro de las pantallas (solo visibilidad de tabs por `dashboard:<slug>`).
- [ ] Filtros persistidos en cookies (no URL): `position-filter`, `type-filter` (vencen en 1 día).
- [ ] Hallazgos a anotar en §9 (no corregir en silencio): date picker de ServicesDetailDialog sin escritura directa; tabla de vencimientos de vehículos con 4 filtros visibles; dialogs de disponibles/en reparación sin filtros de texto por Dominio/Serie/N° Interno ni `tableId`; Select de rango oculto en mobile en los 2 gráficos de tendencia RRHH; stats clickeables con 0 que no hacen nada; componentes sin uso en `Estadisticas/KPIs/Graficos/components/` (AbsenteeismChart, AreaChartComponent, BarChartComponent, CompanyCountsChart, DailyAbsenceTimeseriesChart, DiagramDistributionChart, EmployeeUsageChart, LineChartComponent, PieChartComponent, VehicleUsageChart) y `ChecklistDeviationsDashboard` comentado.

<!-- estado: completo -->
