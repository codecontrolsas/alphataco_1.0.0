# Inventario — Empleados

Ficha "ANTES" del módulo Empleados. Lista contra la que se verifica que el rediseño no pierda nada. Cada `- [ ]` se
tilda al comprobarlo en la versión rediseñada. Permisos: `modulo:tab:acción`. `*` = campo obligatorio.

Rutas: `/dashboard/employee` (listados + diagramas) y `/dashboard/employee/action` (ficha: alta/vista/edición).
Feature: `src/features/Employees/` (+ `src/features/Clothing/EmployeeDeliveries/` para la pestaña Indumentaria y
`src/features/Documentacion/DocumentosEmpleados/` para la pestaña Documentación).

Los dialogs de documentos (subir/reemplazar/renovar/eliminar) que se abren desde la ficha se detallan en
`documentacion.md`; acá solo se nombran.

---

## Página Empleados — `/dashboard/employee` (contenedor)

- [ ] Página: `src/app/dashboard/employee/page.tsx` → `SectionManagerServer` `paramName="tab"`, `defaultTab="employees"`, permisos de `getUserPermissionsMapServer()`.
- [ ] Metadata: `Empleados | <empresa>` (cookie `actualCompName` o `getCompanyName()`).
- [ ] Carga de ruta: `src/app/dashboard/employee/loading.tsx`.
- [ ] Tab `employees` — icono `Users`, "Empleados" — visible según `empleados:employees`.
  - [ ] Subtabs (`TabsManagerServer` `paramName="subtab"`, default `empleados-activos`):
    - [ ] `empleados-activos` — icono `UserCheck`, "Empleados Activos" — permiso `empleados:empleados-activos`.
    - [ ] `empleados-inactivos` — icono `UserX`, "Empleados Inactivos" — permiso `empleados:empleados-inactivos`.
- [ ] Tab `diagrams` — icono `GitBranch`, "Diagramas" — visible según `empleados:diagrams` (ver secciones de Diagramas).

---

## Empleados Activos — `/dashboard/employee?tab=employees&subtab=empleados-activos`

- [ ] Componente raíz: `Empleados/EmployeeList/EmployeeList.tsx` (server, `isActive=true`, `tableId='employees-active'`) dentro de `<Suspense fallback={<EmployeeTableSkeleton />}>` (`EmployeeList/fallback/EmployeeTableSkeleton.tsx`).
- [ ] Envoltorio `<Card><CardContent className="pt-6">`.
- [ ] `stripPrefixFromSearchParams(searchParams, tableId)` + `getTablePreferences(tableId)`; facets NO en SSR.

### Tabla de empleados (compartida activos/inactivos)
- [ ] Archivos: `EmployeeList/components/_EmployeeDataTable.tsx` (client), `EmployeeList/columns.tsx`, `EmployeeList/actions.server.ts` (`getEmployeesPaginated`, `getAllEmployeesForExport`, `getEmployeeSingleFacet`).
- [ ] Sistema: **DataTable nuevo**, client-side mode (`queryFn`, `queryKey=['employees-paginated', isActive]`, `onStateChange`), `paramNamespace`=`tableId`, `showFilterToggle`.
- [ ] Búsqueda global: **no visible** (`showSearch` no se pasa → false). El server sí soporta `search` sobre apellido, nombre, CUIL y legajo (no hay input para usarlo).
- [ ] Orden por defecto: `lastname asc` (se agrega siempre al final del multi-sort). Multi-sort por columnas válidas (`VALID_SORT_FIELDS` + `FK_SORT_MAP`).
- [ ] Selección múltiple: `enableRowSelection` + `showRowSelection` (checkbox por fila y "todas"; contador de seleccionados en la paginación). **Sin acciones masivas** asociadas.
- [ ] Vacío: "No se encontraron empleados".
- [ ] Columnas visibles por defecto (meta.title), en orden:
  - [ ] `select` (checkbox, sin título, excluida de export)
  - [ ] Nombre completo (`fullName`) — avatar 28px (foto o icono `User` sobre muted); click en la foto abre Dialog con la foto grande; nombre "Apellido Nombre" como link azul a `/dashboard/employee/action?action=view&employee_id=<id>`. **No ordenable.**
  - [ ] Email
  - [ ] Legajo (`file`)
  - [ ] Estado (`status`, badge con icono de `employeeStatusIcons`)
  - [ ] Sector (`hierarchy`)
  - [ ] Puesto (`company_positions`)
  - [ ] Fecha de ingreso (`date_of_admission`)
  - [ ] Afectaciones (`contractor_employee`) — Badge outline con el primer cliente y `+N`; tooltip negro con la lista si hay más de uno; "Sin afectar" si no tiene. **No ordenable.**
- [ ] Columnas ocultas por defecto (`HIDDEN_COLUMNS_BY_DEFAULT`): Nacionalidad, Nacimiento, Tipo de Documento, Genero, Estado Civil, Nivel de Educacion, Calle, Altura, Provincia, Ciudad, CP, Telefono, Horas, Tipo de Contrato, Diagrama, Centro de costo, Tipo de costo, Estado de afiliacion, Aptitudes tecnicas (no ordenable), Categoria, Convenio, Sindicato, Sectores de taller (no ordenable), Pais de nacimiento, Fecha de creacion, Activo.
  - [ ] Columnas visibles por defecto pero no listadas arriba: CUIL, Documento (`document_number`) aparecen visibles (no están en la lista de ocultas).
  - [ ] Solo en **inactivos**: Motivo de baja (`reason_for_termination`), Fecha de baja (`termination_date`).
