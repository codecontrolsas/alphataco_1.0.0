# Inventario ANTES — Paneles de campo (`/operator`, `/maintenance` público, `/clothing`)

> Ficha funcional del estado actual (rama `feat/rediseno-ui`, 2026-10-07). Cada `- [ ]` se tilda "después" del
> rediseño, probándolo en la app. Ninguno de estos paneles usa el shell del dashboard (sidebar/header): cada uno
> tiene su propio layout, su propio header y su propia sesión. Todos están pensados para celular.

---

# 1. Panel de Operario de Taller (`/operator/**`)

**Sesión / auth**: Better Auth con email + contraseña (`operatorLogin` en
`src/features/OperatorPanel/actions/session.server.ts`). Requisitos: el usuario tiene `profile.employee_id`, el
empleado existe y tiene al menos un sector de taller activo (`employee_workshop_sectors`). El sector activo vive en
la cookie `ACTIVE_SECTOR_COOKIE` (fallback: primer sector). El login **no** escribe la cookie de empresa activa
`actualComp` (a propósito). `getOperatorContext()` devuelve empleado + sectores + sector activo; si es `null`, todas
las páginas redirigen a `/operator/login`.

## Layout del panel — `src/app/operator/(panel)/layout.tsx`
- [ ] Guard: sin contexto de operario → `redirect('/operator/login')`.
- [ ] `metadata.title` = "Panel de Operario - Taller".
- [ ] `OperatorLayoutProvider` (contexto + React Query) envuelve todo; `min-h-dvh`, `main` con `max-w-4xl`, `p-4 md:p-6`.
- [ ] `src/app/operator/loading.tsx`: skeleton de header + lista de OT (3 tarjetas con borde izquierdo azul hardcodeado).

### Header — `src/features/OperatorPanel/components/OperatorHeader.tsx` (sticky, `z-50`, blur)
- [ ] Ícono llave + nombre del empleado.
- [ ] Badge "`N` OT" = OT no bloqueadas del sector (query `['operator-work-orders', sectorId]`); oculto si 0.
- [ ] Sector actual · taller (el taller se oculta en mobile `hidden sm:inline`).
- [ ] **Selector de sector** (solo si el empleado tiene >1 sector): Popover + Command con buscador "Buscar sector...",
      vacío "Sin sectores asignados.", ítems con check en el activo y nombre del taller debajo. Elegir otro →
      `setActiveOperatorSector` (valida que el sector sea del empleado) → `window.location.reload()` (recarga dura
      para que todas las queries usen el nuevo sector). Botón deshabilitado mientras cambia. Elegir el mismo solo cierra.
- [ ] Botón "Salir" (texto oculto en mobile, solo ícono) → `operatorLogout()` (borra solo la cookie de sector y la
      sesión) → redirect `/operator/login`. Deshabilitado mientras sale.

## Raíz — `/operator` (`src/app/operator/page.tsx`)
- [ ] Sin UI: con contexto → `/operator/dashboard`; sin contexto → `/operator/login`.

## Login — `/operator/login` (`src/app/operator/login/page.tsx` → `features/OperatorPanel/components/LoginForm.tsx`)
- [ ] Server: si ya hay sesión con `profile.employee_id` y un sector activo asignado → redirect `/operator/dashboard`.
- [ ] Layout: fondo `bg-muted`, card centrada `max-w-sm` (patrón de login de GH). Marca `BRAND_NAME` arriba.
- [ ] Card "Panel de Operario" / "Ingresa tus credenciales para acceder al taller"; banda "Acceso exclusivo para
      operarios de taller" (ícono casco); separador.
- [ ] Form (react-hook-form + zod, **sin** `<Form>` de shadcn: `register` + `<p>` de error):
  - [ ] Email (obligatorio, `email()` → "Email invalido"), `h-12 text-base`, autocomplete email.
  - [ ] Contraseña (obligatoria, "La contrasena es requerida").
- [ ] Error de servidor en caja destructiva con ícono. Mensajes posibles: credenciales inválidas, "No se pudo
      autenticar", "Tu usuario no tiene un empleado vinculado…", "No se encontro el empleado vinculado…", "Tu empleado
      no tiene sectores de taller asignados…", "Error inesperado. Intenta nuevamente."
- [ ] Botón "Iniciar Sesion" (spinner "Iniciando sesion..."), deshabilita inputs y botón mientras carga. Éxito →
      `router.push('/operator/dashboard')`.
- [ ] Pie: "Si no tienes acceso, contacta al jefe de taller o administrador".

## Lista de Órdenes de Trabajo — `/operator/dashboard`
Raíz: `src/app/operator/(panel)/dashboard/page.tsx` → `features/OperatorPanel/components/WorkOrderList.tsx`
(SSR `getWorkOrdersForOperator(sectorId)` como `initialData`).

**Lista manual de tarjetas (no es DataTable).**
- [ ] Título "Ordenes de Trabajo" + subtítulo "`N` activa(s) · `M` bloqueada(s)".
- [ ] Búsqueda libre client-side (placeholder "Buscar por OT, OM, dominio, N° de serie o interno..."): matchea número
      de OT, dominio/serie/interno del vehículo, serie/interno del equipamiento y número de OM.
- [ ] Filtros tipo "pills" con contador (scroll horizontal en mobile):
  - [ ] Todas (cuenta todas las activas), Activas (no bloqueadas y no completadas), Bloqueadas, Completadas.
  - [ ] "Completadas" dispara otra query paginada server-side (`getCompletedWorkOrdersForOperator`, 10 por página);
        el contador muestra 0 hasta que se abre. Al elegirla vuelve a página 0.
