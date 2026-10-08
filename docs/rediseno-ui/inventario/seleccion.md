# Inventario — Selección

Ficha "ANTES" del módulo Selección (circuito de incorporación de candidatos, ticket 505). Lista contra la que se
verifica que el rediseño no pierda nada. Cada `- [ ]` se tilda al comprobarlo en la versión rediseñada.
Permisos: `modulo:tab:acción`. `*` = campo obligatorio.

Rutas: `/dashboard/recruitment` (lista) y `/dashboard/recruitment/detail` (alta/detalle).
Feature: `src/features/Seleccion/`.

---

## Candidatos (lista) — `/dashboard/recruitment?tab=candidatos`

- [ ] Página: `src/app/dashboard/recruitment/page.tsx` → `SeleccionComponent` (`src/features/Seleccion/SeleccionComponent.tsx`), `SectionManagerServer` con `paramName="tab"`, una sola tab `candidatos` (icono `UserSearch`, "Candidatos"), visible según `seleccion:candidatos`.
- [ ] Metadata: título `Selección | <empresa>` (cookie `actualCompName` o `getCompanyName()`), fallback `Selección`.
- [ ] Contenido: `CandidatosTabContent.tsx` (Server Component).

### Botones de la pantalla
- [ ] "Nuevo Candidato" (icono `Plus`, variant `brand`, size `sm`, alineado a la derecha) → link a `/dashboard/recruitment/detail?action=new`. Visible solo si `permissionsMap['seleccion:candidatos:create']`.

### Estados especiales
- [ ] Sin permiso `seleccion:candidatos:view` → texto centrado "No tenés permiso para ver esta información." (no se renderiza la tabla).
- [ ] Carga: `<Suspense fallback={<PreEmployeeTableSkeleton />}>` (Card con skeletons) — `components/PreEmployeeList/fallback/PreEmployeeTableSkeleton.tsx`.
- [ ] Vacío: `emptyMessage` "No hay candidatos cargados".

### Tabla de candidatos
- [ ] Archivos: `components/PreEmployeeList/PreEmployeeList.tsx` (server, `TABLE_ID='pre-employees'`, `stripPrefixFromSearchParams`, `getTablePreferences`, envuelto en `<Card><CardContent className="pt-6">`), `components/_PreEmployeeDataTable.tsx` (client), `columns.tsx`, `actions.server.ts`.
- [ ] Sistema: **DataTable nuevo**, client-side mode (`queryFn` + `queryKey=['pre-employees-paginated']` + `onStateChange`), `paramNamespace` y `tableId` = `pre-employees`, `showFilterToggle`, `data-testid="pre-employees-table"`.
- [ ] Columnas (meta.title), en orden:
  - [ ] `select` (checkbox, sin título, excluida de export)
  - [ ] N° Candidato (`pre_file_number`, mono, link al detalle sin color)
  - [ ] Nombre completo (`fullName`, "Apellido Nombre", link azul al detalle; **no ordenable**)
  - [ ] DNI (`document_number`)
  - [ ] CUIL (oculta por defecto)
  - [ ] Estado (Badge con icono: En proceso/`Clock`/warning, Pre ingreso/`Send`/info, Rechazado/`XCircle`/destructive, Legajo creado/`CheckCircle2`/success)
  - [ ] Sector propuesto (`hierarchy`)
  - [ ] Puesto propuesto (`company_positions`)
  - [ ] Telefono (oculta por defecto)
  - [ ] Email (oculta por defecto)
  - [ ] Motivo de rechazo (oculta por defecto)
  - [ ] Creado (`created_at`, DD/MM/YYYY, oculta por defecto)
  - [ ] Revisado (`reviewed_at`, DD/MM/YYYY o "-", oculta por defecto)
  - [ ] `actions` (sin título, no ocultable, excluida de export)