- [ ] Columna `actions` (sin título, no ocultable, excluida de export): menú `MoreHorizontal` con
  - [ ] "Ver" (`Eye`) → `?action=view&employee_id=<id>` — siempre.
  - [ ] "Editar" (`Pencil`) → `?action=edit&employee_id=<id>` — solo si `empleados:employees:update`.
- [ ] Filtros (todos con `fetchFacet` lazy salvo texto/fecha). Visibles por defecto en activos: **Estado, Sector, Puesto**.
  - [ ] Facetados enum: Estado, Genero, Nacionalidad, Tipo de Documento, Estado Civil, Nivel de Educacion, Tipo de costo, Estado de afiliacion, Motivo de baja (con "Sin asignar" si hay nulls).
  - [ ] Facetado booleano: Activo (Activo/Inactivo).
  - [ ] Facetados FK: Sector, Puesto, Tipo de Contrato, Diagrama, Sectores de taller, Categoria, Convenio, Sindicato, Centro de costo, Pais de nacimiento, Provincia, Ciudad ("Sin asignar").
  - [ ] Facetados M:M: Afectaciones, Aptitudes tecnicas ("Sin afectar").
  - [ ] Texto: Nombre, Email, CUIL, Documento, Telefono, Calle, Altura, CP, Legajo, Horas.
  - [ ] Rango de fechas: Nacimiento, Fecha de ingreso, Fecha de creacion, Fecha de baja.
- [ ] Exportación Excel (botón del DataTable, respeta filtros activos vía `currentParams`):
  - [ ] Activos: archivo `empleados-activos`, hoja "Empleados Activos", título "Listado de Empleados Activos".
  - [ ] Inactivos: archivo `empleados-inactivos`, hoja "Empleados Inactivos", título "Listado de Empleados Inactivos".
  - [ ] Formatters: enums → labels; fechas DD/MM/YYYY (ingreso/baja en UTC); Nacimiento acepta `YYYY-MM-DD` o `DD/MM/YYYY`; Provincia/Ciudad → nombre; Activo → Activo/Inactivo; Afectaciones → nombres separados por coma o "Sin afectar"; Aptitudes → nombres o "-".
- [ ] Preferencias persistidas por tabla (columnas y filtros visibles) en BD (`tableId`).

### Botones de la pantalla
- [ ] "Agregar empleado" (icono `Plus`, variant `brand`, size `sm`, en la toolbar de la tabla) → link `/dashboard/employee/action?action=new`. Solo en **activos** y con `PermissionGuard empleados:employees:create`.

---

## Empleados Inactivos — `/dashboard/employee?tab=employees&subtab=empleados-inactivos`

- [ ] Mismo componente (`EmployeeList`, `isActive=false`, `tableId='employees-inactive'`) y misma tabla que activos, con estas diferencias:
  - [ ] Sin botón "Agregar empleado".
  - [ ] Columnas extra: Motivo de baja, Fecha de baja.
  - [ ] Filtros visibles por defecto: **Motivo de baja, Estado, Sector**.
  - [ ] Nombres de export propios (ver arriba).

---

## Ficha de empleado — `/dashboard/employee/action?action=view|edit|new&employee_id=<id>&tab=<pestaña>`

- [ ] Página: `src/app/dashboard/employee/action/page.tsx` → `<div className="p-6 space-y-6"><Card>` + `EmployeeDetailClient` (`EmpleadoID/components/EmployeeDetailClient.tsx`).
- [ ] Modo por `?action=` (`view` por defecto). Sin `employee_id` en view/edit, o empleado inexistente/error → `notFound()` (404).
- [ ] Metadata: `Empleado - <Nombre> <Apellido>`; sin id → "Registrar Nuevo Empleado"; no encontrado → "Empleado no encontrado".
- [ ] Carga de ruta: `src/app/dashboard/employee/action/loading.tsx`.
- [ ] Slots server pre-renderizados: header, documentos, diagramas (Suspense `EmployeeDiagramsSkeleton`), indumentaria (Suspense `EmployeeDeliveriesTableSkeleton`).

### Header (`EmpleadoID/components/EmployeeHeaderContent.tsx`) — solo con empleado existente
- [ ] Avatar 96px (foto o iniciales Apellido+Nombre).
- [ ] Nombre "Apellido Nombre" (h1) y puesto (`company_positions.name` o "Sin posición asignada").
- [ ] Email (o "Sin email"), "DNI: <número>", badge Activo (verde) / Inactivo (secondary).
- [ ] "Posición Jerárquica: <sector>" si tiene.
- [ ] Si inactivo: "Fecha de Baja: DD/MM/YYYY" y "Razón de Baja: <valor crudo del enum>" en rojo.
- [ ] El legajo **no** aparece en el header (ver rarezas).

### Barra de acciones
- [ ] "Volver" (`ArrowLeft`, ghost) → `router.back()`. Texto oculto en mobile.
- [ ] Menú rápido `MoreHorizontal` (`employee-quick-actions.tsx`), solo en modo view con empleado — **sin control de permisos**:
  - [ ] "Enviar Email" (`Mail`) → `mailto:` en pestaña nueva; deshabilitado si no hay email (toast error "El empleado no tiene email registrado").
  - [ ] Si activo: "Dar de Baja Empleado" (`UserX`, rojo) → AlertDialog de baja.
  - [ ] Si inactivo: "Activar Empleado" (`UserCheck`, verde) → AlertDialog de activación.