- [ ] Vista "Todas": primero activas, separador "Bloqueadas (N)" con candado, después bloqueadas.
- [ ] Paginación (solo Completadas, si >1 página): "Pagina X de Y (Z total)" + Anterior / Siguiente.
- [ ] Orden: el que devuelve el server (no hay orden configurable).
- [ ] Estados: skeleton propio (`WorkOrderListSkeleton`); vacío con ícono según filtro: "Sin ordenes completadas" /
      "Sin ordenes bloqueadas" / "Sin ordenes de trabajo"; si hay búsqueda: "No se encontraron resultados para tu
      busqueda".
- [ ] La búsqueda en Completadas filtra solo la página cargada (no es server-side).

### Tarjeta de OT — `components/WorkOrderCard.tsx`
- [ ] Borde izquierdo de color por prioridad (urgente rojo, alta ámbar, media azul, baja slate — hardcodeados).
- [ ] Recurso: dominio/serie grande + `#interno` + badge de tipo **solo si es equipamiento** (ticket 596) + subtipo.
- [ ] Línea mono "OT `nro sin prefijo` · OM `nro`".
- [ ] Badges: estado (Pendiente/En Progreso/Pausado/Completado/Parcial), prioridad, "Diagnostico" (si hay
      diagnóstico pendiente y no está bloqueada).
- [ ] Progreso "completadas/total" + barra.
- [ ] Fechas: "Creada: DD/MM/YYYY", "Programada: DD/MM/YYYY".
- [ ] Click → `/operator/work-order/[id]`. Bloqueada: no navega, overlay "Esperando `sector`" con candado,
      `cursor-not-allowed`. Completada: opacidad 60%, navegable, sin chevron.

## Detalle de OT — `/operator/work-order/[workOrderId]`
Raíz: `src/app/operator/(panel)/work-order/[workOrderId]/page.tsx` → `components/WorkOrderDetail.tsx`.
- [ ] Server: OT que no pertenece al sector activo (o inexistente) → redirect `/operator/dashboard`.
- [ ] Refetch automático cada 30 s (`refetchInterval: 30000`).
- [ ] Layout de pantalla completa: header fijo arriba, lista scrolleable, barra de acciones fija abajo.

### Header — `components/WorkOrderDetail/WorkOrderHeader.tsx`
- [ ] Botón volver (flecha) → `/operator/dashboard`.
- [ ] Número de OT + número de OM (mono).
- [ ] Botón de estado (texto largo en desktop, corto en mobile):
  - [ ] `pending` → "Iniciar OT" / "Iniciar" → `startWorkOrder` → toast "Orden de trabajo iniciada".
  - [ ] `in_progress` → "Pausar OT" / "Pausar" (outline) → `pauseWorkOrder` → toast "Orden de trabajo pausada".
  - [ ] `paused` → "Reanudar OT" / "Reanudar" → `resumeWorkOrder`; si otro sector tiene una OT en progreso de la
        misma OM, el botón queda deshabilitado con texto "Bloqueada" y `title` explicativo.
  - [ ] Errores: toast con el mensaje del server.
- [ ] Banner rojo (pausada + bloqueada por otro sector): "No se puede reanudar: el sector X tiene una OT en progreso…".
- [ ] Banner ámbar (pausada): "Orden de trabajo pausada. Reanude para poder completar tareas."
- [ ] Barra de identificación del recurso (scroll horizontal): badge tipo + Vehículo: Dominio, Serie, Tipo, Int., Km,
      Hs / Equipamiento: N° Serie, Tipo, Int., Hs. Km/Hs con separador de miles es-AR.
- [ ] Badges: estado, prioridad, fecha programada.
- [ ] Progreso "X/Y tareas" + barra.

### Lista de tareas — `components/WorkOrderDetail/TaskList.tsx`
- [ ] Banner azul (OT pendiente): "Inicie la Orden de Trabajo antes de completar tareas".
- [ ] Banner ámbar (hay DIAGNOSTICO sin completar): "Complete el DIAGNOSTICO antes de continuar con otras tareas".
- [ ] Tarjeta **DIAGNOSTICO** (`DiagnosticoCard.tsx`) primero: checkbox, badge "Obligatorio"/"Completado", textarea
      "Notas del diagnostico" siempre visible (guarda en `onBlur` si cambió). Deshabilitada si OT pendiente/pausada.
- [ ] Tareas regulares ordenadas por criticidad (urgent → low).
- [ ] Ítems informativos sin tipo de reparación (borde celeste): "Ítem informativo del pedido: no tiene un tipo de
      reparación asignado…", descripción y fotos. No se completan.
- [ ] Vacío: "No hay tareas asignadas a esta orden de trabajo".

### Tarjeta de tarea — `components/WorkOrderDetail/TaskCard.tsx`
- [ ] Checkbox completar/descompletar → `completeRepair` / `uncompleteRepair`. Antes de completar guarda las notas
      pendientes. Deshabilitado si: bloqueada por diagnóstico, OT pendiente/pausada, en reasignación, pendiente de
      aprobación, rechazada, o mutando.
- [ ] Borde izquierdo por estado (completada verde, rechazada roja, devolución naranja, pend. aprobación ámbar).
- [ ] Atenuado (opacity) según estado; bloqueada además `pointer-events-none`.
- [ ] Título (tachado si completada), badges: grupo de reparaciones (`RepairGroupBadge`), tipo de reparación (si
      difiere del título), criticidad, "Autorizable", "Operario" (agregada por el operario), "Rechazada",
      "Pend. Aprobacion", "Devolucion".
- [ ] Descripción.
- [ ] **Fotos del pedido** (`RepairItemPhotos`, miniaturas ampliables en lightbox) — quedan nítidas y clickeables aunque
      la tarea esté bloqueada (rótulo "Fotos del pedido").