- [ ] Ocultas por defecto (`HIDDEN_COLUMNS_BY_DEFAULT`): cuil, phone, email, rejection_reason, created_at, reviewed_at — mergeadas con preferencias guardadas.
- [ ] Filtros (visibles por defecto: Estado, Sector propuesto, Puesto propuesto):
  - [ ] Estado — faceted lazy (`fetchFacet`), opciones del enum `pre_employee_status_enum` con labels e iconos
  - [ ] Sector propuesto — faceted lazy FK, con "Sin asignar" (`CircleOff`) si hay nulls
  - [ ] Puesto propuesto — faceted lazy FK, con "Sin asignar"
  - [ ] N° Candidato — text
  - [ ] Nombre — text (busca en apellido OR nombre)
  - [ ] DNI — text
  - [ ] CUIL — text
  - [ ] Telefono — text
  - [ ] Email — text
  - [ ] Motivo de rechazo — text
  - [ ] Creado — dateRange
  - [ ] Revisado — dateRange
- [ ] Búsqueda global: placeholder "Buscar por N° de candidato, nombre, DNI o CUIL" (busca en pre_file_number, lastname, firstname, document_number, cuil).
- [ ] Orden por defecto: `created_at desc` (siempre agregado como último criterio). Multi-sort; ordenables: pre_file_number, document_number, cuil, status, phone, email, rejection_reason, created_at, reviewed_at, hierarchy (por nombre), company_positions (por nombre).
- [ ] Exportación Excel: archivo `candidatos`, título "Listado de Candidatos", hoja "Candidatos"; respeta filtros activos (`currentParams`); formatters: estado → label, fechas → DD/MM/YYYY o "-".
- [ ] Selección múltiple: habilitada (`enableRowSelection` + `showRowSelection`). **Sin acciones masivas propias** (solo las genéricas del DataTable).
- [ ] Acciones por fila: botón "Ver" (icono `Eye`, ghost) → `/dashboard/recruitment/detail?action=view&pre_employee_id=<id>`. Sin condición de permiso.

---

## Candidato — alta / detalle — `/dashboard/recruitment/detail?action=new` · `?action=view&pre_employee_id=<id>`

- [ ] Página: `src/app/dashboard/recruitment/detail/page.tsx` → `PreEmployeeDetailClient` (`components/PreEmployeeDetailClient.tsx`) dentro de `div.p-6`, con `key` = id o `'new'` (fuerza remontaje al cambiar de candidato).
- [ ] Metadata: nuevo → "Nuevo Candidato" / "Registrar un postulante en proceso de ingreso"; detalle → "Candidato N° <pre_file_number> - <Apellido> <Nombre>" o "Candidato no encontrado".

### Estados especiales (server)
- [ ] Sin `seleccion:candidatos:view` → `notFound()` (404).
- [ ] `action=view` sin `pre_employee_id`, candidato inexistente o error de lectura → `notFound()`.

### Barra superior
- [ ] Botón "Volver" (`ArrowLeft`, ghost; texto oculto en mobile) → `router.back()`.
- [ ] Botones de transición (`PreEmployeeTransitionButtons.tsx`), solo con candidato existente, derivados de la máquina de estados (`lib/state-machine.ts`) y filtrados por permiso:
  - [ ] En proceso → "Enviar a pre ingreso" (`Send`, outline) — requiere `seleccion:candidatos:update`. Ejecuta directo; toast "El candidato pasó a pre ingreso"; `router.refresh()`.
  - [ ] En proceso → "Rechazar" (`XCircle`, destructive) — requiere `seleccion:candidatos:approve`. Abre dialog de rechazo.
  - [ ] Pre ingreso → "Aprobar y crear legajo" (`CheckCircle2`, default) — requiere `approve`. Abre sheet de aprobación.
  - [ ] Pre ingreso → "Rechazar" — requiere `approve`. Abre dialog de rechazo.
  - [ ] Rechazado → "Reabrir" (`RotateCcw`, outline) — requiere `update`. Ejecuta directo; toast "El candidato volvió a estar en proceso"; `router.refresh()`.
  - [ ] Legajo creado → sin botones (estado terminal).
  - [ ] Mientras procesa: todos deshabilitados, el pulsado dice "Procesando..."; texto de los botones oculto en mobile (solo icono). Error → toast con el mensaje del server.