- [ ] "Editar" (`Pencil`) solo en modo view, `PermissionGuard empleados:employees:update` → pasa a modo edit sin navegar (`history.replaceState` a `?action=edit&employee_id=`).
- [ ] "Cancelar" (`X`, outline) solo en modo edit → vuelve a view (`replaceState`), **sin descartar** los valores editados del form.

### AlertDialog "¿Dar de baja empleado?"
- [ ] Descripción: "Esta accion dara de baja al empleado. Podras reactivarlo mas tarde si es necesario."
- [ ] Form (`components/shared/TerminationFormFields.tsx`, schema `terminationSchema`):
  - [ ] Motivo de Baja* (Select con `reason_for_termination_enum`, placeholder "Selecciona la razon") — error "La razon de baja es requerida."
  - [ ] Fecha de Baja* (input de texto + popover con Calendar) — error "La fecha de baja es requerida."
- [ ] "Dar de Baja" (destructive, submit; "Procesando..." mientras corre) → `toggleEmployeeStatus(id, false, motivo, fecha)`; toast "Empleado dado de baja correctamente" / "Error al dar de baja al empleado"; cierra, resetea y `router.refresh()`.
- [ ] "Cancelar".

### AlertDialog "¿Activar empleado?"
- [ ] Descripción: "Esta accion activara al empleado y podra acceder al sistema."
- [ ] "Activar" ("Activando...") → `toggleEmployeeStatus(id, true)`; toast "Empleado activado correctamente" / "Error al activar al empleado"; `router.refresh()`. "Cancelar".

### Pestañas (`TabsManagerClientSide`, `paramName="tab"`, default `personalData`, lista `grid-cols-6`; labels con icono y texto oculto en mobile)
- [ ] `personalData` — `User`, "Datos Personales" — permiso `empleados:datos-personales`.
- [ ] `contactData` — `Phone`, "Datos de Contacto" — permiso `empleados:datos-contacto`.
- [ ] `workData` — `Briefcase`, "Datos Laborales" — permiso `empleados:datos-laborales`.
- [ ] `documents` — `FileText` ("Documentación"); en modo new: icono `Lock` y **deshabilitada** — permiso `documentacion:documentos-de-empleados`.
- [ ] `diagrams` — `BarChart3`, "Diagramas" — solo si `canView(empleados, diagramas-empleado)` o `canView(empleados, new)` y no es modo new.
- [ ] `clothing` — `Shirt`, "Indumentaria"; en modo new `Lock` y deshabilitada — solo si `canView(empleados, indumentaria_empleado)`.
- [ ] En modo edit/new las pestañas con errores muestran el texto en rojo + punto rojo ("Errores en esta pestaña").

### Modo vista (`EmpleadoID/components/EmployeeViewDisplay.tsx`)
- [ ] Datos Personales: Nombre, Apellido, Nacionalidad, Fecha de nacimiento, CUIL, Tipo de documento, Número de documento, País de nacimiento, Sexo, Estado civil, Nivel de instrucción (enums mostrados crudos).
- [ ] Datos de Contacto: Calle, Altura, Provincia, Ciudad, Código postal, Teléfono, Email.
- [ ] Datos Laborales: Legajo, Sector, Puesto, Diagrama de trabajo, Horas normales, Tipo de contrato, Fecha de ingreso, Gremio, Convenio, Categoría, Centro de costo, Tipo de costo, Sectores de taller (lista con comas).
  - [ ] Card "Asignado a contratistas" (badges; "Sin asignar") y Card "Aptitudes Técnicas" (badges; "Sin aptitudes").

### Modo edición / alta — formulario único (`employeeFormSchema` en `EmpleadoID/schemas/employee-schema.ts`)
Un solo `useForm` para las 3 pestañas de datos; las pestañas Documentación/Diagramas/Indumentaria quedan **dentro del `<form>`** en modo edit.
- [ ] Datos Personales (`Employees/shared/forms/PersonalDataFields.tsx`):
  - [ ] Foto del empleado (opcional): preview circular 96px o placeholder `Upload`; botón "Subir foto"/"Cambiar foto" (input file `image/*`, se guarda como dataURL); botón rojo `X` para quitar.
  - [ ] Nombre*, Apellido*, Tipo de documento* (Select), Número de documento*, CUIL* (placeholder "XX-XXXXXXXX-X", sin máscara), Fecha de nacimiento* (`<Input type="date">` nativo), Nacionalidad* (Select), País de nacimiento* (Select, catálogo `countries` con loading), Sexo* (Select), Estado civil* (Select), Nivel de instrucción* (Select).
  - [ ] Mensajes: "Nombre es requerido", "Apellido es requerido", etc. (uno por campo).
- [ ] Datos de Contacto (`Employees/shared/forms/ContactDataFields.tsx`):
  - [ ] Calle*, Altura*, Provincia* (combobox con búsqueda "Buscar provincia..."), Ciudad* (combobox "Buscar ciudad...", deshabilitado sin provincia; catálogo depende de la provincia), Código postal*, Teléfono*, Email* ("Email inválido").