- [ ] Caja "Motivo de rechazo" / "Motivo de devolucion".
- [ ] Notas técnicas colapsables (`TaskNotes.tsx`): "Agregar notas"/"Ver notas" (abierto si ya hay notas), textarea
      que guarda en `onBlur` → toast "Notas guardadas".
- [ ] Botón "Devolver tarea" (si no completada/rechazada/en reasignación/pend. aprobación/bloqueada por diag.).

### Barra inferior de acciones
- [ ] "Agregar Tarea" (outline) y "Cerrar OT" — ambos deshabilitados si la OT no está `in_progress`.

### Dialog "Agregar Tarea" — `components/AddTaskDialog.tsx` (`ResponsiveDialog`: drawer en mobile)
- [ ] Cabecera contextual: ícono auto/equipamiento, badge recurso, subtipo, "N.I xxx", "OM: xxx".
- [ ] Tabs "Mi Sector" / "Otro Sector" ("Otro Sector" deshabilitado con tooltip si no hay OM asociada).
- [ ] **Mi Sector**: Tipo de Reparación* (`RepairTypeCombobox`, buscador "Buscar tipo de reparacion...", solo tipos
      del sector), Descripción* (textarea). Validación manual (useState, no zod): "Seleccione un tipo de reparacion",
      "La descripcion es requerida". Aviso ámbar "Requiere aprobacion" si el tipo es autorizable; aviso verde "La tarea
      se agregara directamente…" si no. Botones Cancelar / "Agregar" → `addTaskToOwnWorkOrder` → toast "Tarea agregada"
      o "Solicitud enviada al jefe de taller".
  - [ ] Vacío si el sector no tiene tipos: "Sin tipos de reparacion disponibles…" + link "otro sector" que cambia de tab.
- [ ] **Otro Sector**: Tipo* (todos los tipos), Descripción*, caja azul "Derivacion a otro sector…", botón "Solicitar"
      → `requestTaskForOtherSector` → toast "Solicitud enviada al jefe de taller". Sin OM: alerta destructiva.

### Dialog "Devolver Tarea" — `components/ReturnTaskDialog.tsx` (`ResponsiveDialog`)
- [ ] Motivo de devolución* (mín. 10 caracteres, error inline y `throw` en la mutación).
- [ ] Aviso "Esta seguro? La tarea sera enviada al jefe de taller para reasignacion".
- [ ] "Devolver Tarea" ("Devolviendo...") → toast "Tarea devuelta. El jefe de taller la reasignara."

### Dialog "Cerrar Orden de Trabajo" — `components/CloseWorkOrderDialog.tsx` (`ResponsiveDialog`)
- [ ] Resumen en 3 cajas de color: Completadas / Pendientes / Devueltas.
- [ ] Advertencia si hay pendientes: "Esta OT se cerrara con N tarea(s) pendiente(s)".
- [ ] Notas de cierre (opcional).
- [ ] "Cerrar Orden de Trabajo" ("Cerrando...") → `closeWorkOrder` → toast éxito; si el server devuelve
      `orderAdvanceWarning`, **segundo toast warning sin auto-cierre** (`duration: Infinity`, con botón de cerrar);
      invalida queries de mantenimiento y vuelve a `/operator/dashboard`.

---

# 2. Mantenimiento público por QR (`/maintenance/**`)

**Sesión / auth**: dos caminos desde el login del QR (`useMaintenanceAnonymousLogin`):
- **Empleado**: sesión **anónima** de Better Auth (`authClient.signIn.anonymous()`), después
  `completeMaintenanceEmployeeAnonymousSession({ cuil, equipmentId })` valida el CUIL contra el legajo y escribe los
  claims de empresa/legajo server-side.
- **Invitado** (y **Mecánico**, que usa el mismo camino): email + contraseña (`maintenanceGuestLogin`), luego
  `setActiveCompanyForEquipment(equipmentId)`.
- La empresa activa **siempre sale del equipo de la ruta**, nunca de la sesión. Cada página resuelve el legajo con
  `getMaintenanceEmployeeForEquipment(equipmentId)` y se lo pasa por props al header.
- Al entrar al login con una sesión de dashboard (no anónima) abierta, se cierra automáticamente
  (`signOutMaintenanceSession`).

## Layout — `src/app/maintenance/layout.tsx`
- [ ] `TanstackQueryInicializador` + `MaintenanceLayoutProvider` con `employeeName/employeeCuil = null` (no lee cookies:
      rompería el prerender de Next 16).
- [ ] `src/app/maintenance/loading.tsx`: skeleton de la card de login (logo, combobox, botón).

### Header común — `features/Mantenimiento/shared/components/maintenance-header.tsx` (sticky `z-50`, blur)
- [ ] Botón volver opcional (`showBack`; usa `onBack` → `backHref` → `router.back()`).
- [ ] Marca `BRAND_NAME` + título de la pantalla (truncado).
- [ ] Segunda fila: nombre del empleado + "CUIL: xxx"; skeleton si se está resolviendo por el hook de cliente.
- [ ] Prioridad de datos: props > contexto del layout > hook de cliente (`useEmployeeDataMaintenance`).

## Login del QR — `/maintenance` (`?equipment=<id>`)
Raíz: `src/app/maintenance/page.tsx` → `features/Mantenimiento/AnonymousLogin/MaintenanceLoginCard.tsx` (en `Suspense`
con skeleton `h-64`). Fondo `bg-white` fijo (no respeta modo oscuro), card `max-w-md`, marca, "Sistema de Checklist y
Mantenimiento de Equipos". Wizard de 3 pasos en la misma card:
- [ ] **Paso 1 — Equipo** (`components/EquipmentSelectionStep.tsx`), se salta si llega `?equipment=` (lo imprime el QR):
  - [ ] Combobox "Equipo" (Popover + Command), buscador server-side "Buscar equipo (mínimo 2 caracteres)...";
        estados "Buscando...", "Ingrese al menos 2 caracteres para buscar", "No se encontraron equipos".
  - [ ] Zod: `equipment_id` obligatorio ("Debe seleccionar un equipo"). Botón "Continuar".