### Encabezado (Card)
- [ ] "Candidato N° <n>" / "Candidato nuevo" + título "<Apellido> <Nombre>" / "Nuevo candidato".
- [ ] Badge de estado (mismos labels/variantes que la tabla).
- [ ] Si tiene `employee_id`: botón "Ver legajo N° <file>" (`ExternalLink`, outline) → `/dashboard/employee/action?action=view&employee_id=<id>`.
- [ ] Si está rechazado con motivo: Alert destructive "Candidato rechazado" + motivo + fecha de revisión (DD/MM/YYYY) · nombre del revisor.

### Formulario del candidato (Card, react-hook-form + `preEmployeeFormSchema`)
- [ ] Edición habilitada (`canEditData`): nuevo → `seleccion:candidatos:create`; existente → `update` y estado En proceso o Pre ingreso. Si no, `<fieldset disabled>` y sin botón de guardar.
- [ ] Tabs (grid de 4; texto oculto en mobile, solo icono). Tab con errores: texto en rojo + punto rojo.
  - [ ] **Datos Personales** (`User`):
    - [ ] N° de Candidato (readonly/disabled, mono; placeholder "Se asignará automáticamente al crear el candidato")
    - [ ] Foto del empleado (opcional; botón "Subir foto"/"Cambiar foto", preview circular) — `PersonalDataFields` compartido con Empleados
    - [ ] Nombre*, Apellido*, Tipo de documento*, Número de documento*, CUIL*, Fecha de nacimiento* (`<Input type="date">`), Nacionalidad*, País de nacimiento*, Sexo*, Estado civil*, Nivel de instrucción*
  - [ ] **Datos de Contacto** (`Phone`) — `ContactDataFields` compartido: Calle*, Altura*, Provincia*, Ciudad* (depende de provincia), Código postal*, Teléfono*, Email* (valida formato "Email inválido")
  - [ ] **Datos Laborales** (`Briefcase`) — `forms/PreEmployeeWorkDataForm.tsx`: texto explicativo + Sector propuesto* (Select) y Puesto propuesto* (Select, deshabilitado con placeholder "Primero seleccione un sector" hasta elegir sector; filtrado por sector; al cambiar sector se limpia el puesto). Skeleton mientras cargan los catálogos.
  - [ ] **Documentos** (`FileText`; deshabilitada con `Lock` en alta) — checklist (ver abajo).
- [ ] Validaciones visibles: `FormMessage` por campo con los mensajes de Zod ("Nombre es requerido", etc.); badge destructive "Falta corregir algunos campos en <tabs>" sobre el botón.
- [ ] Botón submit: "Crear candidato" / "Guardar cambios" ("Guardando..." deshabilitado mientras envía).
  - [ ] Crear → `createPreEmployee`; toast "Candidato creado"; redirige a `?action=view&pre_employee_id=<nuevo>`.
  - [ ] Guardar → `updatePreEmployee`; toast "Cambios guardados"; `router.refresh()`.
  - [ ] Error → toast con el mensaje del server o "No se pudo guardar el candidato".
  - [ ] `onSubmit` corta si `!canEditData` (defensa ante submits de botones ajenos).