- [ ] Datos Laborales (`EmpleadoID/components/forms/employee-work-data-form.tsx`):
  - [ ] Legajo*, Sector* (Select), Puesto en la empresa* (Select deshabilitado sin sector; filtrado por sector), Diagrama de trabajo* (Select).
  - [ ] Horas normales, Tipo de contrato (Select), Fecha de ingreso (`type="date"` nativo), Gremio (Select), Convenio (deshabilitado sin gremio, "Primero seleccione un gremio"), Categoría (deshabilitado sin convenio, "Primero seleccione un convenio"), Centro de costo, Tipo de costo, Sectores de Taller (MultiSelectCombobox "Sector - Taller", "No hay sectores disponibles").
  - [ ] Cascadas: cambiar Sector resetea Puesto y Aptitudes; cambiar Puesto resetea Aptitudes; cambiar Gremio resetea Convenio y Categoría; cambiar Convenio resetea Categoría.
  - [ ] Card "Asignado a contratistas": checkbox por cliente (skeleton al cargar; "No hay contratistas asignados" si no hay).
  - [ ] Card "Aptitudes Técnicas": checkboxes de aptitudes **activas** del puesto elegido; sin puesto: "Primero seleccione un puesto para ver las aptitudes disponibles"; sin aptitudes: "No hay aptitudes disponibles para el puesto seleccionado".
- [ ] Badge rojo global "Falta corregir algunos campos en <pestañas>" cuando hay errores.
- [ ] Botón submit "Guardar cambios" (edit) / "Agregar empleado" (new) / "Guardando..." — deshabilitado mientras guarda o refresca; tooltip "¡Todo listo para guardar!" / "Completa todos los campos requeridos".
- [ ] Alta: `createEmployee(data)` con `toast.promise` ("Creando empleado..." / "Empleado creado" / "Hubo un error al crear el empleado") → recarga completa a `?action=view&employee_id=<nuevo>`.
- [ ] Edición: `updateEmployee(id, data)` con `toast.promise` ("Guardando cambios..." / "Cambios guardados" / "Hubo un error al guardar los cambios") → vuelve a modo view y el toast se cierra recién cuando termina el `router.refresh()`.

---

## Ficha — pestaña Documentación — `/dashboard/employee/action?...&tab=documents&subtab=permanentes|mensuales`

- [ ] Componente raíz: `EmpleadoID/components/employee-document-detail.tsx` (server) → `TabsManagerServer` `paramName="subtab"`, default `permanentes`.
- [ ] Subtab `permanentes` — `FileArchive`, "Documentos Permanentes" — permiso `documentacion:docs-empleados-permanentes`.
  - [ ] Barra superior (`PermissionGuardServer documentacion:documentos-de-empleados:create`) con `DocumentNav onlyEmployees onlyNoMultiresource` → **no renderiza ningún botón** (queda un contenedor vacío con margen; ver rarezas).
  - [ ] Tabla `EmployeePermanentDocumentsList` (`Documentacion/DocumentosEmpleados/Permanentes/`, `TABLE_ID='employee-permanent-docs'`) filtrada por `employeeId` (queryKey `['employee-permanent-docs', employeeId]`, export y facets también filtrados). Columnas, filtros, acciones y dialogs: **ver `documentacion.md`** (misma tabla que en `/dashboard/document`).
  - [ ] Carga: `EmployeePermanentDocumentsSkeleton`.
- [ ] Subtab `mensuales` — `Calendar`, "Documentos Mensuales" — permiso `documentacion:docs-empleados-mensuales`.
  - [ ] Mismo `DocumentNav` vacío bajo el mismo guard.
  - [ ] Tabla `MonthlyEmployeeDocumentsList` (`.../Mensuales/`) filtrada por `employeeId` (queryKey `['monthly-employee-documents', employeeId]`). Detalle en `documentacion.md`.
  - [ ] Carga: `MonthlyEmployeeDocumentsSkeleton`.
- [ ] Pestaña deshabilitada (con `Lock`) en modo new.
- [ ] Nota: el `subtab` de la URL lo comparten esta pestaña y la de Diagramas (cada una con sus valores).

---

## Ficha — pestaña Diagramas — `/dashboard/employee/action?...&tab=diagrams&subtab=Diagramas|NuevoDiagrama`

- [ ] Componente raíz: `EmpleadoID/components/EmployeeDiagramsSection.tsx` (server: historial, diagramas del empleado y tipos) → `Diagrams/DiagramDetailEmployeeView.tsx` (client) → `TabsManagerClientSide` `paramName="subtab"`, default `Diagramas`.
- [ ] Carga: `EmpleadoID/components/skeletons/employee-diagrams-skeleton.tsx`.

### Subtab "Diagramas" (`FolderOpen`) — permiso `empleados:diagramas-empleado`
- [ ] Selector de rango de fechas (Popover + Calendar `mode="range"`, 2 meses; botón 300px con `dd/MM/yyyy - dd/MM/yyyy`; default hoy → hoy+30) + InfoComponent "La selección máxima es de 30 días" (**no se valida**). Filtra en el cliente las novedades mostradas.
- [ ] Tabla de novedades `Diagrams/table/DiagramDetailTable.tsx` (**manual**, `useReactTable` en memoria), columnas de `table/diagram-detail-colums.tsx`:
  - [ ] Fecha (orden por defecto desc), Descripcion (`short_description`), Estado (nombre del tipo de novedad), Comentario (truncado 240px con el texto completo en `title`).
  - [ ] Cada fila con el **color de texto** del tipo de novedad.
  - [ ] Click en fila = selección (toggle; las no seleccionadas quedan al 50% de opacidad) → filtra el Historial a esas fechas.
  - [ ] Toolbar `table/DataTableToolbarDiagramDetail.tsx`: filtros facetados en memoria "Descripcion" y "Estado" + botón para resetear filtros.
  - [ ] Vacío: "Sin resultados".
  - [ ] Botón icono `FileDown` → descarga Excel `Novedades-YYYYMMDD.xlsx` (hoja "Novedades": Fecha, Turno, Novedad, Comentario) con **todas** las filas recibidas (no respeta filtros).
  - [ ] Paginación (`DataTablePagination` de la tabla).