- [ ] **Paso 2 — Tipo de usuario** (`components/LoginTypeStep.tsx`): "Seleccione su tipo de usuario para continuar:" +
      botones Empleado / Invitado / Mecanico (gris hardcodeado). **Mecanico lleva al mismo formulario que Invitado.**
- [ ] **Paso 3 — Credenciales** (`components/CredentialsStep.tsx`, `<Form>` shadcn + zod con `superRefine` según tipo):
  - [ ] Empleado: "Cuil" (obligatorio "El CUIL es requerido.", validación de dígito `validarCUIL` → "El CUIL es inválido").
  - [ ] Invitado/Mecánico: Email (obligatorio + formato), Contraseña (obligatoria, mín. 6).
  - [ ] Botón "Acceder al Sistema" → `toast.promise` ("Iniciando sesión..." / "Sesión iniciada correctamente." / error
        del server) → `/maintenance/equipment/[id]`.
- [ ] Botón "Regresar" en pasos 2 y 3 (vuelve un paso; hover con color hardcodeado `#E6F7FF`).
- [ ] Nota: las páginas del QR redirigen acá con `?error=equipment_not_found` (y otras), pero **ninguna pantalla lee ni
      muestra ese parámetro** (se pierde en silencio).

## Gracias (salida) — `/maintenance/thanks` (`src/app/maintenance/thanks/page.tsx`, client)
- [ ] Card con marca, "Sistema de Mantenimiento", check verde (hardcodeado), "¡Sesión cerrada exitosamente!".
- [ ] Auto-redirect a `/maintenance` a los 5 s (useEffect + setTimeout) + botón "Volver al inicio".

## Dashboard del equipo — `/maintenance/equipment/[id]`
Raíz: `features/Mantenimiento/EquipmentDashboard/EquipmentDashboardServer.tsx` → `components/equipment-dashboard-client.tsx`.
- [ ] Guards: sin `userId` ni claim de legajo → `/maintenance`; equipo inexistente → `/maintenance?error=equipment_not_found`.
- [ ] Rol resuelto contra la empresa del equipo (`getSessionRoleForEquipment`); `isGuest = rol === 'Invitado'`.
- [ ] Header "Acciones" con empleado/CUIL.
- [ ] Card del equipo: foto (o ícono camión), dominio o serie ("Sin identificador"), marca modelo • año, badge de
      condición (Operativo / No Operativo / En Reparación / Operativo Condicionado / En Preparación), grilla Tipo,
      Subtipo, N° Interno, Kilometraje, Horómetro (si hay); badge "Equipo dado de baja" si inactivo.
- [ ] **Alerta de desvíos pendientes** (`shared/components/pending-deviations-alert.tsx`, React Query, no se muestra si
      no hay): "Desvíos de Checklist Pendientes", cantidad, checklist, generado por, fecha (formato `toLocaleDateString`,
      no moment) + botón "Resolver Desvíos" → abre **Registrar Desvíos** (ver abajo); al cerrar re-consulta.
- [ ] "Seleccione una opción" — botones grandes (`ActionButton`):
  - [ ] "Solicitar Mantenimiento" (primario) → `/request` — **oculto para Invitado**.
  - [ ] "Completar Checklist" → `/checklists`.
  - [ ] "Operación de Gomería" → `/tire-service` — solo si el equipo tiene `tire_template_id` **y** la sesión no es anónima.
- [ ] "Salir del Sistema" → `signOutMaintenanceSession` → `/maintenance/thanks`.

## Lista de checklists — `/maintenance/equipment/[id]/checklists`
Raíz: `features/Mantenimiento/Checklists/ChecklistsListServer.tsx` → `components/checklists-list-client.tsx`.
- [ ] Guards: sin sesión → `/maintenance`; equipo inexistente → `?error=equipment_not_found`; error de consulta →
      `/maintenance/equipment/[id]?error=checklists_unavailable` (tampoco se muestra).
- [ ] Header "Checklists" con volver al dashboard del equipo.
- [ ] "Tipos de checklist" / "Seleccione el checklist de mantenimiento a completar".
- [ ] Lista manual de cards: título (description o nombre), badge frecuencia (si hay), fecha de creación DD/MM/YYYY,
      nombre. Click → `/checklists/[checklistId]`.
- [ ] Vacío (`EmptyState`): "No hay checklists disponibles" / "No hay checklists configurados para este tipo de equipo".

## Completar checklist — `/maintenance/equipment/[id]/checklists/[checklistId]`
Raíz: `features/Mantenimiento/Checklists/ChecklistFormServer.tsx` → `features/Checklists/components/NormalizedChecklistForm.tsx`
(**el mismo formulario que usa `/dashboard/forms/[id]/new`**; las redirecciones post-guardado distinguen por la URL).
- [ ] Guards: sin sesión → `/maintenance`; equipo inexistente → `?error=equipment_not_found`; plantilla de otra empresa o
      inexistente → `/checklists?error=template_not_found`.
- [ ] Header con el nombre de la plantilla y volver a la lista.
- [ ] Datos precargados: equipo de la ruta (selector deshabilitado), empleado del claim, km y horómetro actuales.
- [ ] **Información general** (`sections/ChecklistGeneralInfoSection.tsx`): Equipo, Enganche (solo tractores con
      `has_hitch`; botón que abre `HitchEquipmentDialog` con equipos compatibles; toasts "Debes seleccionar un equipo
      primero" / "No se encontraron equipos compatibles para enganche"), Cliente (opcional, clientes activos de la
      empresa del equipo), Chofer (combobox "Buscar por nombre o documento..." o texto libre), Kilometraje / Horómetro
      (con mínimo = valor actual), Fecha (`input date` nativo), Hora (`input time`), Observaciones.