### Checklist de documentos — `components/PreEmployeeDocumentChecklist.tsx` (lista manual, no tabla)
- [ ] Solo lectura si no hay `update` o el estado no es editable (rechazado / legajo).
- [ ] Carga: skeleton (barra + 4 filas). Vacío: "No hay tipos de documento habilitados para candidatos. Se habilitan desde Documentación → Tipos de documentos, con la opción "Puede cargarse desde un candidato"."
- [ ] Progreso: "Documentación cargada — X de N" + `Progress`.
- [ ] Por tipo: icono check verde (cargado) / círculo (pendiente), nombre, badge "Obligatorio" si `mandatory`, subtítulo "Cargado el DD/MM/YYYY · Vence el DD/MM/YYYY" o "Pendiente de carga".
- [ ] Acciones por fila (todas `type="button"`):
  - [ ] "Ver" (`Download`) si hay archivo → URL firmada en pestaña nueva; error → toast "No se pudo abrir el documento".
  - [ ] "Subir" (`Upload`) / "Reemplazar" (`RefreshCw`) si no es solo lectura → abre dialog de subida.
  - [ ] Eliminar (`Trash2` rojo, solo icono) si hay archivo y no es solo lectura → **borra sin confirmación**; toast "Documento eliminado".
- [ ] Dialog de subida (`UploadDocumentDialog`, mismo archivo; `useState`, no RHF): título = nombre del tipo; descripción "Reemplazá el archivo cargado." / "Subí el documento del postulante."; campos Archivo* (`.pdf,.jpg,.jpeg,.png`) y Fecha de vencimiento (`<Input type="date">`, solo si el tipo vence). Botones "Cancelar" / "Subir documento" (deshabilitado sin archivo; "Subiendo..."). Éxito → toast "Documento cargado" e invalida la query; error → toast con `result.error`.

### Dialog "Rechazar candidato" — `components/RejectPreEmployeeDialog.tsx`
- [ ] Montado solo si el usuario tiene `approve`.
- [ ] Descripción: "El postulante queda registrado como rechazado. Para poder ingresarlo más adelante hay que reabrirlo."
- [ ] Campo: Motivo del rechazo* (Textarea, 4 filas) — mínimo 10 caracteres ("Explicá el motivo del rechazo (mínimo 10 caracteres)").
- [ ] Botones "Cancelar" / "Confirmar rechazo" (destructive; "Rechazando..."). Éxito → toast "Candidato rechazado", reset, cierra, `router.refresh()`.

### Sheet "Aprobar y crear legajo" — `components/ApprovePreEmployeeSheet.tsx`
- [ ] Montado solo con `approve` (el server también lo valida). Sheet lateral `sm:max-w-2xl` con scroll.
- [ ] Descripción: completar datos laborales; personales y contacto se toman del candidato; documentos se incorporan si corresponden a la función.
- [ ] Formulario = `EmployeeWorkDataForm` del legajo (schema `employeeWorkDataSchema`): Legajo*, Sector* (precargado con el propuesto), Puesto en la empresa* (precargado), Diagrama de trabajo*, Horas normales, Tipo de contrato, Fecha de ingreso (`type="date"`), Gremio, Convenio, Categoría, Centro de costo, Tipo de costo, Sectores de Taller (multi-select), Card "Asignado a contratistas" (checkboxes; vacío "No hay contratistas asignados"), Card "Aptitudes Técnicas" (checkboxes filtrados por puesto).
- [ ] Botones "Confirmar y crear legajo" ("Creando legajo...") / "Cancelar".
- [ ] Éxito → toast "Legajo creado" con descripción numérica: "X documentos se incorporaron al legajo." o "X de N documentos se incorporaron al legajo. Y no aplican a la función asignada y quedaron en el historial del candidato."; cierra y navega al legajo `/dashboard/employee/action?action=view&employee_id=<id>`.
- [ ] Error → toast con el mensaje o "No se pudo crear el legajo".

### Comportamientos no obvios
- [ ] Los datos solo se editan en En proceso / Pre ingreso; Rechazado y Legajo creado quedan de solo lectura (form y checklist).
- [ ] Al rechazar o aprobar (acciones `approve`) se guardan `reviewed_by` y `reviewed_at` → visibles en la columna Revisado y en el Alert de rechazo.
- [ ] El N° de candidato lo asigna la base al crear; nunca es editable.

<!-- estado: completo -->