- [ ] Card "Historial" (icono `History` con tooltip "Historial de cambios en horarios"):
  - [ ] DatePicker "Filtrar por fecha" + botón "Limpiar" cuando hay fecha.
  - [ ] Select de filas por página 10/20/30/50 (default 10).
  - [ ] Tabla manual: Fecha, Descripción, Estado, Estado Anterior, Modificado Por, Fecha Modificación; orden por fecha desc; filas con `description === 'MD'` con estilo propio.
  - [ ] Paginación propia (anterior/siguiente).

### Subtab "Nuevo Diagrama" (`Plus`) — permiso `empleados:new`
- [ ] Componente `Diagrams/DiagramFormUpdated.tsx` con `defaultId` = empleado actual (combo Empleado **deshabilitado** y fijo). Mismo formulario que "Cargar Diagrama" (ver más abajo).

---

## Ficha — pestaña Indumentaria — `/dashboard/employee/action?...&tab=clothing`

- [ ] Componente raíz: `Clothing/EmployeeDeliveries/EmployeeDeliveriesTabContent.tsx` → `EmployeeDeliveriesList/EmployeeDeliveriesList.tsx` (server, `TABLE_ID='employee-deliveries'`, Card wrapper). Carga: `EmployeeDeliveriesTableSkeleton`.
- [ ] Visible solo con `canView(empleados, indumentaria_empleado)`; deshabilitada (`Lock`) en modo new.

### Tabla de entregas
- [ ] Archivos: `EmployeeDeliveriesList/components/_EmployeeDeliveriesDataTable.tsx`, `columns.tsx`, `actions.server.ts`.
- [ ] Sistema: **DataTable nuevo**, client-side (`queryKey=['employee-deliveries', employeeId]`), `paramNamespace`/`tableId` = `employee-deliveries`.
- [ ] Orden por defecto: `delivered_at desc`.
- [ ] Columnas: `select`; Fecha de entrega; Tipo de entrega; Legajo Entregado por; Entregado por; Artículos ("Nombre (marca, talle) xN", primero + "+N más" con tooltip negro; "Sin artículos"; no ordenable); Firma; Notas (oculta por defecto); `actions`.
- [ ] Acción por fila: `DeliveryReceiptButton` compacto (icono) → genera y descarga el PDF de la constancia (toasts "PDF descargado exitosamente" / "Error al generar el PDF" / "Error al cargar los datos de la entrega"). Sin permiso específico.
- [ ] Filtros (visibles por defecto: Fecha de entrega, Tipo de entrega, Entregado por): Fecha de entrega (dateRange), Tipo de entrega (facetado enum), Legajo Entregado por (texto), Entregado por (facetado FK), Firma (facetado Con firma/Sin firma, counts calculados sobre los datos de la página), Notas (texto).
- [ ] Selección múltiple → barra flotante inferior `Clothing/pdf/BulkDownloadBar.tsx` (animada): chip "N entrega(s)", "Descargar ZIP" de constancias con progreso por etapas, botón para limpiar selección; toasts "ZIP descargado con N constancias" / "Error al generar el ZIP de constancias".
- [ ] Export: archivo `entregas-indumentaria`, hoja "Entregas", título "Entregas de Indumentaria"; formatters fecha DD/MM/YYYY, tipo → label, Firma → Sí/No.
- [ ] Vacío: "No hay entregas registradas para este empleado".
- [ ] Botón "Nueva Entrega" (`ExternalLink`, toolbar) → abre `/clothing/delivery?employee_id=<id>` en **pestaña nueva** — `PermissionGuard empleados:indumentaria_empleado:create`.
- [ ] Búsqueda global visible (`showSearch`), placeholder "Buscar en notas...". (Fin de la sección Indumentaria.)

---

## Diagramas (contenedor) — `/dashboard/employee?tab=diagrams&subtab=old|new|massive_diagram|reports`

- [ ] Componente raíz: `Diagrams/EmployeesDiagram.tsx` (server) → `TabsManagerServer` `paramName="subtab"`, default `old`.
- [ ] Carga general: `Diagrams/fallback/DiagramsSkeleton.tsx`; cada subtab con `<Skeleton>` genérico (h-300 / h-64), salvo Reportes (`DiagramReportsSkeleton`).
- [ ] Subtabs y permisos: `old` "Diagramas Cargados" (`FolderOpen`, `empleados:old`) · `new` "Cargar Diagrama" (`Plus`, `empleados:new`) · `massive_diagram` "Carga Masiva" (`FileSpreadsheet`, `empleados:massive_diagram`) · `reports` "Reportes" (`BarChart3`, `empleados:reports`).

---

## Diagramas Cargados — `/dashboard/employee?tab=diagrams&subtab=old`