- [ ] Validaciones extra en submit: km < actual → error inline + toast "Error de validación"; horómetro < actual → idem.
- [ ] Link tenue "Ver diagrama de partes" (si la plantilla lo tiene) → `ChecklistPartsDiagramDialog`.
- [ ] Secciones en `Accordion type="multiple"` (cada una en Card, con botón "Cerrar" al pie). Las secciones del
      enganche solo aparecen si se declaró la unidad (aviso de secciones ocultas).
- [ ] Ítems (`sections/ChecklistItemField.tsx`): tipos `select` con opciones, `select` por lado (izq./der.), `date`,
      radio; observación por ítem opcional ("Observación" / "Describí qué encontraste" si falló). Targets táctiles
      `pointer-coarse:min-h-11`.
- [ ] Submit inválido: toast "Falta(n) responder N item(s)" + abre la sección del primero, scroll y foco.
- [ ] Botones "Limpiar" (`form.reset()`) y "Guardar Checklist" ("Guardando...").
- [ ] Guardado: crea `checklist_answer`; si hay enganche crea un segundo answer para el acoplado con los desvíos de su
      sección (ticket 677); si falla el del enganche: toast "Error al guardar el checklist para el equipo enganchado"
      (no aborta).
- [ ] Post-guardado **con ítems fallidos** → modal **Registrar Desvíos** (abajo) con los desvíos de ese checklist (y del
      enganche, rotulados por unidad). Al cerrar/completar → `/maintenance/equipment/[equipo]/checklists`.
- [ ] Post-guardado **sin fallos** → toast "Checklist guardado correctamente" + AlertDialog
      `AllGoodDeviationPromptDialog` "¿Querés registrar un desvío de mantenimiento igualmente?" (No, continuar / Sí,
      registrar desvío) → **Registrar desvío adicional** (`AdditionalDeviationModal`).
- [ ] `DevAutoFillButton` (autocompletado) solo en desarrollo.

### Modal "Registrar Desvíos" — `features/Mantenimiento/shared/components/critical-deviations-repair-modal.tsx` (Dialog `max-w-4xl`)
- [ ] Descripción con cantidad de ítems. Alertas: desvíos de >1 unidad ("se generará una solicitud por cada una") o de
      >1 checklist.
- [ ] "Supervisor de Turno *" (Popover + Command "Buscar supervisor...", supervisores no disponibles deshabilitados).
- [ ] Lista de desvíos con "Dejar comentario" → textarea opcional "Describe el problema encontrado...".
- [ ] `ManualItemsInput`: "Otros ítems (no listados en el checklist)", textarea + agregar/quitar.
- [ ] Cancelar / "Registrar Desvíos" (deshabilitado sin supervisor). Toasts: "Debes seleccionar un supervisor de turno",
      error del server, info "Los desvíos ya tenían solicitud de mantenimiento", éxito con detalle.

### Modal "Registrar desvío adicional" — `shared/components/AdditionalDeviationModal.tsx` (Dialog `max-w-2xl`)
- [ ] Supervisor (Popover + Command), `ChecklistItemPicker` (ítems de las secciones visibles), `ManualItemsInput`.
- [ ] Validaciones: supervisor obligatorio, al menos un ítem. Éxito: toast "Solicitud de mantenimiento creada".

## Nuevo pedido de mantenimiento — `/maintenance/equipment/[id]/request`
Raíz: `features/Mantenimiento/NuevoPedido/MaintenanceRequestServer.tsx` → `components/NuevoPedidoChecklistForm.tsx`
(mismo wizard que el dashboard de Mantenimiento, con `default_equipment_id`, `skipSupervisorQuestion` y
`successRedirectUrl` = dashboard del equipo).
- [ ] Guards: sin `userId` → `/maintenance`; equipo sin empresa → `?error=equipment_not_found`.
- [ ] Header con empleado/CUIL y volver al dashboard del equipo (sin título).
- [ ] Layout: stepper lateral "Nuevo Pedido" / "Crea un pedido desde items de checklist" (col 1) + card del paso (col 2);
      en mobile el stepper queda **arriba** (grid de 1 columna).
