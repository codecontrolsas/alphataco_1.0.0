# Inventario ANTES — Documentación

> Ficha funcional previa al rediseño. Cada `- [ ]` se tilda "después" al verificar que sigue igual.
> Fuente: código en `feat/rediseno-ui` al 2026-10-07. Rutas: `src/app/dashboard/document/**`, `src/features/Documentacion/**`.
> Tipos de documentos (`TiposDocumentos/`) NO vive en `/dashboard/document`: se monta desde `EquiposComponent` y
> `EmpresaComponent` (ver `equipos.md` / inventario de Empresa).

## Convenciones comunes (aplican a las 6 tablas de documentos)

- [ ] Página `/dashboard/document` (`src/app/dashboard/document/page.tsx`), metadata `Documentos | {BRAND_NAME}`.
- [ ] Raíz: `DocumentacionComponent` (`src/features/Documentacion/DocumentacionComponent.tsx`) con `SectionManagerServer`
      `paramName="tab"`, default `documentos-de-empleados`. 3 secciones con icono: Documentos de Empleados (Users),
      Documentos de Equipos (Truck), Documentos de Empresa (Building2). Cada una visible solo con `documentacion:<tab>:view`.
- [ ] Sub-pestañas con `TabsManagerServer` `paramName="subtab"` (Permanentes = icono FileArchive, Mensuales = icono Calendar),
      cada una gateada por su `tabSlug` (`view`).
- [ ] Sin permiso a ninguna pestaña: card "Sin acceso / No tienes permisos para ver ninguna pestaña en esta sección."
- [ ] Loading de ruta (`document/loading.tsx`): skeleton de 4 tabs + fila de 2 botones + 2 subtabs + tabla en Card.
- [ ] Documentos privados: si el usuario no tiene `documentacion:<documentos-de-X>:view_private`, los tipos `private` no
      aparecen (filtro server-side en paginado, export y facets).
- [ ] Documentos archivados (`archived_at != null`, "Ya no aplica"): excluidos de los listados generales; SOLO se ven cuando
      la tabla se monta con `employeeId`/`equipmentId` (ficha del recurso). Badge `Archive` "Ya no aplica"; vencimiento "-";
      export "Ya no aplica (historial)".
- [ ] Solo recursos activos (`employees.is_active` / `vehicles.is_active`) y tipos de documento activos.
- [ ] Badges de estado: vencido=yellow, rechazado=destructive, pendiente=destructive, aprobado=success, presentado=default;
      iconos presentado FileText · aprobado CheckCircle2 · rechazado XCircle · vencido AlertCircle · pendiente Clock.
      Null → badge outline "Sin estado".
- [ ] Ninguna tabla de documentos tiene selección múltiple ni acciones masivas por fila (salvo el botón de descarga ZIP).
- [ ] Reuso: las 4 tablas de empleados/equipos se montan también en la ficha del empleado
      (`Employees/EmpleadoID/components/employee-document-detail.tsx`), en la ficha del equipo
      (`Equipos/EquipoID/components/equipment-document-detail.tsx`) y en `Equipos/DocumentosEquipos/DocumentosEquiposTabContent.tsx`,
      junto con `DocumentNav`. Cualquier cambio acá impacta esas 3 superficies.

---

## Documentos de Empleados · Permanentes — `/dashboard/document?tab=documentos-de-empleados&subtab=empleados-permanentes`

- [ ] Componente raíz: `DocumentosEmpleados/DocumentosEmpleadosTabContent.tsx` → `Permanentes/EmployeePermanentDocumentsList.tsx`
      (Server, Card + CardContent pt-6) → `Permanentes/components/_EmployeePermanentDocumentsDataTable.tsx`.