- [ ] Componente raíz: `Diagrams/EmployeesDiagramWrapper.tsx` (client) + `Diagrams/DiagramEmployeeView.tsx` (grilla); filtros en URL con `hooks/useDiagramUrlFilters.ts`.
- [ ] Card "Buscador de diagramas de empleados" (form):
  - [ ] Nombre y Apellido (inputs con icono `Search` y botón `X` rojo para limpiar cada uno).
  - [ ] MultiSelectCombobox con "Seleccionar todos" y botón `X` para limpiar: Puesto en la empresa, Diagrama de trabajo, Centro de costos, Convenio, Gremio, Categoría, Contratista, Tipo de Diagrama (catálogos por `useQuery`, staleTime 5 min).
  - [ ] "Limpiar filtros" (outline, solo después de buscar) → limpia filtros, resultados y URL.
  - [ ] "Buscar diagramas" / "Buscando..." (submit) → fija los filtros, los sincroniza a la URL y busca. Con filtros en la URL al entrar, la búsqueda arranca sola.
- [ ] Resultados: paginación acumulativa de a 100 empleados (`useInfiniteQuery`), refresco automático cada 60 s (reemplaza el realtime).
  - [ ] Cargando: "Buscando diagramas de empleados...".
  - [ ] Hay más: InfoComponent "Hay más registros disponibles. Al final de la página encontrará la opción para cargar más datos." + botón "Cargar más empleados" / "Cargando más empleados...".
  - [ ] Sin resultados: "No se encontraron diagramas para los empleados seleccionados."
  - [ ] Sin buscar: "Para mostrar diagramas debe aplicar al menos un filtro."
- [ ] Grilla `DiagramEmployeeView` (tabla **manual** empleado × día):
  - [ ] Selector de empleados (MultiSelectCombobox "Selecciona al menos 1 recurso", "Seleccionar todos"; por defecto todos los de la búsqueda). Labels "Apellido Nombre" **sin legajo**.
  - [ ] Rango de fechas (Popover + Calendar range, 2 meses; default hoy → hoy+30) + InfoComponent "La selección máxima es de 30 días" (no se valida).
  - [ ] Encabezado "Empleado" con botón de orden A-Z / Z-A (`ArrowDown`/`ArrowUp`); una columna por día `dd/MM`.
  - [ ] Celda: fondo con el color del tipo de novedad, texto blanco, contenido `short_description`; `title` = "Nombre novedad — comentario" (o solo el nombre; "Sin diagrama" si no hay).
  - [ ] Vacíos: "No hay empleados para mostrar" / "Selecciona al menos un empleado para ver sus diagramas".
  - [ ] "Exportar a Excel" (`FileDown`, outline; deshabilitado sin datos o sin selección) → `Diagramas_<fecha>.xlsx`, hoja "Diagramas": Empleado, Puesto, Sector, Fecha de ingreso, Diagrama, Centro de Costo, Categoría, Convenio, Sindicato + una columna por día, celdas coloreadas; toasts "Archivo Excel generado correctamente" / "No hay datos para exportar".
- [ ] Sin botones con permiso propio (solo el permiso de la subtab).

---

## Cargar Diagrama — `/dashboard/employee?tab=diagrams&subtab=new` (también en la ficha, subtab "Nuevo Diagrama")

- [ ] Componente raíz: `Diagrams/DiagramFormUpdatedWrapper.tsx` (server, trae tipos de novedad, Card p-6) → `Diagrams/DiagramFormUpdated.tsx` (client). Schema: `Diagrams/schemas/diagram-form-schema.ts`.
- [ ] Layout `ResizablePanelGroup`: panel izquierdo 30% (min 24%) con el form; panel derecho 70% (`min-w-[600px]`) con resultados.
- [ ] Form "Generar Diagrama":
  - [ ] Empleado* (combobox, label `[legajo] Apellido Nombre`; "Cargando empleados..."; deshabilitado y fijo si viene de la ficha) — "Por favor selecciona un empleado".
  - [ ] Tipo de novedad* (combobox) — "Por favor selecciona un tipo de novedad".
  - [ ] Fecha desde* y Fecha hasta* (`EnhancedDatePicker`, escritura DD/MM/AAAA o calendario) — "Ingresá la fecha de inicio/finalización (DD/MM/AAAA)"; "La fecha de finalización no puede ser anterior a la fecha de inicio". Ayuda: "Escribí las fechas como DD/MM/AAAA o elegilas en el calendario."
  - [ ] Comentarios (opcional, textarea "Ej: certificado médico presentado") — ayuda "Se guarda en todos los días del rango, salvo los que personalices."
  - [ ] Switch "Personalizar comentario por día" → columna "Comentario" editable por día (`components/DayCommentCell.tsx`, con volver al general) + texto de ayuda.
  - [ ] "Generar diagramas" / "Generando..." → separa los días del rango en existentes y nuevos (todavía no guarda).
- [ ] Panel derecho:
  - [ ] Resumen `components/DiagramLoadSummary.tsx` (empleado y tipo elegidos).
  - [ ] Vacíos: "Todavía no generaste diagramas. / Completá el formulario y presioná “Generar diagramas”…"; al terminar: "No quedan diagramas pendientes de esta carga. / Generá un nuevo rango…".
  - [ ] Card "Diagramas duplicados": tabla Fecha, Novedad registrada, [Comentario], "Actualizar" / "Descartar" por fila; con >1 fila "Actualizar Todos" / "Descartar Todos". Descripción: reemplaza la novedad; comentario vacío conserva el anterior.
  - [ ] Card "Diagramas correctos": tabla Fecha, [Comentario], "Crear" (success) / "Descartar"; con >1 fila "Crear Todos" / "Descartar Todos". Crear deshabilitado mientras procesa.
  - [ ] Toasts (`toast.promise`): "Actualizando diagrama(s)..." → "Diagrama actualizado correctamente" / "Se actualizaron N diagramas" / "No se pudo(ieron) actualizar…"; "Creando diagrama(s)..." → "Diagrama creado correctamente" / "Se crearon N diagramas" / "No se pudo(ieron) crear…".
  - [ ] Sin filas pendientes y operación OK → el form se resetea (salvo el empleado fijo de la ficha).