- [ ] Pasos (el paso "Recurso" se omite porque el equipo viene fijado):
  - [ ] **Equipo** (`StepEquipmentSelector`): selector deshabilitado, "Kilometraje actual" (min = último, "Último
        registrado: X km") u "Horómetro" según recurso, card con identificación/tipo/condición.
  - [ ] **Tipo** (`StepRequestType`): tarjetas "Checklist" (desde desvíos; deshabilitada para equipamientos),
        "Mant. Preventivo" (no se ofrece para equipamientos) y "Carga Manual - Mant. Correctivo". Checklist → "Selecciona
        el checklist base"; Preventivo → "Selecciona el programa" + "Descripción (opcional)".
  - [ ] **Items** (checklist, `StepChecklistItems`): "Selecciona los items con desvío" (checkbox por ítem, comentario
        opcional, opción de marcar desvío que no genera trabajo en taller) + `ManualItemsInput`.
  - [ ] **Reparaciones** (manual, `ManualRepairsInput` en modo `freeTextOnly`): texto libre + descripción + **fotos**
        (opcional, `input file accept="image/*" multiple`, máx. `MAX_IMAGES_PER_REPAIR` por reparación, hasta 10 MB cada
        una, contador "X de N", sin `capture`). Borrador sin agregar: al avanzar se agrega solo ("Se agregó la
        reparación que habías escrito") o avisa qué falta.
  - [ ] **Supervisor** (`StepSupervisor`, sin la pregunta "¿Eres el supervisor?"): "Seleccionar Supervisor" +
        combobox "Buscar supervisor...", no disponibles deshabilitados.
  - [ ] **Confirmar** (`StepConfirm`): resumen Equipo/Equipamiento, km, chofer, tipo, reparaciones o ítems con desvío,
        supervisor.
- [ ] Navegación "Anterior" / "Siguiente" (deshabilitado según `canAdvanceStep`) / último paso "Enviar Solicitud" (azul
      hardcodeado; "Crear Pedido" verde solo si es supervisor, lo que acá no ocurre).
- [ ] Validaciones en envío (toasts): "Faltan datos requeridos", "Debes seleccionar al menos un desvío o agregar un ítem
      manual", "Debes seleccionar un programa…", "Debes agregar al menos una reparación", "El kilometraje no puede ser
      menor al actual (X km)", "Debes seleccionar un supervisor".
- [ ] Envío: sube fotos primero (`uploadRepairImages`); éxito → toast ("Solicitud creada con N…" / "Solicitud enviada.
      El supervisor debe aprobarla…") y `router.push` al dashboard del equipo. Errores diferenciados: imagen, conexión
      ("Se perdió la conexión al crear el pedido"), genérico.

## Operación de Gomería — `/maintenance/equipment/[id]/tire-service`
Raíz: `features/Mantenimiento/Gomeria/Ordenes/TireServiceQrServer.tsx` → `components/TireServiceQrClient.tsx` →
`components/ServiceOrderWizard.tsx` con `mode="qr"` (el mismo asistente que abre el dashboard de Gomería en un Dialog).
- [ ] Guards: sin `userId` → `/maintenance`; equipo inexistente → `?error=equipment_not_found`; equipo sin plantilla de
      cubiertas → vuelve al dashboard del equipo. (El botón del dashboard ya se oculta para sesiones anónimas.)
- [ ] Header "Operación de Gomería" con volver al dashboard del equipo (sin empleado/CUIL por props: lo resuelve el hook
      de cliente).
- [ ] **Paso Setup** ("Nueva Orden de Gomería" / "Busque un vehículo e ingrese los datos de la orden."):
  - [ ] En QR se salta la búsqueda: caja "Vehículo: (vehículo escaneado)".
  - [ ] "Kilómetros actuales" (texto con `inputMode="numeric"`, opcional, placeholder "ej. 125000").
  - [ ] Solo tractores con enganche: switch "Agregar Enganche" + buscador "Buscar enganche por dominio" (compatibles,
        "No se encontraron vehículos"). El enganche elegido debe tener plantilla de cubiertas.
  - [ ] Cancelar (vuelve al dashboard del equipo) / "Iniciar Operación" ("Iniciando...") → `createServiceOrder`; error →
        toast con el mensaje.
- [ ] **Paso Operación** ("Orden — `dominio`" / "Toque una posición para registrar una intervención."):
  - [ ] Badge "Orden abierta" + contador de intervenciones de la sesión.
  - [ ] Diagrama de cubiertas del vehículo (`TireDiagram`) y, separado por "Enganche", el del acoplado. Vacío: "No hay
        posiciones de cubiertas configuradas para este vehículo."
  - [ ] Tocar una posición abre un **Sheet lateral derecho** (`TirePositionCard`, `modal={false}`, ancho completo en
        mobile) "Posición N":
    - [ ] Posición vacía: "Posición vacía — primera asignación" + selector de cubierta + "Asignar cubierta"
          ("Asignando...") → toast "Cubierta asignada a la posición".
    - [ ] Con cubierta: ficha de la cubierta + tabs **Calibrar** (Desgaste %, Presión inicio/fin PSI, Observaciones),
          **Reparar** (cubierta de reemplazo obligatoria + Observaciones), **Reemplazar** (cubierta nueva; destino de la
          actual: Disponible / Descarte / Reparación; para Descarte/Reparación: **foto** `input file accept="image/*"` y
          Motivo obligatorio; desgaste nuevo %, presiones, observaciones), **Extraviada** (en rojo: "Reportar cubierta
          extraviada", observación obligatoria). Toasts de error por acción.
    - [ ] Selector de cubierta (`TireReplacePicker`): buscador "Buscar por serie, marca o medida...", lista de stock,
          vacío "No hay cubiertas disponibles en stock" + **Dialog "Crear cubierta rápida"** (Número de serie, Marca,
          Tipo de cubierta, Nueva/Usada, Precurado) → toast "Cubierta X creada".
  - [ ] "Finalizar Orden" (variant `brand`, "Finalizando...") → en QR `closeServiceOrderForVehicle` (valida contra el
        equipo escaneado) → toast "Orden finalizada correctamente" → vuelve al dashboard del equipo.
- [ ] **Riesgo detectado (no verificado en navegador)**: en modo QR el asistente renderiza `DialogHeader`/`DialogTitle`/
      `DialogFooter` sin un `<Dialog>` alrededor. `DialogTitle` de Radix exige el contexto del Dialog
      (`createDialogContext` sin default) y lanzaría "`DialogTitle` must be used within `Dialog`". Probar esta pantalla
      antes del rediseño para saber si hoy funciona.

---

# 3. Entrega de Indumentaria (`/clothing/**`)

**Sesión / auth**: email + contraseña (`clothingLogin` en `src/features/Clothing/actions/session.server.ts`). Solo exige
que el usuario tenga un empleado vinculado (no pide sector). Escribe el **claim de empresa** del legajo en la sesión y la
cookie de empresa activa con duración de **1 año** (puesto fijo). `getClothingOperatorContext()` = `getClothingOperator()`
(`perimeter.ts`); `null` → login. Logout: signOut + borra cookie de empresa + `revalidatePath('/')` → `/clothing/login`.

## Layout del panel — `src/app/clothing/(panel)/layout.tsx`
- [ ] `metadata.title` = "Entrega de Indumentaria". Envuelto en `Suspense` con skeleton propio (header + grilla 1/3–2/3).
- [ ] Guard: sin contexto → `/clothing/login`.
- [ ] `ClothingLayoutProvider` (`src/app/clothing/clothing-layout-provider.tsx`): **QueryClient propio** con
      `staleTime: 0`, `gcTime: 0`, sin refetch al foco, `retry: 1` + contexto del operario.
- [ ] `main` con `max-w-7xl`, `p-4 md:p-6`.
- [ ] Header (`src/app/clothing/(panel)/ClothingPanelHeader.tsx`, sticky `z-50`): ícono remera, nombre del empleado,
      "Entrega de Indumentaria", botón "Salir" (solo ícono en mobile).

## Raíz — `/clothing`
- [ ] Sin UI (skeleton mientras resuelve): con contexto → `/clothing/delivery`; sin → `/clothing/login`.

## Login — `/clothing/login` (`ClothingDelivery/components/ClothingLoginForm.tsx`)
- [ ] Con contexto → `/clothing/delivery`. Suspense con skeleton de card.
- [ ] Mismo diseño que el login del operario: marca, card "Entrega de Indumentaria" / "Ingresa tus credenciales para
      registrar una entrega", banda "Acceso para registro de entregas de EPP".
- [ ] Email (obligatorio + formato) y Contraseña (obligatoria) — `register` + `<p>` de error (sin `<Form>` shadcn).
- [ ] Errores de servidor en caja destructiva (credenciales, sin empleado vinculado, empleado no encontrado, inesperado).
- [ ] "Iniciar Sesion" → `/clothing/delivery`. Pie: "Si no tienes acceso, contacta al responsable de indumentaria o
      administrador".

## Entregas — `/clothing/delivery` (`?employee_id=<uuid>` y params de la tabla con prefijo `all-deliveries`)
Raíz: `src/app/clothing/(panel)/delivery/page.tsx` → `features/Clothing/ClothingDelivery/components/DeliveryPageClient.tsx`.
Vista interna en estado de cliente (`menu` | `list` | `new`), **no en la URL**:
- [ ] Con `?employee_id` arranca directo en "new" con el empleado precargado (salta al paso 2).
- [ ] **Menú**: "Indumentaria" / "Seleccione una opción para continuar." + botones grandes "Nueva Entrega" (primario) y
      "Ver Entregas".
- [ ] "Volver al menú" (ghost) en las vistas list y new.
- [ ] La tabla (`listSlot`) se renderiza en SSR siempre, aunque esté en el menú (se consulta igual).

### Asistente "Registrar Entrega" — `ClothingDelivery/components/DeliveryWizard.tsx`
- [ ] Título "Registrar Entrega" / "Complete los pasos para registrar una entrega de indumentaria o EPP."
- [ ] Desktop: card "Progreso" con stepper lateral (5 pasos con descripción; completados en verde hardcodeado). Mobile:
      "Paso X de 5" + barritas de progreso.
- [ ] Validación por paso (mensaje en caja roja bajo el contenido, sin toast); navegación "Anterior" / "Siguiente"; en el
      último paso solo "Volver".
- [ ] **1. Empleado** (`StepSelectEmployee.tsx`): "Buscar empleado", buscador con debounce "Buscar por legajo o
      nombre..." (React Query, "Buscando..."), resultados `[legajo] Apellido Nombre` + puesto + datos; seleccionado
      muestra "Legajo #N" y botón para quitar. Requerido: "Debe seleccionar un empleado para continuar."
- [ ] **2. Tipo** (`StepDeliveryType.tsx`): Select "Tipo de entrega" (`PLANNED_CCT` / `PLANNED_EPP` / `REPLACEMENT`, con
      labels de `clothingDeliveryTypeLabels`) + badge de vista previa. Requerido.
- [ ] **3. Artículos** (`StepAddItems.tsx`): "Artículos a entregar", filas con Artículo (select), Cantidad (min 1),
      Marca (habilitada al elegir artículo), Talle (habilitado al elegir marca), checkbox de certificado, botón quitar
      (papelera); "agregar artículo" (borde punteado). Requerido: al menos un artículo elegido.
- [ ] **4. Firma** (`StepSignature.tsx` + `SignaturePad.tsx`): canvas táctil (`signature_pad`, `touch-action: none`,
      redimensiona con devicePixelRatio), placeholder "Firme aqui con su dedo o lapiz", "Cargando panel de firma...",
      botones "Limpiar" y "Confirmar Firma" (deshabilitado si vacío). Al confirmar sube el PNG al storage
      (`uploadSignatureImage`, "Guardando firma...") → caja verde "Firma registrada"; error de subida en Alert. Requerido.
- [ ] **5. Confirmar** (`StepConfirm.tsx`): "Resumen de la entrega" (Empleado, Tipo de entrega, artículos con marca/
      talle/cantidad, imagen de la firma), Observaciones (opcional), "Fecha de entrega: DD/MM/YYYY HH:mm" (hora actual),
      botón "Confirmar Entrega" ("Registrando...") → `createClothingDelivery` → toast "Entrega registrada correctamente",
      reinicia el asistente y pasa a la vista lista. Error: toast "No se pudo registrar la entrega. Intente nuevamente."
- [ ] Sin borrador persistente: salir del asistente pierde lo cargado (la firma ya subida queda en storage).

### Tabla "Todas las entregas" — `features/Clothing/AllDeliveries/AllDeliveriesList/`
Server `AllDeliveriesList.tsx` (`TABLE_ID = 'all-deliveries'`, `stripPrefixFromSearchParams`, preferencias, Card) →
client `components/_AllDeliveriesDataTable.tsx`. **Doble render según `useIsMobile()`**:

**Desktop — DataTable nuevo** (columnas en `columns.tsx`, client-side mode `queryKey ['all-deliveries']`,
`paramNamespace`):
- [ ] Columnas: select · Fecha de entrega · Legajo (destinatario) · Destinatario · Tipo de entrega · Legajo (entregó) ·
      Entregado por · Artículos (no ordenable) · Firma · Notas · acciones.
- [ ] Filtros (lazy `fetchFacet`): Fecha de entrega (dateRange), Legajo destinatario (text), Destinatario (faceted FK),
      Tipo de entrega (faceted enum), Legajo entregó (text), Entregado por (faceted FK), Firma (faceted sí/no), Notas
      (text). Visibles por defecto: fecha, destinatario, tipo. Toggle de filtros.
- [ ] Búsqueda: "Buscar por nombre del empleado o notas...". Vacío: "No hay entregas registradas".
- [ ] Orden por defecto: `delivered_at desc` (más el desempate fijo en el server).
- [ ] Exportación Excel `todas-entregas-indumentaria`, hoja "Entregas", título "Todas las Entregas de Indumentaria";
      formatters de fecha, tipo, firma Sí/No y legajos.
- [ ] Selección de filas cross-page → **barra flotante inferior** (`pdf/BulkDownloadBar.tsx`, `fixed bottom-6`, animada
      con motion): "Descargar ZIP" de constancias PDF con progreso (generando / "Comprimiendo ZIP…") → toast "ZIP
      descargado con N constancias"; botón "Limpiar selección".
- [ ] Acción por fila: `DeliveryReceiptButton` (compacto) → **Dialog "Constancia de Entrega EPP"** con `PDFViewer`
      (react-pdf, `pdf/DeliveryReceiptLayout.tsx`) + "Descargar PDF" (`Constancia_EPP_<empleado>_<fecha>.pdf`, toast
      "PDF descargado exitosamente"). Sin condición de permiso.

**Mobile — lista manual de tarjetas** (`MobileDeliveryList` + `components/DeliveryCard.tsx`):
- [ ] Buscador "Buscar por nombre del empleado...", query propia `['all-deliveries-mobile', página, búsqueda]`,
      paginación simple Anterior/Siguiente (`MOBILE_PAGE_SIZE`).
- [ ] Tarjeta: destinatario + "Legajo #N", botón de constancia PDF, badges tipo y firma, artículos como badges (+N).
- [ ] En mobile **no hay** filtros por columna, exportación ni selección/ZIP.

## Gracias — `/clothing/thanks` (`src/app/clothing/thanks/page.tsx`, client)
- [ ] Card con marca, "Sistema de Indumentaria", check verde, "¡Entrega registrada!"; auto-redirect a
      `/clothing/delivery` a los 5 s + botón "Nueva entrega".
- [ ] **Ninguna pantalla navega hoy a esta ruta** (el asistente vuelve a la lista): página huérfana.

---

## Hallazgos y comportamientos no obvios (para §9 del PLAN; no se arreglan en el rediseño sin preguntar)

1. **Gomería por QR posiblemente rota**: `ServiceOrderWizard` en `mode="qr"` usa `DialogTitle` sin `<Dialog>` (ver arriba).
2. **`?error=...` nunca se muestra**: `equipment_not_found`, `checklists_unavailable`, `template_not_found` se agregan a
   la URL al redirigir pero ninguna pantalla los lee.
3. **Botón "Mecanico"** del login del QR hace exactamente lo mismo que "Invitado".
4. **Hooks después de un return condicional** en `WorkOrderDetail.tsx` (`useMutation` tras `if (!data) return null`; en la
   práctica `data` siempre existe por `initialData`). En entregas, cruzar el breakpoint mobile/desktop desmonta la tabla y
   pierde la selección.
5. `AddTaskDialog` acepta `sectorName` pero `WorkOrderDetail` nunca se lo pasa: el "(sector)" del tab "Mi Sector" no
   aparece nunca.
6. `/clothing/thanks` huérfana; `/maintenance/thanks` solo se usa desde "Salir del Sistema".
7. Login del QR con fondo `bg-white` fijo y textos `text-gray-*` / `#E6F7FF`: no respeta modo oscuro.
8. Logins de `/operator` y `/clothing` usan `register` + `<p>` en lugar del `<Form>` de shadcn; "Agregar Tarea" valida con
   `useState` (no zod).
9. El listado de entregas se consulta en SSR aunque el usuario quede en el menú.
10. Ningún `input file` usa `capture` (en celular abre el selector, que igual ofrece cámara). Firma solo en `/clothing`.
    No hay borradores persistentes en ninguno de los tres paneles.

## Conteo
- Rutas: `/operator` 4 (`page`, `login`, `dashboard`, `work-order/[id]`) · `/maintenance` público 7 (`page`, `thanks`,
  `equipment/[id]`, `checklists`, `checklists/[checklistId]`, `request`, `tire-service`) · `/clothing` 4 (`page`, `login`,
  `delivery`, `thanks`) = **15 páginas**, 3 layouts.
- Tablas: 1 DataTable nuevo (entregas, con vista mobile manual) + listas manuales (OT del operario, checklists del QR).
  Ninguna BaseDataTable.
- Asistentes: 4 (login QR 3 pasos, nuevo pedido 5-6 pasos, gomería 2 pasos, entrega de indumentaria 5 pasos).
- Dialogs/Sheets: AddTask, ReturnTask, CloseWorkOrder (ResponsiveDialog) · Registrar Desvíos, Desvío adicional,
  AllGood (AlertDialog), Enganche, Diagrama de partes · Sheet de posición de cubierta, Crear cubierta rápida ·
  Constancia EPP (PDF).
- PDFs: constancia de entrega EPP (individual con visor + ZIP masivo).

<!-- estado: completo -->