- [ ] Fallback: `Permanentes/fallback/EmployeePermanentDocumentsSkeleton.tsx`.
- [ ] Botón superior (sobre las subtabs, compartido con Mensuales): **"Documento Multirecurso"** (`DocumentNav onlyEmployees`)
      — permiso `documentacion:documentos-de-empleados:create` (`PermissionGuardServer`). Abre el dialog
      [Documento multirecurso](#dialog-documento-multirecurso--newdocumentmulti).

### Tabla `employee-permanent-docs`
- [ ] Columnas: `Permanentes/columns.tsx`. Sistema: **DataTable nuevo**, client-side mode (`queryFn`, queryKey
      `['employee-permanent-docs', employeeId]`), `paramNamespace`/`tableId` = `employee-permanent-docs`, lazy facets (`fetchFacet`).
- [ ] Columnas (meta.title, orden):
  - [ ] Empleado — link "Apellido Nombre" a `/dashboard/employee/action?action=view&employee_id=…` (`target=_blank`); ordenable.
  - [ ] Legajo — mono; header con tooltip "Coincidencia exacta: ingrese el legajo completo"; no ordenable.
  - [ ] Tipo de Documento — ordenable.
  - [ ] Estado — badge (ver comunes); ordenable.
  - [ ] Mandatorio — Sí/No/-; no ordenable.
  - [ ] Multirecurso — Sí/No/-; no ordenable; **oculta por defecto**.
  - [ ] Vencimiento — si el tipo no vence: badge "No vence"; si pendiente: badge destructive "Pendiente"; si no fecha DD/MM/YYYY; ordenable.
  - [ ] Subido el — "No disponible" si pendiente, si no DD/MM/YYYY; ordenable.
  - [ ] Motivo de rechazo — texto o "-"; no ordenable; **oculta por defecto**.
  - [ ] (acciones) — sin título, no ocultable, excluida del export.
- [ ] Filtros (9; visibles por defecto: Estado, Empleado, Legajo, Tipo de documento):
  - [ ] Estado — faceted enum (+ "Sin estado" si hay null).
  - [ ] Empleado — text ("Buscar por nombre o apellido...").
  - [ ] Legajo — text, coincidencia exacta ("Ingrese el legajo completo...").
  - [ ] Tipo de documento — faceted FK (+ "Sin tipo").
  - [ ] Mandatorio — faceted bool ("Mandatorio"/"No Mandatorio" + "Sin asignar").
  - [ ] Multirecurso — faceted bool ("Multirecurso"/"No Multirecurso" + "Sin asignar").
  - [ ] Vencimiento — dateRange.
  - [ ] Subido el — dateRange.
  - [ ] Motivo de rechazo — text.
- [ ] Búsqueda: "Buscar por empleado..." (apellido o nombre, insensitive).
- [ ] Orden por defecto: `employees.lastname asc` (siempre como último criterio de desempate).
- [ ] Exportación Excel: archivo `documentos-permanentes-empleados`, título "Documentos Permanentes de Empleados", hoja "Documentos";
      respeta filtros activos (`currentParams`); formatters de estado (incl. archivado), Sí/No, fechas DD/MM/YYYY.
- [ ] Toolbar: botón **"Descargar Documentos"** (icono Download) → AlertDialog "Descargar N documento(s)":
  - [ ] Deshabilitado si no hay filas descargables (no pendiente, con archivo, no archivado) **de la página actual**.
  - [ ] Acordeón rojo "N documentos pendientes (no se descargarán)" con lista Empleado (Tipo).
  - [ ] Acordeón verde "N documentos listos para descargar".
  - [ ] Cancelar / "Descargar documentos" → ZIP `documentos-permanentes.zip`, archivos `Apellido_Nombre-(Tipo).ext`;
        toast.promise "Descargando documentos..." / "Documentos descargados correctamente" / error.
- [ ] Acciones por fila:
  - [ ] Estado `pendiente` → botón outline **"Subir documento"** (abre AlertDialog con [SimpleDocument](#dialog-subir-documento--simpledocument),
        recurso empleado, tipo y empleado preseleccionados por `numberDocument` = DNI). Permiso:
        tipo privado → `documentacion:documentos-de-empleados:upload_private`; si no → `documentacion:docs-empleados-permanentes:update`.
  - [ ] Otro estado → botón **"Ver documento"** → `/dashboard/document/{id}?resource=Persona`. Permiso `documentacion:docs-empleados-permanentes:view`.
- [ ] Vacío: "No hay documentos permanentes de empleados registrados".

---

## Documentos de Empleados · Mensuales — `/dashboard/document?tab=documentos-de-empleados&subtab=empleados-mensuales`

- [ ] Componente raíz: `Mensuales/MonthlyEmployeeDocumentsList.tsx` → `Mensuales/components/_MonthlyEmployeeDocumentsDataTable.tsx`.
      Fallback `Mensuales/fallback/MonthlyEmployeeDocumentsSkeleton.tsx`.
- [ ] Mismo botón "Documento Multirecurso" de la sección (permiso `documentos-de-empleados:create`).

### Tabla (tableId de `MonthlyEmployeeDocumentsList`)
- [ ] Columnas: `Mensuales/columns.tsx`. DataTable nuevo, client-side (queryKey `['monthly-employee-documents', employeeId]`), lazy facets.
- [ ] Columnas:
  - [ ] Empleado — link a ficha del empleado; ordenable.
  - [ ] Legajo — no ordenable (tooltip de coincidencia exacta).
  - [ ] Tipo de Documento — ordenable.
  - [ ] Afectado a — badges de clientes (1 → badge; varios → "Primero +N" con tooltip con todos; ninguno → "Sin afectar"); no ordenable.
  - [ ] Estado — ordenable.
  - [ ] Mandatorio — **oculta por defecto**; no ordenable.
  - [ ] Multirecurso — **oculta por defecto**; no ordenable.
  - [ ] Período — texto o "-"; ordenable.
  - [ ] Subido el — fecha del log más reciente (`documents_employees_logs[0].updated_at`) o `created_at`; "No disponible" si pendiente; ordenable.
  - [ ] Razón de rechazo — **oculta por defecto**; no ordenable.
  - [ ] (acciones).
- [ ] Filtros (10; visibles por defecto: Estado, Empleado, Legajo, Tipo de Documento): Estado (faceted), Empleado (text), Legajo (text exacto),
      Tipo de Documento (faceted FK, "Sin tipo"), Mandatorio (bool), Multirecurso (bool), Afectado a (faceted M:M, "Sin afectar"),
      Subido el (dateRange), Período (text), Motivo de rechazo (text).
- [ ] Búsqueda: "Buscar por empleado...". Orden por defecto: `employees.lastname asc`.
- [ ] Export: `documentos-mensuales-empleados`, título "Listado de Documentos Mensuales de Empleados", hoja "Documentos Mensuales".
- [ ] Toolbar "Descargar Documentos" igual a Permanentes; ZIP `documentos-mensuales.zip`, archivos `Apellido_Nombre-(Tipo){período}.ext`.
- [ ] Acciones por fila: "Subir documento" (pendiente; permiso `upload_private` en `documentos-de-empleados` si privado, si no
      `docs-empleados-mensuales:update`) / "Ver documento" (`docs-empleados-mensuales:view`) → `/dashboard/document/{id}?resource=Persona`
      (si la fila no tiene empleado usa `resource=Equipos`).
- [ ] Vacío: "No hay documentos mensuales de empleados registrados".

---

## Documentos de Equipos · Permanentes — `/dashboard/document?tab=documentos-de-equipos&subtab=equipos-permanentes`

- [ ] Componente raíz: `DocumentosEquipos/DocumentosEquiposTabContent.tsx` → `Permanentes/EquipmentPermanentDocumentsList.tsx`
      → `Permanentes/components/_EquipmentPermanentDocumentsDataTable.tsx`. Queries en `Permanentes/queries.server.ts`,
      where en `Permanentes/lib/where.ts`, facets en `Permanentes/facets.server.ts`. Fallback `EquipmentPermanentDocumentsSkeleton`.
- [ ] Botón superior **"Documento Multirecurso"** (`DocumentNav onlyEquipment`) — permiso `documentacion:documentos-de-equipos:create`.

### Tabla
- [ ] Columnas: `Permanentes/columns.tsx`. DataTable nuevo, client-side (queryKey `['equipment-permanent-docs', equipmentId ?? 'all']`), lazy facets.
- [ ] Columnas (ocultas por defecto marcadas *):
  - [ ] Equipo — link (dominio → serie → n° interno) a `/dashboard/equipment/action?action=view&id=…` (`_blank`); ordenable.
  - [ ] Serie* — no ordenable.
  - [ ] N° de Póliza — ordenable.
  - [ ] Documento (tipo) — ordenable.
  - [ ] Afectado a — badges de clientes (igual que mensuales empleados); no ordenable.
  - [ ] Estado — ordenable.
  - [ ] Mandatorio — no ordenable.
  - [ ] Multirecurso* — no ordenable.
  - [ ] Vencimiento — ordenable.
  - [ ] Subido el — ordenable.
  - [ ] Motivo de rechazo* — no ordenable.
  - [ ] Tipo* · Subtipo* · Marca* · Año* · Propietario* (si contrato "Propio" y sin titular → "Propio") · Sector* · Chasis* · Motor*
        · Tipo de contrato* · Venc. de contrato* — todas ordenables.
  - [ ] (acciones).
- [ ] Filtros (21; visibles por defecto: Estado, Dominio, Tipo de documento): Estado, Dominio (text: dominio/serie/n° interno),
      Tipo de documento (FK), Mandatorio, Multirecurso, Afectado a (M:M), Vencimiento (dateRange), Subido el (dateRange),
      Motivo de rechazo (text), Serie (text), N° de Póliza (text), Tipo, Subtipo, Marca (faceted), Año (text), Propietario,
      Sector (faceted), Chasis (text), Motor (text), Tipo de contrato (faceted), Venc. de contrato (dateRange).
- [ ] Búsqueda: "Buscar por dominio, serie o número interno...". Orden por defecto: `vehicles.domain asc`.
- [ ] Export: `documentos-permanentes-equipos`, título "Documentos Permanentes de Equipos".
- [ ] Toolbar "Descargar Documentos" (ZIP `documentos-permanentes-equipos.zip`).
- [ ] Acciones por fila: "Subir documento" (pendiente; SimpleDocument recurso equipo, preselección por id del vehículo;
      permiso `upload_private` en `documentos-de-equipos` si privado, si no `docs-equipos-permanentes:update`) /
      "Ver documento" (`docs-equipos-permanentes:view`) → `/dashboard/document/{id}?resource=Equipos`.
- [ ] Vacío: "No hay documentos permanentes de equipos registrados".

---

## Documentos de Equipos · Mensuales — `/dashboard/document?tab=documentos-de-equipos&subtab=equipos-mensuales`

- [ ] Componente raíz: `Mensuales/MonthlyEquipmentDocumentsList.tsx` → `Mensuales/components/_MonthlyEquipmentDocumentsDataTable.tsx`.
- [ ] Mismo botón "Documento Multirecurso" (`documentos-de-equipos:create`).

### Tabla
- [ ] Columnas: `Mensuales/columns.tsx`. DataTable nuevo, client-side (queryKey `['monthly-equipment-documents', equipmentId]`), lazy facets.
- [ ] Columnas: Equipo (link, ordenable) · Tipo de Documento (ord.) · Afectado a · Estado (ord.) · Mandatorio* · Multirecurso* ·
      Período (ord.) · Subido el (ord.) · Razón de rechazo* · (acciones). (* oculta por defecto)
- [ ] Filtros (8; visibles por defecto: Estado, Equipo, Tipo de Documento): Estado, Equipo (text), Tipo de Documento (FK),
      Mandatorio, Multirecurso, Afectado a (M:M), Período (text), Motivo de rechazo (text), Subido el (dateRange).
- [ ] Búsqueda: "Buscar por dominio, serie o número interno...". Orden por defecto: `vehicles.domain asc`.
- [ ] Export: `documentos-mensuales-equipos`, título "Listado de Documentos Mensuales de Equipos".
- [ ] Toolbar "Descargar Documentos" (ZIP `documentos-mensuales-equipos.zip`).
- [ ] Acciones por fila: "Subir documento" (`docs-equipos-mensuales:update` o `documentos-de-equipos:upload_private`) /
      "Ver documento" (`docs-equipos-mensuales:view`) → `?resource=Equipos` (o `Persona` si la fila no tiene vehículo).
- [ ] Vacío: "No hay documentos mensuales de equipos registrados".

---

## Documentos de Empresa · Permanentes — `/dashboard/document?tab=documentos-de-empresa&subtab=empresa-permanentes`

- [ ] Componente raíz: `DocumentosEmpresa/DocumentosEmpresaTabContent.tsx` → `components/CompanyDocsPermanentesList.tsx`
      → `components/_CompanyDocsPermanentesDataTable.tsx`. Fallback `fallback/CompanyDocsTableSkeleton.tsx` (compartido).
- [ ] **Sin botón de carga** a nivel sección (no hay DocumentNav en Empresa).

### Tabla `company-docs-permanentes`
- [ ] Columnas: `components/columns.tsx` (`getCompanyDocsColumns(false)`). Sistema: **DataTable nuevo pero en modo SSR**
      (sin `queryFn`, navega por URL) y **facets bulk** (`getCompanyDocsFacets` en un `useQuery`, `options`/`externalCounts`,
      `isFetchingFacets`) — patrón deprecado.
- [ ] Columnas: Nombre del documento (ord.) · Estado (badge con `documentStateBadges`/`documentStateLabels`; icono presentado =
      ExternalLink; ord.) · Mandatorio (badge destructive "Sí" / secondary "No"; no ord.) · Subido por (nombre o "Pendiente"; ord.) ·
      Fecha de carga (DD/MM/YYYY o "-"; ord.) · Vencimiento (texto `validity`, "No vence" o "Pendiente"; ord.) · (acciones).
      Ninguna oculta por defecto.
- [ ] Filtros (5; visibles por defecto: Estado, Tipo de documento, Mandatorio): Estado (faceted + "Sin asignar"),
      Tipo de documento (faceted FK), Mandatorio (Sí/No), Subido por (faceted, icono User), Fecha de carga (dateRange).
- [ ] Búsqueda: "Buscar por nombre de documento..." (`showSearch`). Orden por defecto: `document_types.name asc`.
- [ ] Export: `documentos-empresa-permanentes`, hoja "Docs Permanentes", título "Documentos de Empresa — Permanentes".
- [ ] Sin botón de descarga ZIP.
- [ ] Acciones por fila (**sin PermissionGuard**):
  - [ ] Subido (estado ≠ pendiente o con archivo) → link "Ver" (icono ExternalLink) → `/dashboard/document/{id}?resource=Empresa`.
  - [ ] Pendiente → botón **"Subir"** → [AddCompanyDocumentForm](#dialog-subir-documento-de-empresa--addcompanydocumentform).
- [ ] Vacío: "No se encontraron documentos permanentes".

## Documentos de Empresa · Mensuales — `/dashboard/document?tab=documentos-de-empresa&subtab=empresa-mensuales`

- [ ] `components/CompanyDocsMensualesList.tsx` → `components/_CompanyDocsMensualesDataTable.tsx` (`getCompanyDocsColumns(true)`), tableId `company-docs-mensuales`.
- [ ] Igual a Permanentes + columna **Período** (ord., al final antes de acciones) + filtro Período (text).
      Filtros visibles por defecto: Estado, Tipo de documento, Período.
- [ ] Export: `documentos-empresa-mensuales`, hoja "Docs Mensuales", título "Documentos de Empresa — Mensuales".
- [ ] Vacío: "No se encontraron documentos mensuales".

---

## Detalle de documento — `/dashboard/document/[id]?resource=Persona|Equipos|Empresa&tab=…`

- [ ] Página: `src/app/dashboard/document/[id]/page.tsx` → `DetalleDocumento/DocumentDetailSection.tsx` (Server). Datos:
      `actions/document-detail.server.ts` (`getDocumentDetail`, acotado a la empresa activa). `?resource` decide la tabla
      (Persona→employee, Equipos→vehicle, Empresa→company).
- [ ] Sin `documentacion:detalle-de-documento:view` → card "Sin acceso / No tienes permisos para ver esta sección."
- [ ] Documento inexistente u otra empresa → card "Documento no encontrado / El documento no existe o no pertenece a la empresa activa."
- [ ] Aviso ámbar (icono Archive) si archivado: "Este documento **ya no aplica** al recurso … se conserva a modo de **historial** …".
- [ ] Layout: columna izquierda (encabezado + pestañas) y visor a la derecha (lg: 1/3 + 2/3).
- [ ] Encabezado (`components/DocumentDetailHeader.tsx`): título = nombre del tipo; badge de estado (capitalize) y, si hay,
      badge con motivo de rechazo; si archivado badge "Ya no aplica · Historial" (sin estado).
  - [ ] Botón **"Descargar"** (`DownloadButton`) → descarga `{nombreTipo}CodeControl.{ext}`; toasts "Descargando documento..." /
        "Documento descargado". Sin permiso propio.
  - [ ] `BackButton` (volver).
- [ ] Pestañas (`TabsManagerServer paramName="tab"`, default `Documento`):
  - [ ] **Empresa** (`detalle-doc-empresa`) — `CompanyInfoCard`: logo, razón social, CUIT, Dirección, País, Provincia,
        Teléfono de contacto, Email de contacto, Fecha de alta (del empleado, si aplica), Descripción. Texto: "Datos de la empresa
        a la que pertenece este documento" (empresa) / "…que solicita el documento" (recurso).
  - [ ] **Empleado** (`detalle-doc-empleado`, solo resource employee) — `EmployeeInfoCard`: foto, nombre, Legajo, DNI, CUIL,
        Dirección, Provincia, Teléfono, Email, Fecha de alta, Afectaciones.
  - [ ] **Equipos/Vehículo** (mismo value `Empleado` y tabSlug `detalle-doc-empleado`, solo resource vehicle) — `EquipmentInfoCard`:
        foto, nombre, Dominio, Numero interno, Marca, Modelo, Fecha de alta, Motor, Chasis, Tipo de vehiculo.
  - [ ] **Documento** (`detalle-doc-documento`) — `DocumentTypeCard`: título "Datos del documento de empresa" / "…que se le solicita
        al empleado"; nombre, mandatorio sí/no, multirecurso sí/no (no empresa), vencimiento, "Documento aplica a X", fecha de subida,
        Período (si hay), aviso de consideraciones especiales (`special` + descripción).
  - [ ] **Actualizar** (sin tabSlug; solo si `documentacion:detalle-de-documento:update`) — `DocumentActionsCard`: texto "Si el
        documento es rechazado, vencido o necesita ser actualizado puedes hacerlo desde aquí, una vez aprobado el documento no podrá
        ser modificado" + botones **Renovar**, **Reemplazar**, **Eliminar** (siempre visibles, sin depender del estado).
- [ ] Visor (`components/DocumentPreview.tsx`): `<embed>` del archivo; PDF a ancho completo/min-h-screen; Suspense con Skeleton.
- [ ] Loading de ruta: `document/[id]/loading.tsx`.
- [ ] No existen en esta pantalla acciones de Aprobar/Rechazar.

---

## Dialogs de documentos

### Dialog "Documento multirecurso" — `NewDocumentMulti`
- [ ] Archivo: `shared/components/NewDocumentMulti.tsx` (Server; carga empleados, equipos, tipos y empresa). Invocado por `DocumentNav`.
- [ ] Trigger: botón variant `brand` "Documento Multirecurso". AlertDialog con `InfoComponent`: "Desde aqui solo podras subir
      documentos faltantes, si deseas reemplazar o eliminar un documento, dirigete al documento en cuestion…".
- [ ] Tabs internas: "Empleados" (si `onlyEmployees`) / "Equipos" (si `onlyEquipment`). Cancel oculto `close-create-document-modal`
      (lo usan los forms para cerrar).
- [ ] Solo ofrece tipos `multiresource` del recurso (Persona / Equipos).

#### Form `UploadDocumentMultiEmployee` / `UploadDocumentMultiEquipment` (`shared/components/`)
- [ ] Título "Documento multirecurso". RHF + zod.
- [ ] Campos:
  - [ ] Tipo de documento* — combobox con búsqueda ("Buscar tipo de documento"); al elegir carga qué recursos ya lo tienen
        (`getAllDocumentsByIdDocumentTypeCientSide`), limpia vencimiento, período y archivo.
  - [ ] Empleados* / Equipos* — `MultiSelectCombobox` con "seleccionar todos"; marca los que ya tienen el documento.
        Label empleado: "Nombre Apellido - CUIL" (sin legajo). Equipo: "dominio - n° interno|serie".
  - [ ] Fecha de validez* (solo si el tipo vence) — `EnhancedDatePicker`.
  - [ ] Período* (solo si es mensual) — `YearMonthPicker` → `YYYY-MM`.
  - [ ] N° de póliza (solo equipos y si el tipo `has_policy_number`; opcional).
  - [ ] Documento* — input readonly + botón "Seleccionar archivo" (deshabilitado sin tipo/recursos); arma nombre del archivo.
- [ ] Validaciones visibles: "Este campo es requerido"; toast "Debe seleccionar un archivo"; toast "Debe seleccionar al menos un recurso".
      Texto de ayuda dice "Selecciona al menos dos recursos" (no se valida el mínimo de 2).
- [ ] Botones: **Cancelar** (destructive; resetea y cierra) · **Enviar** ("Enviando…").
- [ ] Submit: `uploadMultiResourceDocument` (server, transacción; completa solo faltantes; ignora ya presentados); toast
      "Documento cargado (N recursos)"; reset; `invalidateQueries()` + `router.refresh()`; cierra el modal. Error → toast con el mensaje.

### Dialog "Subir documento" — `SimpleDocument`
- [ ] Archivo: `shared/components/SimpleDocument.tsx`. Se abre desde "Subir documento" de las 4 tablas de empleados/equipos
      (AlertDialog `max-h-[90vh]` con scroll). Datos por React Query (`getActiveDocumentTypesByResource`, `getActiveResourcesForDocuments`).
- [ ] Campos (RHF con `rules`, sin zod):
  - [ ] Empleados/Equipos* — combobox con búsqueda (por nombre o número de documento); **bloqueado** si viene preseleccionado
        (`numberDocument`, `?document=` o `?id=`). Oculto si hay `?document=` en la URL. Skeleton mientras carga.
  - [ ] Filtro de tipos (ToggleGroup Ambos / Permanentes / Mensuales) — solo si no viene tipo predefinido.
  - [ ] Tipo de documento* — combobox "Buscar documento" ("Documento no encontrado").
  - [ ] Documento* (input file) — muestra "Archivo seleccionado: …"; error "El archivo es obligatorio".
  - [ ] Fecha de vencimiento* (si el tipo vence) — `<Input type="date">` (escritura directa); "La fecha de vencimiento es requerida".
  - [ ] Periodo* (si es mensual) — `<Input type="month">`; "Falta seleccionar el periodo".
- [ ] Botones: **Cancelar** · **Enviar documento** ("Enviando"; deshabilitado mientras cargan tipos/recursos).
- [ ] Submit: `uploadMultiResourceDocument` con N=1. **Si el tipo es multirecurso, sube a TODOS los recursos activos**, no solo al
      elegido. Error "El documento ya ha sido subido anteriormente" (o "…para el período X") se muestra bajo el tipo. Éxito: toast
      "Documento subido correctamente", cierra, `invalidateQueries()`, `onUploaded?.()`; refresca drawers del store si aplica.

### Dialog "Subir documento" de empresa — `AddCompanyDocumentForm`
- [ ] Archivo: `src/features/Empresa/General/Documentacion/components/AddCompanyDocumentForm.tsx` (vive en Empresa). Trigger "Subir"
      (o link "Ver documento" si `documentIsUploaded`).
- [ ] AlertDialog "Subir documento" / "Rellena el siguiente formulario para subir el documento". RHF + zod.
- [ ] Campos: Tipo de documento* (Select; fijo al tipo de la fila) · Archivo* (input file) · Fecha de vencimiento* (si vence;
      `type=date`, min hoy) · Periodo* (si mensual; `type=month`). Mensaje "Este campo es requerido".
- [ ] Botones: Cancelar (`cerrar-modal-company-document`) · Subir.
- [ ] Submit: `uploadCompanyDocument` (FormData); toast "Subiendo documento" / "Documento subido con exito"; cierra el modal;
      `fetchDocuments()` del store + `invalidateQueries()` + `router.refresh()`.

### Dialog "Renovar documento" — `UpdateDocuments`
- [ ] Archivo: `shared/components/UpdateDocuments.tsx`. Trigger "Renovar" (tab Actualizar del detalle).
- [ ] Campos: Nuevo Documento* (file) · Fecha de vencimiento* (si el tipo vence; `EnhancedDatePicker`, min hoy, "DD/MM/YYYY";
      "Se debe elegir una fecha") · Periodo* (si mensual; `type=month`; "El periodo es requerido").
- [ ] Aviso azul: "Este nuevo documento sera el nuevo documento vigente y el anterior sera almacenado en la historia."
- [ ] Submit "Renovar": `renewDocumentFile` (archiva el vigente, sube el nuevo, estado → `presentado`); toast "Renovando..." /
      "Documento renovado correctamente"; `router.refresh()`; cierra.

### Dialog "Reemplazar documento" — `ReplaceDocument`
- [ ] Archivo: `shared/components/ReplaceDocument.tsx`. Trigger outline "Reemplazar".
- [ ] Campos: Nuevo Documento* (file) · Fecha de vencimiento* (solo si el documento **actual tiene** vencimiento; input
      DD/MM/YYYY + calendario; errores "La fecha debe ser igual o posterior a hoy", "Formato inválido. Use DD/MM/YYYY") ·
      Periodo (solo si el documento actual tiene período; `type=month`; opcional).
- [ ] Aviso azul: "Este nuevo documento reemplazara el anterior. El documento actual sera eliminado y no podra ser recuperado."
- [ ] Submit "Reemplazar": `replaceDocumentFile` (borra el anterior, sube el nuevo, estado → `presentado`, des-archiva); toast
      "Reemplazando..." / "Documento reemplazado correctamente (puede tardar unos minutos para que se actualice)"; `router.refresh()`.

### Dialog "Eliminar documento" — `DeleteDocument`
- [ ] Archivo: `shared/components/DeleteDocument.tsx`. Trigger destructive "Eliminar".
- [ ] Campo: escribir **ELIMINAR** (borde verde si coincide, rojo si no); error "Debe ingresar la palabra ELIMINAR para eliminar el documento".
- [ ] Aviso azul: "Este nuevo documento será eliminado y no podra ser recuperado…".
- [ ] Submit "Eliminar": `deleteDocumentFile` (borra el archivo y deja la fila en `pendiente`, sin validity ni period);
      toast "Eliminando..." / "Documento eliminado correctamente"; `router.refresh()`.

<!-- estado: completo -->