---

## Carga Masiva — `/dashboard/employee?tab=diagrams&subtab=massive_diagram`

- [ ] Componente raíz: `Diagrams/DiagramMassive.tsx` (client) — Card "Carga Masiva": "Asigna un patrón de diagrama cíclico o una novedad puntual a múltiples empleados en un rango de fechas."
- [ ] Indicador de pasos `components/StepIndicator.tsx`: Formulario → Verificación → Resultados.
- [ ] Paso 1 — `Diagrams/DiagramMassiveForm.tsx`:
  - [ ] Tipo de carga (RadioGroup en tarjetas): "Diagrama" ("Aplica un patrón cíclico (activos/inactivos) a los empleados durante el rango.") / "Novedad" ("Asigna la misma novedad a todos los días del rango (ej: feriado, licencia)."). Cambiar de modo resetea los campos del otro.
  - [ ] Modo Diagrama: Diagrama de trabajo* (Select "Seleccionar diagrama...") — "Selecciona un diagrama de trabajo"; Novedad activa (Select, solo si hay más de una opción); badges "Activo: X" / "Inactivo: Y" con color; toast "Error al cargar las novedades del diagrama".
  - [ ] Modo Novedad: Novedad* (Select con punto de color, nombre y abreviatura) — "Selecciona una novedad".
  - [ ] Rango de fechas* (`FormItemDatePicker`, días pasados deshabilitados, "Selecciona el rango de fechas para la carga masiva") + badge "N día(s)". Validaciones "Solo fechas desde hoy en adelante", "Máximo 90 días permitidos".
  - [ ] Panel "Filtrar empleados" (`components/EmployeeFilterPanel.tsx`): Nombre, Apellido, Posición, Centro de Costo, Convenio, Gremio, Categoría, Contratista; badges de filtros activos; "Limpiar todo"; "Mostrar/Ocultar filtros"; "Buscar empleados" / "Buscando...".
  - [ ] Grilla de selección (`components/EmployeeSelectionGrid.tsx`): tarjetas `[legajo]` (mono) + nombre, toggle; "Seleccionar Todos" / "Limpiar Selección"; máx. 100 (toasts "Máximo 100 empleados permitidos" / "Solo se seleccionaron los primeros 100 empleados…"); "Cargar más empleados"; vacíos "No se encontraron empleados con los filtros aplicados." / "Para mostrar empleados debe aplicar al menos un filtro."; aviso "Hay más empleados disponibles…". Errores "Selecciona al menos un empleado" / "Máximo 100 empleados".
  - [ ] Card "Resumen de la operación": Empleados, Días, Registros, Tiempo Est.
  - [ ] Submit "Verificar y Crear Diagramas" / "Verificar y Cargar Novedad" ("Verificando..."; deshabilitado sin empleados) → chequea conflictos (toast "Error al verificar conflictos. Intente nuevamente.").
- [ ] Paso 2 — `Diagrams/ConflictResolutionModal.tsx` (tarjeta del paso, **no** es modal):
  - [ ] "Conflictos Detectados" ("Se encontraron N registros existentes que requieren atención") o "Resumen de Creación" ("Revisa el resumen de la operación y confirma…").
  - [ ] Card roja "Registros en Uso - NO se pueden modificar (N)": Empleado, Fecha, Diagrama Actual, Estado ("No se puede modificar").
  - [ ] Card amarilla "Registros Existentes - Se actualizarán (N)": misma tabla, Estado "Se actualizará".
  - [ ] Card "Resumen de la Operación": Nuevos registros, Actualizaciones, Errores, Total.
  - [ ] "Cancelar" (vuelve al paso 1 y limpia) / "Continuar (N actualizaciones, M errores)" ("Procesando...") → toasts "Diagramas procesados correctamente" / "Novedad cargada correctamente" / "Error en la creación". Nota sobre registros en uso.
- [ ] Paso 3 — `Diagrams/DiagramMassiveResults.tsx`:
  - [ ] "Operación Completada"; Card "Resumen de Resultados": Creados, Actualizados, Errores, Total.
  - [ ] Card "Detalles de la Operación" con pestañas Creados (Empleado, Fecha, Novedad, Estado), Actualizados (Empleado, Fecha, Novedad Anterior, Novedad Nueva, Estado), Errores (Empleado, Fecha, Tipo de Error, Descripción); vacíos "No se crearon nuevos registros" / "No se actualizaron registros" / "No se encontraron errores".
  - [ ] "Descargar Reporte TXT" ("Descargando..."; toasts "Reporte descargado correctamente" / "Error al descargar el reporte") y "Nueva Carga Masiva".

---

## Reportes — `/dashboard/employee?tab=diagrams&subtab=reports`

- [ ] Componente raíz: `Diagrams/DiagramReportsWrapper.tsx` (título "Reportes de Diagramas" + "Consulta y analiza los datos de novedades diarias de los empleados.") → `Diagrams/Reports/DiagramReportsList.tsx` (server, `TABLE_ID='diagram-reports'`, Card wrapper). Carga: `DiagramReportsSkeleton`.
- [ ] Tabla: `Reports/components/_DiagramReportsDataTable.tsx`, `Reports/columns.tsx`, `Reports/actions.server.ts`. **DataTable nuevo**, client-side (`queryKey=['diagram-reports-paginated']`), `paramNamespace`/`tableId` = `diagram-reports`.
- [ ] Columnas: `select`; Empleado; Legajo (no ordenable); CUIL (oculta, no ordenable); Puesto; Tipo de novedad; Novedad (abrev.) (no ordenable); Comentario (oculta); Fecha (calculada, no ordenable); Día; Mes; Año; Registrado (oculta).
- [ ] Orden por defecto: apellido asc, luego año/mes/día desc.
- [ ] Filtros (visibles por defecto: Tipo de novedad, Empleado, Puesto): Empleado, Tipo de novedad, Puesto (facetados FK lazy); Legajo ("Buscar por legajo (exacto)..."), Apellido, Nombre, CUIL, Día ("Ej: 15"), Mes ("Ej: 3"), Año ("Ej: 2024"), Comentario (texto); Fecha de registro (dateRange).
- [ ] Búsqueda: `searchPlaceholder` "Buscar por nombre, apellido, legajo o CUIL..." pero **`showSearch` no está activo** (no se ve).
- [ ] Selección múltiple habilitada, **sin acciones masivas**.
- [ ] Export: `reporte-novedades-diagramas`, hoja "Novedades", título "Reporte de Novedades de Diagramas"; Día/Mes/Año numéricos, Fecha y Registrado DD/MM/YYYY; respeta filtros activos.
- [ ] Vacío: "No se encontraron registros de novedades".
- [ ] Sin acciones por fila ni botones con permiso.

---

## Rarezas encontradas (no se tocan en el rediseño; anotar en PLAN §9 si corresponde)

- [ ] **Listado sin buscador**: la tabla de empleados no muestra búsqueda global (`showSearch` falso) aunque el server la soporta; Reportes de diagramas define `searchPlaceholder` y tampoco la muestra.
- [ ] **Selección sin uso**: empleados activos/inactivos y Reportes tienen checkboxes de selección sin ninguna acción masiva.
- [ ] **Acciones sin permiso**: "Dar de Baja Empleado" / "Activar Empleado" del menú rápido de la ficha no consultan permisos.
- [ ] **Legajo ausente**: no figura en el header de la ficha (regla `employee-file-number`) ni en los labels de empleados de "Diagramas Cargados".
- [ ] **Enums crudos**: "Razón de Baja" del header y, en modo Vista, nacionalidad, sexo, estado civil, nivel, tipo de documento y tipo de costo se muestran con el valor del enum.
- [ ] **Cancelar edición** vuelve a vista sin descartar los cambios del form (al volver a Editar siguen ahí).
- [ ] **Pestañas dentro del `<form>`** en modo edit: Documentación, Diagramas e Indumentaria se renderizan dentro del form de edición (riesgo de botones sin `type="button"` que disparen el submit; ver Learned Corrections).
- [ ] **`DocumentNav` vacío** en la pestaña Documentación de la ficha: con `onlyNoMultiresource` no renderiza nada pero deja el contenedor con margen bajo un guard de permiso.
- [ ] **Lista de pestañas `grid-cols-6`** fija aunque haya entre 4 y 6 pestañas según permisos/modo.
- [ ] **"Máximo 30 días"** en Diagramas (ficha y Cargados) se informa pero no se valida.
- [ ] **date-fns** en `DiagramDetailEmployeeView.tsx` y `DiagramEmployeeView.tsx` (la regla pide moment). `DiagramDetailEmployeeView` tiene estado `diagramType` sin UI (filtro por tipo comentado / TODO en el archivo).
- [ ] **Excel de novedades de la ficha** exporta todas las filas, ignorando el rango y los filtros de la tabla.
- [ ] **Cargar Diagrama**: "Actualizar" y "Actualizar Todos" no se deshabilitan mientras procesa (los de "Crear" sí). Panel derecho con `min-w-[600px]` (desborda en mobile).
- [ ] **`ConflictResolutionModal`** no es un modal: el nombre engaña.
- [ ] **Huérfanos**: el componente `EmployeeForm` de `EmpleadoID/components/forms/employee-form.tsx` no lo usa nadie (solo se importan los schemas re-exportados); `Diagrams/DiagramNewTypeForm.tsx` y `EmpleadoID/lib/hooks/use-employee-form.ts` sin importadores.
- [ ] **BaseDataTable vieja**: `Empleados/components/tables/data/employees-table.tsx` (sistema viejo) no se usa en este módulo pero la consumen `Comercial/Comerce/components/DataCustomersWrapper.tsx` y `Empresa/Clientes/components/CustomerDetail/CustomerEmployeesTab.tsx`.
- [ ] **Colores hardcodeados** visibles: link azul del nombre (`text-blue-600`), badge Activo verde, textos de baja `text-red-400`, celdas `#fff`, tarjetas de resultados de carga masiva (`text-green-700`, `text-red-700`, `text-gray-800`…), tooltips `bg-black`.

<!-- estado: completo -->
