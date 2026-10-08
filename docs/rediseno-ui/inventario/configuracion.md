# Inventario — Configuración

Ficha "ANTES" del módulo Configuración (`/dashboard/configuration`, raíz `src/features/Empresa/EmpresaComponent.tsx`) y de las páginas sueltas `/dashboard/configuration/*`. Cada `- [ ]` se tilda al verificar que sigue funcionando después del rediseño. Tabs: `general` · `rrhh` · `vehicles` · `mantenimiento` (`&subtab=`talleres|sectores_taller|type_of_repair|maintenance_groups) · `documentos`.

## Configuración › General (contenedor) — /dashboard/configuration?tab=general&subtab=…

- [ ] Componente raíz: `src/features/Empresa/General/GeneralTabContent.tsx` (Server; `TabsManagerServer` paramName `subtab`, default `company`).
- [ ] Tab padre `configuracion:general` (allowedActions view, update). Cada subtab se muestra según permiso `view` de su `tabSlug`:
  - [ ] `company` (Empresa, ícono Building2)
  - [ ] `cost-center` (Centro de Costos, DollarSign)
  - [ ] `organigrama` (Organigrama, Network)
  - [ ] `users` (Usuarios, Users) → sub-subtabs por `usertab`
  - [ ] `kpis` (KPIs, ChartColumn) → sub-subtabs por `kpiview`
  - [ ] `datos-fiscales` (Datos fiscales, Landmark)
  - [ ] `documentacion` (Documentación, FileText)
- [ ] Cards de subtab con header `bg-surface dark:bg-muted/50 border-b-2` + `CardTitle`/`CardDescription` (Empresa, Centro de Costos, Organigrama, Datos fiscales). Usuarios, KPIs y Documentación no tienen ese header.

## Configuración › General › Empresa — ?tab=general&subtab=company

- [ ] Componente: `General/components/company/CompanyComponent.tsx` (Server, `getActiveCompany()`), dentro de Card "Empresa / Información de la empresa".
- [ ] Botón **Editar Empresa** (Link `buttonVariants({variant:'brand'})` → `/dashboard/configuration/companies/{company_id}`), `PermissionGuardServer configuracion:general:update` (ojo: tab `general`, no `company`).
- [ ] Grilla 1 col / 2 col (md) de 8 `InfoItem` (ícono + label + valor, `-` si vacío): Razón Social, CUIT, Dirección, País, Ciudad (`cities.name`), Industria, Teléfono de contacto, Email de contacto.
- [ ] Carga: `CompanySkeleton` (Suspense).
- [ ] Solo lectura: no hay formularios en esta subtab (la edición está en la página de companies/[id], ficha en la otra parte del inventario).

## Configuración › General › Centro de Costos — ?tab=general&subtab=cost-center

- [ ] Componente: `General/CostCenter/CostCenterList.tsx` (Server) → `_CostCenterDataTable.tsx` (Client). Card "Centro de Costos / Gestión de centros de costos". Skeleton `CostCenterTableSkeleton`.
- [ ] **Layout**: si `configuracion:cost-center:create` **o** `:update` → `ResizablePanelGroup` horizontal (min-h 400px): form 30% izq. + handle + tabla 70% der. Sin permiso → solo tabla.

### Tabla Centros de costo
- [ ] Columnas: `General/CostCenter/columns.tsx` — DataTable nuevo (client-side mode, `queryKey ['cost-centers']`, `tableId`/`paramNamespace` `cost-centers`).
- [ ] Columnas (meta.title): Nombre · Estado (Badge success "Activo" / secondary "Inactivo" / default "Sin asignar") · Fecha de creación (DD/MM/YYYY, **oculta por defecto**) · acciones (sin título).
- [ ] Filtros: Estado (faceted lazy: Activo/Inactivo/Sin asignar si hay null) · Nombre (text) · Fecha de creación (dateRange). Los 3 visibles por defecto.
- [ ] Búsqueda: "Buscar centros de costo..." (campo `name`). `showFilterToggle`.
- [ ] Orden por defecto (server): `is_active desc` (inactivos al final) → orden del usuario → `name asc`.
- [ ] Exportación: Excel `centros-de-costo` / hoja "Centros de Costo" / título "Centros de Costo"; formatters Estado y Fecha.
- [ ] Selección múltiple / acciones masivas: no.
- [ ] Acción por fila: **Editar** (Button link) solo si `configuracion:cost-center:update`; carga el registro en el form vía store Zustand `useCostCenterStore`. Sin `update` la columna de acciones no existe.
- [ ] Vacío: "No se encontraron centros de costo".

### Form Crear/Editar Centro de Costo
- [ ] Archivo: `General/components/cost-center/CostCenterForm.tsx` (RHF + zod, panel lateral, no dialog).
- [ ] Título: "Crear Centro de Costo" / "Editar Centro de Costo".
- [ ] Campos: **Nombre del Centro de Costo*** (Input, "Debe ingresar el nombre del centro de costo") · Estado (RadioGroup Activo/Inactivo, default Activo).
- [ ] Botón **Crear** / **Actualizar** (brand; "Creando..."/"Actualizando..."); **Cancelar** solo en edición (limpia store y form).
- [ ] Envío: `createCostCenterPrisma` / `updateCostCenterPrisma` con `toast.promise` ("Creando centro de costo..." → "Centro de costo creado correctamente" / "Error al crear el centro de costo"; idem actualizar). Al éxito invalida `['cost-centers']` y resetea el form.
- [ ] El form se sincroniza con el store vía `useEffect` (al tocar Editar en la tabla).

## Configuración › General › Organigrama — ?tab=general&subtab=organigrama

- [ ] Componente: `General/Hierarchy/HierarchyList.tsx` → `_HierarchyDataTable.tsx`. Card "Organigrama / Estructura organizacional". Skeleton `HierarchyTableSkeleton`.
- [ ] Mismo layout que Centro de Costos: form 30% + tabla 70% si `configuracion:organigrama:create` o `:update`; si no, solo tabla.

### Tabla Sectores (organigrama)
- [ ] Columnas: `General/Hierarchy/columns.tsx` — DataTable nuevo (`queryKey ['hierarchy']`, `tableId`/`paramNamespace` `hierarchy`). Es copia 1:1 del de centros de costo.
- [ ] Columnas: Nombre · Estado (Activo/Inactivo/Sin asignar) · Fecha de creación (oculta por defecto) · acciones.
- [ ] Filtros: Estado (faceted lazy) · Nombre (text) · Fecha de creación (dateRange); los 3 visibles.
- [ ] Búsqueda: "Buscar sectores..." (name).
- [ ] Orden por defecto: `is_active desc` → usuario → `name asc`.
- [ ] Exportación: `organigrama-sectores` / hoja "Organigrama" / título "Organigrama — Sectores".
- [ ] Sin selección múltiple.
- [ ] Acción por fila: **Editar** si `configuracion:organigrama:update` (store `useHierarchyStore`).
- [ ] Vacío: "No se encontraron sectores".

### Form Crear/Editar Sector
- [ ] Archivo: `General/Hierarchy/HierarchyForm.tsx`. Título "Crear Sector" / "Editar Sector".
- [ ] Campos: **Nombre del Sector*** ("Debe ingresar el nombre del sector") · Estado (Radio Activo/Inactivo).
- [ ] Botones Crear/Actualizar + Cancelar (solo edición).
- [ ] Toasts: "Creando sector..." → "Sector creado correctamente" / "Error al crear el sector"; "Actualizando sector..." → "Sector actualizado correctamente". Invalida `['hierarchy']`.

## Configuración › General › Usuarios (contenedor) — ?tab=general&subtab=users&usertab=…

- [ ] Componente: `src/features/Empresa/Usuarios/UsersTabComponent.tsx` (`TabsManagerServer` paramName `usertab`, default `usuarios-empleados`). Fallback `TableSubtabSkeleton`.
- [ ] Sub-subtabs (permiso view de cada slug): `usuarios-empleados` (Usuarios, Users) · `gestion-roles` (Gestión de Roles, Shield) · `accesos-externos` (Accesos Externos, KeyRound).
- [ ] Slug `detalle-usuario` (view, update) existe en el mapa: lo usa la página `/dashboard/configuration/user/[id]`.

## Configuración › General › Usuarios › Usuarios — ?tab=general&subtab=users&usertab=usuarios-empleados

- [ ] Componente: `Usuarios/table/UsersTableList.tsx` (Server, Card + `CardContent pt-6`) → `_UsersDataTable.tsx`. Skeleton `UsersTableSkeleton`.

### Tabla Usuarios de la empresa
- [ ] Columnas: `Usuarios/table/columns.tsx` — DataTable nuevo (`queryKey ['company-users', companyId]`, `tableId`/`paramNamespace` `company-users`).
- [ ] Columnas: **Nombre** (avatar + nombre; si es propietario: corona ámbar y **sin link**; si no: Link a `/dashboard/configuration/user/{id}`) · **Correo** · **Estado** (Badge success "Activo" / destructive "Baneado") · **Rol** (badge con color del rol + escudo; "+N" con tooltip "Roles adicionales:"; "Propietario" con corona si owner sin roles; "Sin rol"; no ordenable) · **Empleado vinculado** (celda interactiva `LinkEmployeeCell`; no ordenable) · **Fecha de alta** (relativa `fromNow` en es) · acciones.
- [ ] Filtros: Estado (faceted lazy: Activo / Baneado) · Rol (faceted lazy, opciones de BD + "Sin rol") · Empleado vinculado (faceted lazy + "Sin vincular") · Fecha de alta (dateRange) · Nombre (text) · Correo (text). Visibles por defecto: Estado, Rol, Empleado vinculado.
- [ ] Búsqueda: "Buscar por nombre o correo...". `showFilterToggle`.
- [ ] Orden por defecto: orden del usuario → `is_active desc` → `profile.fullname asc`.
- [ ] Exportación: `usuarios-empresa` / hoja "Usuarios" / "Usuarios de la Empresa"; formatters: Nombre, Correo, Estado (Activo/Baneado), Rol (lista de roles / Propietario / Sin rol), Empleado vinculado (`[legajo] Apellido Nombre` o "Sin vincular"), Fecha de alta DD/MM/YYYY.
- [ ] Sin selección múltiple.
- [ ] Toolbar: botón **Agregar Usuario** (`CreateUserModal`) si `configuracion:usuarios-empleados:create` (doble chequeo: map + `PermissionGuard`).
- [ ] Vacío: "No hay usuarios registrados".
- [ ] Acciones por fila (`UserStatusCell`): nada si la fila es el propietario o si no hay `delete` ni `update`.
  - [ ] **Dar de baja** (ghost rojo) si usuario activo y `configuracion:usuarios-empleados:delete`.
  - [ ] **Reactivar** (ghost verde) si usuario baneado y `:update`.

#### Flujo Dar de baja (AlertDialogs encadenados por `step`)
- [ ] Con empleado vinculado **activo** → AlertDialog "Dar de baja usuario": "Este usuario tiene un empleado vinculado: **[legajo] Apellido Nombre**. ¿Deseas tambien dar de baja al empleado?" — botones Cancelar · **Solo quitar acceso** (baja solo usuario) · **Si, ambos** (destructive).
- [ ] "Si, ambos" → AlertDialog "Datos de baja del empleado" con form (`TerminationFormFields` de Employees: motivo de baja* y fecha de baja*, schema `terminationSchema`) + Cancelar / **Dar de baja** ("Procesando...").
- [ ] Sin empleado activo → AlertDialog simple "Dar de baja usuario": "Este usuario sera baneado y no podra acceder al sistema. Podras reactivarlo mas tarde." Cancelar / **Dar de baja**.
- [ ] Llama `banCompanyUser(id, terminación?)`; toast "Usuario dado de baja exitosamente" / mensaje de error; invalida `['company-users']`.

#### Flujo Reactivar
- [ ] Si el empleado vinculado está inactivo → AlertDialog "Reactivar usuario": "El empleado vinculado **…** tambien esta dado de baja. ¿Deseas reactivar al empleado tambien?" — Cancelar · **Solo restaurar acceso** · **Si, ambos**.
- [ ] Si no → reactiva directo (sin confirmación). `unbanCompanyUser(id, reactivarEmpleado)`; toast "Usuario reactivado exitosamente".

#### Celda Empleado vinculado (`Usuarios/components/LinkEmployeeCell.tsx`) — **sin chequeo de permiso**
- [ ] Con empleado: ícono verde + "Apellido Nombre" (sin legajo) + botón ícono **Desvincular** (title "Desvincular empleado"; sin confirmación) → `linkEmployeeToProfile(profileId, null)`, toast "Empleado desvinculado".
- [ ] Sin empleado: botón **Vincular** → Dialog "Vincular empleado" ("Busca por nombre, CUIL o legajo para vincular un empleado a este usuario."):
  - [ ] Input de búsqueda (placeholder "Ej: García, 20-12345678-9, L001...", autofocus, Enter busca) + botón **Buscar** (deshabilitado con < 2 caracteres).
  - [ ] Estados: inicial "Ingresá un término de búsqueda / Mínimo 2 caracteres"; buscando "Buscando empleados..."; vacío "No se encontraron empleados / Probá con otro término o verificá que no esté ya vinculado"; resultados con contador "N empleado(s) disponible(s)".
  - [ ] Cada resultado (botón): avatar, Apellido Nombre, badge `L{legajo}`, "CUIL: …". Click → `linkEmployeeToProfile`; toast "Empleado vinculado exitosamente"; cierra e invalida `['company-users']`.
  - [ ] Búsqueda manual con `useState` (no React Query).

### Dialog Agregar Usuario (`Usuarios/components/create-user-modal.tsx` + `create-user-form.tsx`)
- [ ] Trigger "Agregar Usuario". Dialog "Compartir acceso a la empresa / Crea un nuevo usuario o invita a uno existente." (`max-h-[90vh]` scroll, `sm:max-w-md`).
- [ ] Tabs internas **Crear usuario** / **Invitar usuario** (cambiar de tab resetea el form).
- [ ] Crear usuario — campos: **Nombre*** y **Apellido*** (2–30, solo letras) · **Correo electrónico*** (email) · **Contraseña*** y **Confirmar contraseña*** (8–50, mayúscula, minúscula, número, carácter especial; deben coincidir "Las contraseñas no coinciden.") con toggle ojo mostrar/ocultar (compartido) · **Rol*** (Select de `useAllRoles`: "Cargando roles..." / "No hay roles disponibles").
- [ ] Invitar usuario — campos: **Correo electrónico*** · **Rol***.
- [ ] Botones: Cancelar · **Crear usuario** / **Invitar usuario** ("Procesando...").
- [ ] Validación extra: si el email es el del usuario logueado → toast "No puedes compartir la empresa contigo mismo".
- [ ] Envío: `registerUserWithRole(values)`; toast loading "Procesando solicitud..." → mensaje del server o error; al éxito `FetchSharedUsers()` + `router.refresh()` y cierra. (No invalida `['company-users']`.)

## Configuración › General › Usuarios › Gestión de Roles — ?tab=general&subtab=users&usertab=gestion-roles

- [ ] Componente: `src/features/UserPermissionsManager/components/RoleManagerContent.tsx` (Server: roles con conteos + permisos por rol + módulos/tabs en paralelo) → `RoleManager.tsx` (Client). Fallback `RoleManagerSkeleton`.
- [ ] Sin tabla: **grilla de tarjetas** (1/2/3 columnas) agrupadas en "Roles Personalizados (N)" y "Roles de Sistema (N)".
- [ ] Card cabecera "Roles Disponibles / Crea y gestiona roles con permisos predefinidos".
- [ ] Botón **Crear Rol** (`PermissionGuard configuracion:gestion-roles:create`).
- [ ] Buscador local "Buscar roles por nombre o descripción..." (filtra nombre/descripción). Vacío: "No se encontraron roles que coincidan con {texto}".
- [ ] Tarjeta de rol: escudo con color del rol, nombre, badge usuarios (N), badge permisos (N; "ALL" si slug `owner`), badge "Sistema"/"Personalizado" (solo si el rol tiene color), descripción (2 líneas).
  - [ ] Rol de sistema: solo **Asignar Usuarios** (`gestion-roles:update`).
  - [ ] Rol personalizado: **Editar** (`update`) · botón ícono Asignar usuarios (`update`) · botón ícono Eliminar (`delete`; deshabilitado si tiene usuarios —title "No se puede eliminar: N usuario(s) asignado(s)"— o es de sistema).
- [ ] Datos con `useQuery(['roles'], initialData)`, staleTime 30s.

### Dialog Crear/Editar Rol (estado con `useState`, no RHF)
- [ ] Título "Crear Nuevo Rol" / "Editar Rol"; "Define el nombre, descripción, color y permisos para este rol". `max-w-4xl`, `max-h-[90vh]` scroll.
- [ ] Campos: **Nombre del Rol*** (validación al guardar: toast "El nombre del rol es requerido") · Color del Rol (input color + input texto hex, default `#3b82f6`) · Descripción (Textarea).
- [ ] "Importar Permisos desde Roles Existentes (Opcional)": `RoleTemplateSelector` (checkbox por rol, excluye el rol en edición) + botón **Importar Permisos (N rol/es)** ("Importando..."); fusiona sin duplicados; toast "Se importaron N permisos únicos de M rol(es)".
- [ ] `RolePermissionsEditor`: "Permisos del Rol", acordeón por módulo (badge seleccionados/total) → tabs/subtabs con checkbox (estado indeterminado) y chips por acción (ícono + label; click en chip o checkbox). "No hay tabs disponibles".
  - [ ] Addon en módulo **mantenimiento**: `RoleEquipmentTypesSection` "Tipos de equipamiento" — "Destilda los tipos cuyas solicitudes de mantenimiento no debe ver este rol. Los vehículos no se ven afectados."; badge visibles/total; skeleton; error con **Reintentar**; vacío "No hay tipos de equipamiento activos. Se crean en Empresa → Equipos → Tipos de Unidad…"; línea viva "Sin guardar: se ocultan N tipos · se vuelven a mostrar M tipos"; Alert de error de guardado.
- [ ] Pie: "Total de permisos seleccionados: N".
- [ ] Botones: Cancelar · **Crear Rol** / **Guardar Cambios** ("Guardando..." / "Cargando tipos..." mientras falta el baseline de tipos).
- [ ] Envío: `createRoleWithPermissions` / `updateRoleWithPermissions` y luego delta de tipos ocultos (`updateRoleHiddenEquipmentTypes`). Toasts "Rol creado"/"Rol actualizado" con sufijo " Tipos de equipamiento: se ocultaron N y se volvieron a mostrar M."; si fallan los tipos: toast error "Tipos de equipamiento sin guardar", el dialog queda abierto (en creación pasa a modo edición para no duplicar).
- [ ] Invalida `['roles']` y las queries de visibilidad de tipos.

### Eliminar rol
- [ ] AlertDialog "¿Eliminar rol?" — "¿Estás seguro de que deseas eliminar el rol {nombre}? Esta acción no se puede deshacer." Cancelar / **Eliminar** (destructive). `deleteRoleServer`; toast "Rol eliminado".

### Dialog Gestionar usuarios del rol (`ManageRoleUsersDialog.tsx`)
- [ ] Título "Gestionar Usuarios - {rol}" / "Asigna o remueve este rol de los usuarios de tu empresa". `max-w-2xl`, `max-h-[80vh]`.
- [ ] Buscador local "Buscar usuarios por nombre o email...".
- [ ] Listas "Con este rol (N)" y "Sin este rol (N)": fila con Checkbox (asigna/quita **al instante**, sin botón guardar), nombre, email, botón ícono que abre `/dashboard/configuration/user/{id}` en pestaña nueva.
- [ ] Estados: "Cargando usuarios..."; "No se encontraron usuarios".
- [ ] Toasts "Rol asignado correctamente" / "Rol removido correctamente" / errores. Invalida `['users-with-role-status', id]` y `['roles']`.

## Configuración › General › Usuarios › Accesos Externos — ?tab=general&subtab=users&usertab=accesos-externos

- [ ] Componente: `src/features/Empresa/AccesosExternos/AccesosExternosTabContent.tsx` (Server). Encabezado h2 "Accesos externos" + texto "Credenciales que le permiten a un sistema de terceros consultar información de tu empresa. El acceso es de solo lectura: no pueden modificar nada."
- [ ] Botón **Nuevo acceso externo** si `checkPermissionServer configuracion:accesos-externos:create`.
- [ ] Tabla: `list/ExternalApiClientsList.tsx` (Card) → `list/_ExternalApiClientsDataTable.tsx`. Skeleton `ExternalApiClientsTableSkeleton`.

### Tabla Accesos externos
- [ ] Columnas: `AccesosExternos/list/columns.tsx` — DataTable nuevo (`queryKey ['external-api-clients','paginated']`, `tableId`/`paramNamespace` `external-api-clients`, `data-testid="external-api-clients-table"`).
- [ ] Columnas: Sistema · Usuario (mono) · Estado (Badge success "Activo" / secondary "Revocado" con ícono) · Última consulta (DD/MM/YYYY HH:mm o "Nunca") · Creado (DD/MM/YYYY, **oculta por defecto**) · Creado por ("Sin asignar") · Notas (**oculta por defecto**) · acciones (header sr-only "Acciones").
- [ ] Filtros: Estado (faceted: Activo/Revocado) · Creado por (faceted FK + "Sin asignar") · Última consulta (dateRange) · Creado (dateRange) · Sistema (text) · Usuario (text) · Notas (text). Visibles por defecto: Estado, Creado por, Última consulta.
- [ ] Búsqueda: "Buscar por sistema o usuario...".
- [ ] Orden por defecto: `is_active desc` (revocados al final) → usuario → `created_at desc`.
- [ ] Exportación: `accesos-externos` / "Listado de Accesos Externos" / hoja "Accesos Externos"; formatters Estado, Última consulta ("Nunca"), Creado.
- [ ] Sin selección múltiple.
- [ ] Vacío: "Todavía no hay accesos externos creados."
- [ ] Acciones por fila (`components/ExternalAccessActionsCell.tsx`): si revocado → texto "Revocado el DD/MM/YYYY" (sin acciones).
  - [ ] **Rotar clave** (`accesos-externos:update`) → AlertDialog "Rotar la clave de {nombre}" ("La clave actual deja de funcionar apenas confirmes…") → **Rotar clave** ("Generando..."). Toast "Clave rotada correctamente". Abre Dialog "Clave nueva de {nombre} / El usuario no cambia: solo hay que actualizar la clave." con `SecretRevealPanel` + **Listo**; no se cierra con click afuera ni Escape.
  - [ ] **Revocar** (`accesos-externos:delete`, rojo) → AlertDialog "Revocar el acceso de {nombre}" ("…Esta acción no se puede deshacer…") → **Revocar acceso** ("Revocando..."). Toast "Acceso revocado".
  - [ ] Ambos invalidan `['external-api-clients']`.

### Dialog Nuevo acceso externo (`components/CreateExternalAccessModal.tsx`) — 2 pasos en el mismo dialog
- [ ] Paso 1 "Crear acceso externo": **Nombre del sistema*** (3–150; placeholder "Ej: ERP Contable - Consulta de legajos"; descripción "Con qué sistema externo se corresponde este acceso") · Notas / contacto (opcional, máx 500; Textarea; "A quién avisar antes de rotar la clave o revocar el acceso"). Botones Cancelar / **Generar credenciales** ("Generando...").
- [ ] Al crear: toast "Acceso externo creado. Copiá la clave antes de cerrar." y paso 2 "Credenciales generadas / Entregale estos datos al responsable de {nombre}." con `SecretRevealPanel` + **Listo**.
- [ ] `SecretRevealPanel`: Alert destructive fijo "Copiá la clave ahora"; campos Usuario y Clave (solo lectura) con botón copiar (sr-only "Copiar usuario"/"Copiar clave"); toasts "Clave copiada al portapapeles" / "Usuario copiado al portapapeles" / "No se pudo copiar. Seleccioná el texto y copialo a mano."
- [ ] Guarda de cierre: con la clave visible y sin copiarla, cerrar abre AlertDialog "¿Ya copiaste la clave?" ("Una vez que cierres esta ventana no vas a poder volver a verla…") — **Volver** / **Sí, ya la copié**. Click afuera/Escape bloqueados.
- [ ] Al cerrar invalida `['external-api-clients']`.

## Configuración › General › KPIs (contenedor) — ?tab=general&subtab=kpis&kpiview=…

- [ ] Componente: `src/features/Dashboard/Estadisticas/KPIs/KpisTabContent.tsx` (`TabsManagerServer` paramName `kpiview`, default `indicadores`). Fallback Skeleton 300px.
- [ ] Sub-subtabs: `indicadores` (Indicadores, ClipboardList; `configuracion:indicadores` view/create/update) · `graficos` (Gráficos, BarChart3; view).
- [ ] **Ojo permisos**: el form, el botón Editar y el form de "Actualizar número y vigencia" chequean `dashboard:kpis:create|update`, no `configuracion:kpis:*` (ver rarezas).

## Configuración › General › KPIs › Indicadores — ?tab=general&subtab=kpis&kpiview=indicadores

- [ ] Componente: `KPIs/KpisIndicadoresContent.tsx` (Server) — Card con `ResizablePanelGroup`: si `dashboard:kpis:create` o `:update` → `KpiForm` 30% + handle + tabla 70%; si no, tabla 100%. Tabla en `Indicadores/KpisIndicadoresList.tsx` (div p-4, sin Card propia) → `_KpisIndicadoresDataTable.tsx`. Skeleton `KpisIndicadoresSkeleton`.

### Tabla KPIs
- [ ] Columnas: `KPIs/Indicadores/columns.tsx` — DataTable nuevo (`queryKey ['kpis-indicadores-paginated']`, `tableId`/`paramNamespace` `kpis-indicadores`).
- [ ] Columnas: Código · Nombre · Número (Umbral) (oculta) · Vigencia (DD/MM/YYYY; en rojo + "(Vencido)" si ya pasó) · Fórmula de Cálculo (mono, truncada; oculta) · Oportunidades de Mejora (truncada; oculta) · Soporte Técnico (Badge Sí/No; oculta) · Estado (Badge Activo/Inactivo) · Fecha de Creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted lazy Activo/Inactivo) · Soporte Técnico (faceted Sí/No) · Vigencia (dateRange) · Fecha de Creación (dateRange) · Nombre, Código, Número, Fórmula, Oportunidades de Mejora (text). Visibles por defecto: Estado, Vigencia, Código.
- [ ] Búsqueda: "Buscar por código o nombre...".
- [ ] Orden por defecto: usuario → `is_active desc` → `code asc`.
- [ ] Exportación: `kpis-indicadores` / hoja "KPIs Indicadores" / "Listado de KPIs Indicadores"; formatters fechas, Estado, Soporte Técnico.
- [ ] Sin selección múltiple.
- [ ] Acciones por fila: **Ver** (siempre) → `KpiDetailModal`; **Editar** solo con `dashboard:kpis:update` → carga el KPI en el form (store `useKpiStore`).
- [ ] Vacío: "No se encontraron KPIs".

### Form Crear/Editar KPI (`KPIs/components/KpiForm.tsx`, panel lateral)
- [ ] Título "Crear KPI" / "Editar KPI".
- [ ] Campos: **Nombre del KPI*** ("Debe ingresar el nombre del KPI") · Número (Umbral) (texto libre, "Ej: 85.5 (porcentaje objetivo)") · **Fecha de Vigencia*** (Input `type=date`; **solo en alta**) · **Fórmula de Cálculo*** (Textarea) · Oportunidades de Mejora (Textarea; **solo en edición**) · Activo (Radio Activo/Inactivo).
- [ ] El código del KPI no se ingresa (lo genera el server).
- [ ] Botones **Crear** / **Actualizar** ("Creando..."/"Actualizando...") + **Cancelar** (solo edición).
- [ ] Envío: `createKPI` / `updateKPI` con `toast.promise` ("Creando KPI..." → "KPI creado correctamente" / mensaje de error; idem "Actualizando KPI..."). Al éxito invalida la tabla y el gráfico de ese código, `router.refresh()` y resetea. La edición no cambia la vigencia (eso va por el modal de detalle).

### Dialog Detalle de KPI (`KPIs/components/KpiDetailModal.tsx`)
- [ ] Título = nombre del KPI; descripción "Código: KPI-XXXX". `max-w-4xl`, scroll.
- [ ] Tabs **Detalle** / **Revisiones (N)**.
- [ ] Detalle: Código, Número, Fecha de Vigencia (+ "(Vencido)" rojo), Estado, Fórmula de Cálculo (mono), Soporte Técnico, Oportunidades de Mejora (si hay).
- [ ] Si `dashboard:kpis:update`: form **Actualizar número y vigencia** (`KpiEditNumberForm`): **Nuevo Número*** · **Nueva Fecha de Vigencia*** (Input `type=date`) · **Motivo del Cambio*** (Textarea). Botones **Actualizar** ("Guardando...") / **Cancelar** (restaura valores). Toast "Actualizando número y vigencia..." → éxito; invalida el gráfico del KPI, `router.refresh()`, refresca revisiones.
- [ ] Revisiones: "Cargando revisiones..." / "No hay revisiones registradas" / tarjetas con Número Anterior → Número Nuevo (verde), Vigencia Anterior → Vigencia Nueva (verde), Motivo del Cambio, Fecha.
- [ ] Pie: botón **Cerrar**.

## Configuración › General › KPIs › Gráficos — ?tab=general&subtab=kpis&kpiview=graficos

- [ ] Componente: `KPIs/Graficos/GraficosTabContent.tsx` (Server; 1 query de metadatos) → grilla 1/2 columnas de **6 tarjetas fijas** `KpiChart` para los códigos KPI-0001 … KPI-0006 (hardcodeados). Fallback `GraficosGridSkeleton`.
- [ ] Cada tarjeta (`Graficos/components/KpiChart.tsx`): título = nombre del KPI (o el código si no existe), descripción ("Evolución del indicador" por defecto).
  - [ ] Select de rango: Últimos 7 días · Últimos 30 días (default) · Últimos 3 meses · Último año; placeholder "Personalizado" si se eligió rango manual.
  - [ ] Botón con rango "DD/MM/YYYY - DD/MM/YYYY" ("Seleccionar rango") → Popover con Calendar de rango, 2 meses.
  - [ ] Gráfico de línea `KpiLineChart` con línea de umbral (`number`); KPI-0003 y KPI-0006 con colores invertidos; etiquetas de valores si el rango ≤ 15 días.
  - [ ] Carga: skeleton por gráfico. Vacío: "No hay datos disponibles para el rango seleccionado".
  - [ ] Pie: "Promedio del período: N%" y "Umbral objetivo: N%" (si > 0).
- [ ] Sin acciones de edición ni permisos adicionales.

## Configuración › General › Datos fiscales — ?tab=general&subtab=datos-fiscales[&cert=homologacion|produccion]

- [ ] Componente: `General/FiscalData/FiscalDataTabContent.tsx` (Server; una sola lectura `getFiscalDataOverview` + provincias + `checkPermissionServer configuracion:datos-fiscales:update`). Card "Datos fiscales / Facturación electrónica ARCA: datos del emisor, puntos de venta y certificado". Skeleton `FiscalDataSkeleton`.
- [ ] Todas las mutaciones terminan en `router.refresh()` (no React Query).
- [ ] **Sin permiso update**: aviso "Para modificar los datos fiscales necesitás el permiso Modificar en Datos fiscales." y todos los controles deshabilitados (no se ocultan).
- [ ] Aviso si ARCA simulado: "ARCA simulado (modo demo): no hace falta certificado; los comprobantes no se informan a ARCA y no tienen validez fiscal."
- [ ] Secciones en orden, separadas por `Separator`: Resumen → Ambiente → Datos del emisor → Puntos de venta → Certificado.

### Resumen "Facturación electrónica" (`components/FiscalReadinessSummary.tsx`)
- [ ] Badge de ambiente: "Homologación · sin validez fiscal" / "Producción · con validez fiscal".
- [ ] Ítems con ícono de estado (ok/warning/missing/error), cada uno link ancla a su sección: Datos fiscales completos / Faltan…; N puntos de venta activos / Sin puntos de venta activos; certificado (falta / solicitado, falta cargarlo / vencido / vence en N días / vigente hasta…; "Certificado no necesario (ARCA simulado)"); conexión (sin probar / probada el … / la última prueba falló) si hay certificado.
- [ ] Línea final: "Todo listo: podés emitir comprobantes en {ambiente}." o "Todavía no podés emitir: falta {lista}."

### Ambiente (`components/FiscalEnvironmentSection.tsx`, `#ambiente`)
- [ ] Texto "Ambiente activo: **Producción/Homologación** (…)" + "Último cambio: DD/MM/YYYY HH:mm".
- [ ] En homologación: botón **Pasar a producción** (aria-disabled sin permiso o con bloqueos) + lista "Para pasar a producción falta: …".
- [ ] AlertDialog "¿Pasar a producción?" con form: checkbox **"Entiendo que los comprobantes emitidos en producción tienen validez fiscal."*** + **"Escribí el CUIT de la empresa para confirmar"*** (debe coincidir con el CUIT). Hint "Tildá la casilla y escribí el CUIT para habilitar el botón."; error del server inline. Botones Cancelar / **Pasar a producción**. Toast "Ambiente cambiado a producción."
- [ ] En producción: botón **Volver a homologación** → AlertDialog "¿Volver a homologación?" ("Las facturas que emitas van a ser de prueba. Los borradores no cambian.") → toast "Ambiente cambiado a homologación."

### Datos fiscales del emisor (`components/IssuerFiscalForm.tsx`, `#datos-del-emisor`)
- [ ] "Se imprimen en cada comprobante que emitas." Form RHF+zod en `fieldset` deshabilitado sin permiso.
- [ ] Solo lectura: Razón social (+ link **Editar en Empresa** → `?tab=general&subtab=company`) y CUIT formateado.
- [ ] Campos: **Condición frente al IVA*** (3 tarjetas radio: Responsable Inscripto "Emitís Facturas A y B." / Monotributo / IVA Exento "Emitís Facturas C.") · Ingresos Brutos: régimen (Select: Sin informar / Local / Convenio Multilateral / Exento) · Ingresos Brutos: número de inscripción (máx 30, "901-123456-7") · **Inicio de actividades*** (`EnhancedDatePicker`) · **Domicilio fiscal: calle y número*** (máx 255) · **Localidad*** (máx 120) · **Provincia*** (Select) · **Código postal*** (4–10 alfanumérico).
- [ ] Botón **Guardar datos fiscales** ("Guardando…"); error inline; toast "Datos fiscales guardados."

### Puntos de venta (`components/SalesPointsSection.tsx`, `#puntos-de-venta`) — tabla manual (shadcn `Table`)
- [ ] "Los que diste de alta en ARCA para factura electrónica por Web Services."
- [ ] Vacío: caja punteada "Todavía no cargaste puntos de venta. Agregá el que diste de alta en ARCA para Web Services." + botón.
- [ ] Botón **Agregar punto de venta** (en la cabecera si hay filas; deshabilitado sin permiso).
- [ ] Columnas: Número (mono, 0000X) · Nombre · Estado (Activo/Inactivo) · acciones (sr-only). Sin filtros, búsqueda, orden ni exportación.
- [ ] Acciones por fila (íconos, deshabilitados sin permiso): **Editar** · **Desactivar** (si activo) / **Activar** (si inactivo, sin confirmación; toast "Punto de venta X activado.") · **Eliminar**.
- [ ] AlertDialog Desactivar: "¿Desactivar el punto de venta X?" — "No se va a poder elegir en facturas nuevas…" → toast "…desactivado."
- [ ] AlertDialog Eliminar: "¿Eliminar el punto de venta X?" — "Se borra de la configuración. Si ya tiene comprobantes no se puede eliminar: en ese caso, desactivalo." → toast "…eliminado." El error del server queda dentro del dialog.
- [ ] Dialog Agregar/Editar (`components/SalesPointFormDialog.tsx`): "Agregar punto de venta" / "Editar punto de venta X". Campos **Número*** (1–99999, "el mismo número que tiene en ARCA") · **Nombre interno*** (máx 120, "Casa central"; "no se informa a ARCA"). Botones Cancelar / **Agregar punto de venta** | **Guardar cambios** ("Guardando…"). Toast "Punto de venta X agregado./actualizado."

### Certificado de ARCA (`components/ArcaCertificateSection.tsx`, `#certificado-arca`)
- [ ] "Cada ambiente usa su propio certificado…". Aviso extra si ARCA simulado.
- [ ] ToggleGroup "Ambiente que estás configurando": Homologación / Producción (marca "(activo)"); cambia `?cert=` con `history.replaceState`.
- [ ] Si hay certificado vigente: caja de estado (vigente hasta… faltan N días / venció…) + "Última prueba…" + botón **Renovar certificado** (si vence pronto o venció; abre paso 1 y enfoca alias).
- [ ] Mobile: "Paso N de 4: …".
- [ ] Asistente de 4 pasos (`certificate/CertificateWizardStep.tsx`; estados done/current/locked con candado y "Disponible después del paso 1." etc.; pasos hechos plegables "Ver detalle"):
  - [ ] **1. Generá la solicitud (CSR)** (`certificate/CsrRequestStep.tsx`): texto explicativo; aviso si falta `FISCAL_SECRETS_KEY`; Razón social/CUIT; campo **Alias del certificado*** (letras, números, `._-`, hasta 50); botón **Generar solicitud** / **Generar solicitud de renovación** / **Generar otra solicitud** (toast "Solicitud generada. Descargala y subila a ARCA."). Con solicitud pendiente: AlertDialog "¿Reemplazar la solicitud pendiente?". Resumen pendiente: "Solicitud generada el … con el alias …" + **Descargar solicitud (.csr)** + **Copiar solicitud** + **Descartar solicitud** (AlertDialog "¿Descartar la solicitud?"; toast "Solicitud descartada.").
  - [ ] **2. Subí la solicitud a ARCA** (`certificate/ArcaPortalInstructions.tsx`): lista de pasos en WSASS, link al portal, "Cuando tengas el certificado (.crt) volvé acá…".
  - [ ] **3. Cargá el certificado** (`certificate/CertificateUploadStep.tsx`): zona drag & drop ("Arrastrá el archivo .crt o elegilo.") + **Elegir archivo** (`.crt,.pem,.cer`); colapsable **Pegar el contenido** con Textarea "Contenido del certificado" + **Cargar certificado**. Toast "Certificado cargado. Vence el DD/MM/YYYY." Error bajo la zona. Hecho → tarjeta Titular / Emisor / Vigencia / Cargado.
  - [ ] **4. Probá la conexión** (`certificate/ConnectionTestStep.tsx`): **Probar conexión** ("Probando conexión…"), "Última prueba: … correcta/con errores", lista de chequeos ✓/✗ con detalle y colapsable "Respuesta técnica de ARCA" (+ **Copiar respuesta**). "Todavía no probaste la conexión con este certificado."

## Configuración › General › Documentación — ?tab=general&subtab=documentacion

- [ ] Componente: bloque inline en `GeneralTabContent.tsx`: botón + Card con `General/Documentacion/components/CompanyDocsList.tsx` (Server) → `_CompanyDocsDataTable.tsx`. Skeleton `CompanyDocsTableSkeleton`.
- [ ] Botón **Crear tipo de documento** (`Documentacion/TiposDocumentos/components/_CreateDocumentTypeButton.tsx`, `defaultApplies = Empresa`) con `PermissionGuardServer configuracion:documentacion:create`. Abre `_DocumentTypeFormModal` (el mismo form de Configuración › Documentos; ficha en la otra parte del inventario).

### Tabla Documentos de empresa
- [ ] Columnas: `General/Documentacion/components/columns.tsx` — DataTable nuevo **en modo SSR** (sin `queryFn`) y con **facets bulk** (`getCompanyDocsFacets` + `options`/`externalCounts`, patrón deprecado). `tableId`/`paramNamespace` `company-docs`.
- [ ] Columnas: checkbox de selección · Documento · Estado (Badge + ícono: presentado/aprobado/rechazado/vencido/pendiente) · Tipo (Mensual/Permanente; no ordenable) · Mandatorio (Sí rojo / No; no ordenable) · Subido por ("Pendiente" en itálica si no hay) · Fecha de carga · Vencimiento (texto; "No vence" / "Pendiente"; **oculta**) · Período (**oculta**) · acciones.
- [ ] Filtros: Estado (faceted, 5 estados + "Sin asignar") · Documento (faceted FK) · Tipo (faceted: "Mensual: {doc}" / "Permanente: {doc}", filtra por id de tipo) · Mandatorio (faceted Sí/No, sin conteos) · Subido por (faceted FK + "Pendiente") · Fecha de carga (dateRange) · Período (text). Visibles por defecto: Estado, Documento, Subido por.
- [ ] Búsqueda: "Buscar documentos...".
- [ ] Orden por defecto: usuario → `document_types.name asc`.
- [ ] Exportación: `documentos-empresa` / hoja "Documentos" / "Documentos de Empresa"; formatters de todas las columnas.
- [ ] Selección múltiple: **habilitada** (`enableRowSelection`, `showRowSelection`) pero **sin acciones masivas**.
- [ ] Vacío: "No se encontraron documentos".
- [ ] Acción por fila (`AddCompanyDocumentForm.tsx`, sin chequeo de permiso):
  - [ ] Documento subido (estado ≠ pendiente o con archivo) → Link **Ver documento** → `/dashboard/document/{id}?resource=Empresa`.
  - [ ] Pendiente → botón **Subir** → AlertDialog "Subir documento / Rellena el siguiente formulario para subir el documento": **Tipo de documento*** (Select con el tipo de la fila) · **Archivo*** (input file) · **Fecha de vencimiento*** (Input `type=date`, solo si el tipo vence) · **Periodo*** (Input `type=month`, solo si es mensual; "Este documento es mensual, debe ingrear el periodo al que corresponde"). Botones Cancelar / **Subir**. `uploadCompanyDocument(FormData)`; toast "Subiendo documento" → "Documento subido con exito" / error; invalida todas las queries + `router.refresh()`; cierra con click programático al Cancelar.

## Detalle de usuario — /dashboard/configuration/user/[id]

- [ ] Componente raíz: `src/app/dashboard/configuration/user/[id]/page.tsx` (Server). Se llega desde el nombre en la tabla de Usuarios (no para el propietario) y desde el ícono externo del dialog "Gestionar Usuarios" del rol (nueva pestaña).
- [ ] Permisos: `configuracion:detalle-usuario:view` (si no: "Sin acceso / No tienes permisos para ver esta sección.") y `:update` (`canEdit`; sin él todo queda deshabilitado/oculto).
- [ ] Usuario inexistente o de otra empresa: "Usuario no encontrado / El usuario solicitado no existe o no pertenece a esta empresa."
- [ ] Sin skeleton propio (SSR completo).

### Tarjeta de perfil (`Empresa/Usuarios/components/UserProfileCard.tsx`)
- [ ] Avatar (o iniciales), nombre (o "Sin nombre" en itálica), email (o "Sin email"), bloque "Empleado vinculado: [legajo] Nombre" o "Sin empleado vinculado".
- [ ] Botón **Editar nombre** (ghost, arriba a la derecha; texto oculto en mobile) solo con `update` → Dialog `EditUserNameDialog.tsx` "Editar nombre / Modifica el nombre que se mostrará para este usuario en toda la plataforma.": **Nombre completo*** (1–150) + atajo **Usar nombre del empleado** (si hay empleado). Botones Cancelar / **Guardar** ("Guardando..."). Toast "Nombre actualizado correctamente"; `router.refresh()`.

### Gestor de permisos (`UserPermissionsManager/UserPermissionsManager.tsx`)
- [ ] Tabs con una sola pestaña **Permisos de Usuario**.
- [ ] Encabezado "Gestión de Permisos / Configura los permisos de acceso para módulos, tabs y acciones" + "Usuario Seleccionado" (nombre, email).
- [ ] **Roles / Presets** (`components/RoleSelector.tsx`): "Selecciona uno o más roles para aplicar permisos predefinidos"; tarjetas con checkbox, nombre, badge cantidad de permisos, badge Sistema/Personalizado (color del rol), descripción. Click asigna/quita **al instante**; toasts "El rol ha sido asignado/removido correctamente". "Cargando roles...". Deshabilitado sin `update`.
- [ ] **Permisos por Módulo** (`components/ModulePermissions.tsx`): acordeón por módulo con checkbox (indeterminado) y badge seleccionados/total → tabs/subtabs → chips por acción (Ver/Crear/Editar/Eliminar) que guardan **al instante**.
  - [ ] Permiso heredado de un rol: chip deshabilitado con inicial del rol coloreada; tooltip "Este permiso viene del rol "X" y no puede ser removido aquí".
  - [ ] "Ver" bloqueado si hay otras acciones activas (tooltip "No se puede desactivar "Ver" mientras otros permisos estén activos").
  - [ ] Nota en Comercial › customers: "Tab Contratos — Los permisos… se heredan del módulo Comercial → tab Contratos/Servicios."
  - [ ] Botón **Limpiar Permisos** (si tiene roles o personalizados) → AlertDialog "Limpiar Permisos": lista de roles asignados (aviso ámbar), "Permisos personalizados: N"; botones **Solo Permisos Personalizados** · **Eliminar Todo (Roles + Permisos)** (destructive) · Cancelar.
  - [ ] En módulo Mantenimiento: `UserEquipmentTypesSection` "Tipos de equipamiento" — "Tildado: ve las solicitudes de mantenimiento de ese tipo. Cada cambio se guarda al instante y pisa lo que indican sus roles…"; checkbox por tipo + badge **Personalizado/Heredado** con tooltip explicativo + botón **Volver a heredar de sus roles**; toast de error con rollback "Se restauró el valor anterior. Intenta de nuevo."
  - [ ] Toasts de este componente con el `useToast` viejo ("Error / No se pudo actualizar el permiso", "Permisos limpiados", "Todos los permisos eliminados"). "Cargando permisos...".


## Configuración › RRHH (contenedor) — `/dashboard/configuration?tab=rrhh`

- [ ] Componente raíz: `src/features/Empresa/RRHH/RrhhTabContent.tsx` (`TabsManagerServer`, `paramName="subtab"`, default `listado`). Tab padre protegida por `configuracion:rrhh` (SectionManagerServer en `EmpresaComponent.tsx`).
- [ ] Subtabs (cada una filtrada por permiso `configuracion:<tabSlug>`), en este orden:
  - [ ] `listado` → "Tipos de Diagramas" (icono Layers)
  - [ ] `diagrams` → "Tipos de Novedades" (Calendar)
  - [ ] `convenios` → "CCT" (ScrollText)
  - [ ] `contract-types` → "Tipos de Contrato" (FileText)
  - [ ] `positions` → "Puestos" (Briefcase)
  - [ ] `aptitudes` → "APT" (Award)
  - [ ] `items-maestro` → "Artículos" (Shirt) — tabSlug `listado_maestro_articulos`
- [ ] Cada subtab va envuelta en `Card` con `CardHeader` (`bg-surface dark:bg-muted/50 border-b-2`) + título + descripción ("Gestión de …") y `CardContent pt-6`.
- [ ] Patrón común de las subtabs con formulario lateral (Diagramas, Novedades, Contrato, Puestos, APT): si el usuario tiene `create` **o** `update` de la tab → `ResizablePanelGroup` horizontal (form 30% izq. con scroll | handle | tabla 70% der., `min-h-[400px]`). Sin ninguno de los dos permisos → solo la tabla.
- [ ] Patrón común de orden por defecto (server): `is_active desc` (inactivos al final) → orden del usuario → `name asc` (APT: `nombre asc`).
- [ ] Patrón común de edición: botón "Editar" (`variant="link"`) en columna `actions` (solo si permiso `update`) carga el registro en el form lateral (store Zustand o estado local); en modo edición aparece "Cancelar".

### Modal compartido `DependencyValidationModal` (usado por Diagramas, Contrato, Puestos)
- [ ] Archivo: `src/shared/components/modal/DependencyValidationModal.tsx` (`Dialog`, `max-w-4xl max-h-[80vh]`).
- [ ] Se abre al **guardar edición pasando de Activo → Inactivo** si hay empleados que usan el registro (consulta limitada a 10).
- [ ] Contenido: título con icono AlertTriangle ámbar; caja ámbar "El registro {nombre} está siendo utilizado por {n} elemento(s)"; caja roja "Atención: Por favor revisa si este registro tiene documentos especiales asociados luego de proceder."; spinner "Cargando dependencias..."; caja azul "Opciones de reemplazo" con Select ("Dejar vacío — Remover la referencia sin reemplazar" + opciones de reemplazo); lista "{Relación} ({n} registros)" con Apellido/Nombre/Documento/Legajo por empleado, "... y N registros más" si >10; "✓ Sin dependencias" / "Error: …".
- [ ] Footer: "Cancelar" + "Reemplazar y desactivar" (solo si hay dependencias y opciones; deshabilitado sin reemplazo elegido). El botón "Desactivar igualmente" está comentado (no existe).
- [ ] "Reemplazar y desactivar" → `reassignDependencies` (empleados pasan al valor elegido o a null) y luego guarda el registro como inactivo. Error → toast "No se pudieron reemplazar las referencias".

## Configuración › RRHH › Tipos de Diagramas — `?tab=rrhh&subtab=listado`

- [ ] Componente raíz: `src/features/Empresa/RRHH/WorkDiagrams/WorkDiagramList.tsx` (server; carga paginado + preferencias + `getAllDiagramTypes()` para el form) → `_WorkDiagramDataTable.tsx`.
- [ ] Fallback: `WorkDiagrams/fallback/WorkDiagramTableSkeleton.tsx`.

### Tabla "Diagramas de trabajo"
- [ ] Columnas: `WorkDiagrams/columns.tsx`. Sistema: DataTable nuevo (client-side `queryFn`, `queryKey ['work-diagrams']`, `tableId`/`paramNamespace` = `work-diagrams`, `data-testid="work-diagrams-table"`).
- [ ] Columnas (meta.title): Nombre (atenuado si inactivo) · Días activos · Días inactivos · Estado (Badge Activo verde / Inactivo / "Sin asignar") · Novedades activas (M:M, primer badge + "+N" con tooltip, no ordenable) · Novedad inactiva (FK, no ordenable) · Fecha de creación (oculta por defecto) · acciones.
- [ ] Filtros: Estado (faceted, lazy: Activo/Inactivo/Sin asignar) · Novedades activas (faceted M:M) · Novedad inactiva (faceted FK) · Nombre (text) · Días activos (text) · Días inactivos (text) · Fecha de creación (dateRange). Visibles por defecto: Estado, Nombre, Novedades activas.
- [ ] Búsqueda: "Buscar por nombre...". `showFilterToggle`. Vacío: "No se encontraron diagramas de trabajo".
- [ ] Orden por defecto: inactivos al final, luego nombre asc.
- [ ] Exportación: `diagramas-de-trabajo` / hoja "Diagramas" / título "Diagramas de Trabajo" (Estado→Activo/Inactivo/Sin asignar, fecha DD/MM/YYYY, novedades unidas por coma).
- [ ] Selección múltiple: no.
- [ ] Acción por fila: "Editar" (`configuracion:listado:update`).

### Form lateral "Crear Diagrama" / "Editar Diagrama" (`WorkDiagrams/WorkDiagramForm.tsx`)
- [ ] Visible con `configuracion:listado:create` o `update`.
- [ ] Campos: Nombre del diagrama* (min 2; mensaje en inglés "Name must be at least 2 characters.") · Estado (Select Activo/Inactivo, default Activo) · Días activos* (number ≥0) · Días inactivos* (number ≥0) · Novedad activa (MultiSelectCombobox, solo tipos con `work_active`; vacío "No hay novedades disponibles") · Novedad inactiva (Select, solo tipos sin `work_active`).
- [ ] Botón: "Crear"/"Actualizar" (deshabilitado + "Creando..."/"Actualizando..." al enviar); "Cancelar" solo en edición (limpia y vuelve a crear).
- [ ] Toasts promise: "Creando diagrama..." → "Diagrama creado correctamente" / "Error al crear el diagrama"; "Actualizando diagrama..." → "Diagrama actualizado correctamente" / "Error al actualizar el diagrama". Tras éxito: `router.refresh()` + reset.
- [ ] Desactivar con empleados asignados (`employees.workflow_diagram`) → `DependencyValidationModal` (título "Confirmar desactivación"; descripción dice "Este tipo de contrato…" — texto copiado).

## Configuración › RRHH › Tipos de Novedades — `?tab=rrhh&subtab=diagrams`

- [ ] Componente raíz: `RRHH/DiagramTypes/DiagramTypeList.tsx` → `_DiagramTypeDataTable.tsx`. Fallback `DiagramTypes/fallback/DiagramTypeTableSkeleton.tsx`.

### Tabla "Tipos de Novedades"
- [ ] Columnas: `DiagramTypes/columns.tsx`. DataTable nuevo (`queryKey ['diagram-types']`, tableId/namespace).
- [ ] Columnas: Nombre · Descripción corta (mono) · Color (círculo con el color y la sigla, no ordenable, sin filtro) · Lab. Activa (Badge "Trabajando"/"No trabajando"/"Sin asignar") · Computa ausentismo (Sí/No, oculta por defecto) · Estado (Activo/Inactivo con iconos) · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Nombre (text) · Descripción corta (text) · Lab. Activa (faceted: "Laboralmente activo"/"No laboralmente activo"/Sin asignar) · Estado (faceted) · Computa ausentismo (faceted) · Fecha de creación (dateRange). Visibles por defecto: Estado, Lab. Activa, Nombre.
- [ ] Búsqueda "Buscar tipos de novedades..."; vacío "No se encontraron tipos de novedades".
- [ ] Orden por defecto: inactivos al final, nombre asc.
- [ ] Exportación: `tipos-de-novedades` / "Tipos de Novedades" (Lab. activa, Estado, Sí/No, fecha).
- [ ] Selección múltiple: no. Acción por fila: "Editar" (`configuracion:diagrams:update`).

### Form lateral "Crear Novedad" / "Editar Novedad" (`DiagramTypes/components/DiagramTypeForm.tsx`)
- [ ] Campos: Nombre de la novedad* · Descripción corta* (máx 3 caracteres, `maxLength=3`, placeholder "Máx. 3 caracteres, ej: TD") · Color* (input color, default #000000) · Switch "Laboralmente Activo" · Switch "Computa para ausentismo" (deshabilitado y forzado a No cuando Laboralmente Activo está prendido) · Estado (radio Activo/Inactivo, default Activo).
- [ ] Botón "Crear"/"Actualizar"; "Cancelar" en edición.
- [ ] Toasts: "Creando novedad..." → "Novedad {nombre} cargada con éxito" / "No se pudo crear la novedad"; "Actualizando novedad..." → "Novedad {nombre} editada con éxito" / "No se pudo editar la novedad". Invalida `['diagram-types']`.
- [ ] Sin validación de dependencias al desactivar.

## Configuración › RRHH › CCT — `?tab=rrhh&subtab=convenios`

- [ ] Componente raíz: `src/features/Empresa/CCT/components/CovenantTreeFileWrapper.tsx` (server, `getGuildsWithCovenants`) → `CovenantTreeFile.tsx` (Card p-6) → `TreeFile.tsx` (`TreeNode` recursivo). Fallback `RRHH/fallback/RrhhSubtabSkeleton.tsx` (`CctSubtabSkeleton`).
- [ ] Sin tabla: árbol colapsable raíz (sindicatoPadre) → sindicatos → convenios → categorías. Todos los nodos arrancan cerrados; click en el nombre abre/cierra (chevron + carpeta amarilla abierta/cerrada; hojas con icono de archivo azul).
- [ ] Botones por nivel (todos con `PermissionGuard configuracion:convenios:create`):
  - [ ] Raíz → "Nuevo sindicato" (`AddGuildModal`).
  - [ ] Sindicato → "Nuevo convenio" (`AddCovenantModal`, variant outline).
  - [ ] Convenio → "Nueva categoria" (`AddCategoryModal`, variant link).
- [ ] No hay editar ni eliminar en ningún nivel.

### Modales (AlertDialog con form dentro, submit que no burbujea a forms padres)
- [ ] "Agregar Asociación Gremial": campo Sindicato* (min 2 "El nombre del sindicato debe tener al menos 2 caracteres"), descripción "Ingrese el nombre del sindicato que desea agregar"; "Cancelar" / "Crear sindicato" ("Creando..."). Toast "Sindicato creado exitosamente" / error del server / "Ocurrió un error al crear el sindicato"; cierra + `router.refresh()`.
- [ ] "Agregar nuevo convenio al sindicato **{nombre}**": campo Convenio* (min 2); "Crear convenio"; toast "Convenio creado exitosamente".
- [ ] "Agregar categoria al convenio **{nombre}**": campo Categoria* (min 2); "Crear categoria"; toast "Categoría creada exitosamente".
- [ ] Los tres modales se reutilizan desde el form de empleado (`fromEmployee` → botón ancho completo).

## Configuración › RRHH › Tipos de Contrato — `?tab=rrhh&subtab=contract-types`

- [ ] Componente raíz: `RRHH/ContractTypes/ContractTypeList.tsx` → `_ContractTypeDataTable.tsx`. Fallback `ContractTypes/fallback/ContractTypeTableSkeleton.tsx`.

### Tabla "Tipos de Contrato"
- [ ] Columnas: `ContractTypes/columns.tsx`. DataTable nuevo (`queryKey ['contract-types']`).
- [ ] Columnas: Nombre · Descripción · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted, con Sin asignar) · Nombre (text) · Descripción (text) · Fecha de creación (dateRange). Visibles: Estado, Nombre, Descripción.
- [ ] Búsqueda "Buscar tipos de contrato..."; vacío "No se encontraron tipos de contrato". Orden: inactivos al final, nombre asc.
- [ ] Exportación: `tipos-de-contrato` / "Tipos de Contrato".
- [ ] Sin selección. Acción por fila: "Editar" (`configuracion:contract-types:update`).

### Form lateral "Crear Tipo de Contrato" / "Editar Tipo de Contrato" (`ContractTypes/components/ContractTypeForm.tsx`)
- [ ] Campos: Nombre del Tipo de Contrato* ("Debe ingresar el nombre del tipo de contrato") · Descripción (Textarea 4 filas, opcional) · Activo (radio Activo/Inactivo).
- [ ] Al crear solo se envían nombre y descripción (el radio no se usa en el alta).
- [ ] Toasts: "Creando tipo de contrato..." → "Tipo de contrato creado correctamente" / "Error al crear el tipo de contrato"; "Actualizando…" → "Tipo de contrato actualizado correctamente" / "Error al actualizar el tipo de contrato". Invalida `['contract-types']`.
- [ ] Desactivar con empleados (`employees.type_of_contract`) → `DependencyValidationModal`.

## Configuración › RRHH › Puestos — `?tab=rrhh&subtab=positions`

- [ ] Componente raíz: `RRHH/Positions/PositionsList.tsx` → `_PositionsDataTable.tsx`. Fallback `Positions/fallback/PositionsTableSkeleton.tsx`.

### Tabla "Puestos"
- [ ] Columnas: `Positions/columns.tsx`. DataTable nuevo (`queryKey ['positions']`).
- [ ] Columnas: Nombre · Estado · Sector/Departamento (array, badge + "+N" con tooltip, no ordenable, **sin filtro**) · Aptitudes Técnicas (M:M, badge + "+N", no ordenable) · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted) · Aptitudes Técnicas (faceted M:M, opción "Sin aptitudes") · Nombre (text) · Fecha de creación (dateRange). Visibles: Estado, Aptitudes, Nombre.
- [ ] Búsqueda "Buscar puestos..."; vacío "No se encontraron puestos". Orden: inactivos al final, nombre asc.
- [ ] Exportación: `puestos` / hoja "Puestos" / título "Puestos de Trabajo" (sectores y aptitudes unidos por coma; "Sin aptitudes").
- [ ] Sin selección. Acción por fila: "Editar" (`configuracion:positions:update`).

### Form lateral "Crear Posición" / "Editar Posición" (`Positions/PositionsFormNew.tsx`)
- [ ] Campos: Puesto* ("El nombre es requerido") · Sector/Departamento (MultiSelect, catálogo por `useQuery ['hierarchies-for-form']`; "No hay sectores disponibles") · Aptitudes Técnicas (MultiSelect, `['aptitudes-for-form']`; "No hay aptitudes disponibles") · Estado (radio).
- [ ] Botones: "Crear"/"Actualizar" ("Guardando..."); segundo botón "Limpiar" (alta) / "Cancelar" (edición).
- [ ] Toasts: "Posición creada con éxito" / "Posición actualizada con éxito" / "Error al guardar la posición". Invalida `['positions']`.
- [ ] Desactivar con empleados (`employees.company_position`) → `DependencyValidationModal` ("Esta posición está siendo utilizada…").

## Configuración › RRHH › APT (Aptitudes Técnicas) — `?tab=rrhh&subtab=aptitudes`

- [ ] Componente raíz: `RRHH/AptitudesTecnicas/AptitudesList.tsx` (carga también `positions` para el form) → `_AptitudesDataTable.tsx`. Fallback `AptitudesTecnicas/fallback/AptitudesTableSkeleton.tsx`.

### Tabla "Aptitudes Técnicas"
- [ ] Columnas: `AptitudesTecnicas/columns.tsx`. DataTable nuevo.
- [ ] Columnas: Nombre · Puestos (virtual, badge + "+N", no ordenable, **sin filtro**) · Estado · acciones. Ninguna oculta por defecto.
- [ ] Filtros: Nombre (text) · Estado (faceted). Ambos visibles.
- [ ] Búsqueda "Buscar aptitudes técnicas..."; vacío "No se encontraron aptitudes técnicas". Orden: inactivos al final, `nombre` asc.
- [ ] Exportación: `aptitudes-tecnicas` / "Aptitudes Técnicas".
- [ ] Sin selección. Acción por fila: "Editar" (`configuracion:aptitudes:update`).

### Form lateral "Crear Aptitud Técnica" / "Editar Aptitud Técnica" (`AptitudesTecnicas/AptitudesForm.tsx`)
- [ ] Campos: Nombre* (min 2 "El nombre debe tener al menos 2 caracteres.") · Puestos (MultiSelect "Selecciona los puestos...") · Estado (radio, default Activo).
- [ ] Toasts: "Creando aptitud técnica..." → "Aptitud técnica creada correctamente"; "Actualizando…" → "Aptitud técnica actualizada correctamente"; errores "Error al crear/actualizar la aptitud técnica". "Cancelar" en edición (deshabilitado mientras envía).
- [ ] Sin validación de dependencias.

## Configuración › RRHH › Artículos (contenedor) — `?tab=rrhh&subtab=items-maestro&clothing-tab=…`

- [ ] Componente raíz: `src/features/Clothing/ClothingCatalogTabContent.tsx` (dentro de Card "Listado Maestro de Artículos" / "Gestión del catálogo de indumentaria y EPP"). Tercer nivel de tabs con `paramName="clothing-tab"`, default `articulos`:
  - [ ] `articulos` → "Artículos" (`configuracion:articulos_indumentaria`)
  - [ ] `marcas` → "Marcas" (`configuracion:marcas_indumentaria`)
  - [ ] `talles` → "Talles" (`configuracion:talles_indumentaria`)
  - [ ] `reportes` → "Reportes" (`configuracion:reportes_indumentaria`)
- [ ] Nota: este subtab no tiene `Suspense` en `RrhhTabContent`; cada sub-subtab trae su propio `Suspense` + skeleton.

## Configuración › RRHH › Artículos › Artículos — `…&clothing-tab=articulos`

- [ ] Componente raíz: `Clothing/ClothingItems/ClothingItemsTabContent.tsx` → `ClothingItemsList/ClothingItemsList.tsx` → `components/_ClothingItemsDataTable.tsx`. Fallback `ClothingItemsList/fallback/ClothingItemsTableSkeleton.tsx`.

### Tabla "Artículos de indumentaria"
- [ ] Columnas: `ClothingItemsList/columns.tsx`. DataTable nuevo (`queryKey ['clothing-items']`).
- [ ] Columnas: Nombre · Código · Descripción (oculta) · Estado (Badge Activo / Inactivo atenuado) · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Nombre (text) · Código (text) · Descripción (text) · Estado (faceted) · Fecha de creación (dateRange). Visibles: Estado, Nombre, Código.
- [ ] Búsqueda "Buscar por nombre o código..."; vacío "No hay artículos registrados". Orden: inactivos al final, nombre asc.
- [ ] Exportación: `articulos-indumentaria` / "Artículos" / "Artículos de Indumentaria".
- [ ] Sin selección.
- [ ] Acciones por fila (iconos con tooltip): Editar (lápiz, `configuracion:articulos_indumentaria:update`) · Activar/Desactivar (Power, `…:delete`). Toggle directo sin confirmación → toast "Artículo desactivado"/"Artículo activado" o "Error al cambiar el estado del artículo".
- [ ] Botón toolbar: "Nuevo Artículo" (`PermissionGuard configuracion:articulos_indumentaria:create`).

### Dialog "Nuevo artículo" / "Editar artículo" (`ClothingItems/components/ClothingItemForm.tsx`)
- [ ] Campos: Nombre* (máx 150) · Código (opcional, máx 50, "Ej: CAM-ML-001") · Descripción (Textarea, máx 500) · bloque "Marcas y Talles" (`ItemBrandSizeManager.tsx`).
- [ ] Marcas y Talles: lista de marca + badges de talles con botón quitar; "Sin combinaciones asignadas."; botón "Agregar" (solo si quedan marcas sin usar) abre fila con Select de marca ("Seleccioná una marca...") + checkboxes de talles activos ("No hay talles activos disponibles.") + botón agregar (deshabilitado sin marca o sin talles) + X para cancelar. Skeleton mientras cargan catálogos.
- [ ] Botones: "Cancelar" / "Crear artículo" | "Guardar cambios" ("Guardando...").
- [ ] Guardado: crea/actualiza el artículo y luego reemplaza sus combinaciones marca-talle. Toasts "Artículo creado exitosamente" / "Artículo actualizado exitosamente" / "Ya existe un artículo con ese nombre" / "Error al guardar el artículo. Por favor, intente de nuevo."

## Configuración › RRHH › Artículos › Marcas — `…&clothing-tab=marcas`

- [ ] Componente raíz: `Clothing/ClothingBrands/ClothingBrandsTabContent.tsx` → `ClothingBrandsList/ClothingBrandsList.tsx` → `components/_ClothingBrandsDataTable.tsx`.
- [ ] Tabla: DataTable nuevo (`queryKey ['clothing-brands']`). Columnas: Nombre · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Nombre (text) · Estado (faceted) · Fecha de creación (dateRange). Los 3 visibles.
- [ ] Búsqueda "Buscar por nombre..."; vacío "No hay marcas registradas". Orden: inactivos al final, nombre asc.
- [ ] Exportación: `marcas-indumentaria` / "Marcas" / "Marcas de Indumentaria". Sin selección.
- [ ] Acciones por fila: Editar (`marcas_indumentaria:update`) · Activar/Desactivar (`marcas_indumentaria:delete`), toast "Marca desactivada"/"Marca activada"/"Error al cambiar el estado de la marca".
- [ ] Botón toolbar "Nueva Marca" (`PermissionGuard configuracion:marcas_indumentaria:create`).
- [ ] Dialog "Nueva marca"/"Editar marca" (`components/ClothingBrandForm.tsx`): Nombre* (máx 100, "Ej: Nike, Adidas, Caterpillar..."); "Crear marca"/"Guardar cambios"; toasts "Marca creada/actualizada exitosamente", "Ya existe una marca con ese nombre".

## Configuración › RRHH › Artículos › Talles — `…&clothing-tab=talles`

- [ ] Componente raíz: `Clothing/ClothingSizes/ClothingSizesTabContent.tsx` → `ClothingSizesList/ClothingSizesList.tsx` → `components/_ClothingSizesDataTable.tsx`.
- [ ] Tabla: DataTable nuevo (`queryKey ['clothing-sizes']`). Columnas: Nombre · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted, sin iconos) · Nombre (text) · Fecha de creación (dateRange). Visible por defecto solo Estado.
- [ ] Búsqueda "Buscar talles..."; vacío "No se encontraron talles".
- [ ] Orden por defecto: **nombre asc** (no manda inactivos al final; solo respeta el primer criterio de orden del usuario).
- [ ] Exportación: `talles-indumentaria` / "Talles" / "Listado de Talles de Indumentaria". Sin selección.
- [ ] Acciones por fila: Editar (`talles_indumentaria:update`) · Activar/Desactivar (`talles_indumentaria:delete`), toast "Talle desactivado"/"Talle activado"/"Error al cambiar el estado del talle".
- [ ] Botón toolbar "Nuevo Talle" (variant brand) — por `hasPermission(configuracion, talles_indumentaria, create)`, no `PermissionGuard`.
- [ ] Dialog "Nuevo talle"/"Editar talle" (`ClothingSizes/components/ClothingSizeForm.tsx`): Nombre* (máx 50, "Ej: S, M, L, XL, 42, 44..."); "Crear talle"/"Guardar cambios"; toasts "Talle creado/actualizado exitosamente", "Ya existe un talle con ese nombre".

## Configuración › RRHH › Artículos › Reportes — `…&clothing-tab=reportes`

- [ ] Componente raíz: `Clothing/ClothingReports/ClothingReportsTabContent.tsx` → `ClothingReportsList/ClothingReportsList.tsx` → `components/_ClothingReportsDataTable.tsx`. Solo lectura (no recibe permisos).

### Tabla "Entregas de indumentaria"
- [ ] Columnas: `ClothingReportsList/columns.tsx`. DataTable nuevo (`queryKey ['clothing-reports']`).
- [ ] Columnas: selección (checkbox) · Fecha de entrega · Legajo Receptor (mono) · Empleado · Legajo Entregado por · Entregado por · Tipo de entrega · Artículos ("N artículo(s)", no ordenable) · Firma ("Con firma" verde / "Sin firma") · Notas (oculta) · Fecha de registro (oculta) · acciones.
- [ ] Filtros: Fecha de entrega (dateRange) · Legajo Receptor (text) · Empleado (faceted FK) · Legajo Entregado por (text) · Entregado por (faceted FK) · Tipo de entrega (faceted enum) · Firma (faceted Con/Sin firma) · Notas (text) · Fecha de registro (dateRange). Visibles: Tipo de entrega, Empleado, Fecha de entrega.
- [ ] Búsqueda "Buscar por notas..."; vacío "No hay entregas registradas".
- [ ] Orden por defecto: fecha de entrega desc.
- [ ] Exportación: `reportes-indumentaria` / "Reportes" / "Reportes de Entregas de Indumentaria" (Artículos exporta "Nombre - Marca - Talle (xN)" por ítem).
- [ ] Selección múltiple **entre páginas** (`enableRowSelection`, `showRowSelection`) → `BulkDownloadBar` (`Clothing/pdf/BulkDownloadBar.tsx`): "Descargar ZIP" de constancias con progreso (obteniendo → "Comprimiendo ZIP…" → "ZIP descargado"), toast "ZIP descargado con N constancia(s)" / "Error al generar el ZIP de constancias", y botón para limpiar selección.
- [ ] Acción por fila: `DeliveryReceiptButton` compacto (descarga la constancia PDF de la entrega). Sin permiso.

## Configuración › Equipos (contenedor) — `/dashboard/configuration?tab=vehicles`

- [ ] Componente raíz: `src/features/Empresa/Equipos/EquipmentsTabContent.tsx` (`TabsManagerServer`, `paramName="subtab"`, default `tipos`). Tab padre protegida por `configuracion:vehicles`.
- [ ] Subtabs (filtradas por permiso `configuracion:<tabSlug>`), en este orden:
  - [ ] `tipos` → "Tipos de Unidad" (Truck)
  - [ ] `marcas` → "Marcas" (Tag)
  - [ ] `modelos` → "Modelos" (Box)
  - [ ] `subtipos` → "Subtipos" (Layers)
  - [ ] `titulares` → "Titulares" (User)
- [ ] Cada una dentro de `Card` con header (`bg-surface dark:bg-muted/50 border-b-2`), título y descripción "Gestión de …".
- [ ] Patrón común: form lateral en `ResizablePanelGroup` cuando el usuario tiene `create` o `update` de la tab (Tipos y Subtipos 35/65 `min-h-[500px]`; Marcas y Modelos 30/70 `min-h-[400px]`; Titulares 30/70 `min-h-[500px]`); si no, solo tabla. Orden por defecto: inactivos al final → orden del usuario → nombre asc.
- [ ] Patrón común de toasts: Tipos, Modelos, Subtipos y Titulares usan el toaster viejo (`@/components/ui/use-toast`, título + descripción, `variant: destructive` en error); Marcas usa `sonner` (`toast.promise`).

## Configuración › Equipos › Tipos de Unidad — `?tab=vehicles&subtab=tipos`

- [ ] Componente raíz: `Equipos/EquipmentTypes/EquipmentTypeList.tsx` (carga también todos los tipos activos para el form) → `_EquipmentTypeDataTable.tsx`. Fallback `EquipmentTypes/fallback/EquipmentTypeTableSkeleton.tsx`.

### Tabla "Tipos de Equipo"
- [ ] Columnas: `EquipmentTypes/columns.tsx`. DataTable nuevo (`queryKey ['equipment-types']`, tableId/namespace).
- [ ] Columnas: Nombre · Aplica a ("Vehículos"/"Otros Equipos") · Estado · Unidad Tractora (Sí/No) · Lleva Enganche (oculta, no ordenable, **sin filtro**) · Operativo (oculta, no ordenable, **sin filtro**) · Genera QR (oculta, no ordenable, **sin filtro**) · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Nombre (text) · Estado (faceted) · Aplica a (faceted, icono camión en Vehículos) · Unidad Tractora (faceted Sí/No) · Fecha de creación (dateRange). Visibles: Estado, Aplica a, Nombre.
- [ ] Búsqueda "Buscar por nombre..."; vacío "No se encontraron tipos de equipo".
- [ ] Exportación: `tipos-de-equipo` / "Tipos de Equipo" (Aplica a, Sí/No para tractora/enganche/operativo/QR, fecha).
- [ ] Sin selección. Acción por fila: "Editar" (`configuracion:tipos:update`).

### Form lateral "Crear Tipo de Unidad" / "Editar Tipo de Unidad" (`EquipmentTypes/EquipmentTypeForm.tsx`)
- [ ] Al editar, primero carga checklists y tipos de enganche del tipo (skeleton `FormRelationsSkeleton` mientras tanto); el form se remonta por `key`.
- [ ] Campos: Nombre* ("El nombre es requerido") · Aplica a (radio Vehículos / Otros Equipos, default Vehículos) · "Es operativo" (Switch, **solo si Aplica a = Otros Equipos**, descripción "Los equipos de este tipo aparecerán en el parte diario y podrán tener mantenimiento") · Activo (radio) · "Unidad Tractora" (checkbox, **solo si Vehículos**) · "Lleva Enganche" (checkbox indentado, solo si tractora) · "Tipos compatibles para enganche" (MultiSelect, solo si tractora + enganche; excluye el propio tipo, tractoras e inactivos) · "Checklists aplicables" (MultiSelect, solo si Vehículos o Es operativo; "Cargando checklists..."; "No hay checklists disponibles").
- [ ] Destildar tractora borra enganche y tipos compatibles; destildar enganche borra tipos compatibles.
- [ ] Botones: "Crear"/"Guardar" ("Creando..."/"Guardando...") + "Cancelar" (siempre visible, limpia la edición).
- [ ] Toasts: "Tipo de equipo guardado correctamente — Los cambios se han guardado exitosamente." / "Error" con mensaje (incluye "No se encontró el tipo de vehículo a actualizar. Quizás fue eliminado por otro usuario." y "Error de base de datos: …"). Invalida `equipment-types`, `active-checklists`, `type-checklists`.
- [ ] Desactivar con equipos (`vehicles.type`) → `DependencyValidationModal` ("Este tipo de equipo está siendo utilizado…").

## Configuración › Equipos › Marcas — `?tab=vehicles&subtab=marcas`

- [ ] Componente raíz: `Equipos/EquipmentBrands/EquipmentBrandList.tsx` → `_EquipmentBrandDataTable.tsx`. Fallback `EquipmentBrands/fallback/EquipmentBrandTableSkeleton.tsx`.
- [ ] Tabla: `EquipmentBrands/columns.tsx`, DataTable nuevo (`queryKey ['equipment-brands']`). Columnas: Nombre · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted) · Nombre (text) · Fecha de creación (dateRange). Los 3 visibles.
- [ ] Búsqueda "Buscar marcas de equipos..."; vacío "No se encontraron marcas de equipos".
- [ ] Exportación: `marcas-de-equipos` / "Marcas de Equipos". Sin selección.
- [ ] Acción por fila: "Editar" (`configuracion:marcas:update`).
- [ ] Form lateral "Crear Marca de Unidad"/"Editar Marca de Unidad" (`EquipmentBrandForm.tsx`): Nombre de la Marca* ("Debe ingresar el nombre de la marca") · Estado (radio). Botón "Crear"/"Actualizar"; "Cancelar" en edición. Toasts promise "Creando marca..." → "Marca creada correctamente" / "Error al crear la marca"; "Actualizando marca..." → "Marca actualizada correctamente" / "Error al actualizar la marca". Sin validación de dependencias.

## Configuración › Equipos › Modelos — `?tab=vehicles&subtab=modelos`

- [ ] Componente raíz: `Equipos/EquipmentModels/EquipmentModelList.tsx` → `_EquipmentModelDataTable.tsx`. Fallback `EquipmentModels/fallback/EquipmentModelTableSkeleton.tsx`.
- [ ] Tabla: `EquipmentModels/columns.tsx`, DataTable nuevo (`queryKey ['equipment-models']`). Columnas: Nombre · Marca (FK, ordenable vía FK_SORT_MAP) · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Marca (faceted FK) · Estado (faceted) · Nombre (text) · Fecha de creación (dateRange). Visibles: Estado, Marca, Nombre.
- [ ] Búsqueda "Buscar modelos de equipos..."; vacío "No se encontraron modelos de equipos".
- [ ] Exportación: `modelos-de-equipos` / hoja "Modelos" / "Modelos de Equipos". Sin selección.
- [ ] Acción por fila: "Editar" (`configuracion:modelos:update`).
- [ ] Form lateral "Crear Modelo de Unidad"/"Editar Modelo de Unidad" (`EquipmentModelForm.tsx`): Marca* (Select de marcas activas por `useQuery`, "Seleccione una marca"; "Debe seleccionar una marca") · Nombre del Modelo* ("El nombre no puede estar vacío") · Estado (radio). Botones "Crear"/"Guardar" + "Cancelar". Toasts "Modelo creado"/"Modelo actualizado — Los cambios se guardaron exitosamente." / "Error" con mensaje. Sin validación de dependencias.

## Configuración › Equipos › Subtipos — `?tab=vehicles&subtab=subtipos`

- [ ] Componente raíz: `Equipos/EquipmentSubTypes/EquipmentSubTypeList.tsx` → `_EquipmentSubTypeDataTable.tsx`. Fallback `EquipmentSubTypes/fallback/EquipmentSubTypeTableSkeleton.tsx`.
- [ ] Tabla: `EquipmentSubTypes/columns.tsx`, DataTable nuevo (`queryKey ['equipment-sub-types']`). Columnas: Nombre · Tipo de Unidad (FK, ordenable) · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Nombre (text) · Tipo de Unidad (faceted FK, nulo = "Sin tipo") · Estado (faceted) · Fecha de creación (dateRange). Visibles: Estado, Tipo, Nombre.
- [ ] Búsqueda "Buscar subtipos..."; vacío "No se encontraron subtipos de equipos".
- [ ] Exportación: `subtipos-equipos` / "Subtipos" / "Subtipos de Equipos". Sin selección.
- [ ] Acción por fila: "Editar" (`configuracion:subtipos:update`).

### Form lateral "Crear Subtipo de Unidad" / "Editar Subtipo de Unidad" (`EquipmentSubTypes/EquipmentSubTypeForm.tsx`)
- [ ] Wrapper carga tipos (`useQuery`) y, al editar, los ítems compatibles; skeleton mientras carga.
- [ ] Campos: Nombre* · Tipo de Unidad* (Select "Selecciona un tipo"; al cambiarlo en alta se vacían los compatibles) · Activo (radio) · "Subtipos/Tipos compatibles para enganche" (MultiSelect, **solo si el tipo elegido es tractora con enganche**; opciones "Subtipo (Tipo)" y "Tipo (Tipo)"; "Cargando..."; "No hay items disponibles") · "Checklists aplicables" (MultiSelect, "Seleccione los checklists que aplican a este subtipo").
- [ ] Botones "Crear"/"Guardar" + "Cancelar".
- [ ] Toasts: "Subtipo de equipo guardado correctamente — Los cambios se han guardado exitosamente." / "Error".
- [ ] Desactivar con equipos (`vehicles.subType`) → `DependencyValidationModal` ("Este subtipo de equipo está siendo utilizado…").

## Configuración › Equipos › Titulares — `?tab=vehicles&subtab=titulares`

- [ ] Componente raíz: `Equipos/EquipmentOwners/EquipmentOwnersTabContent.tsx` (vuelve a pedir el mapa de permisos) → `EquipmentOwnerList.tsx` → `_EquipmentOwnerDataTable.tsx`. Fallback `fallback/EquiposSubtabSkeleton.tsx`.

### Tabla "Titulares de Equipos"
- [ ] Columnas: `EquipmentOwners/columns.tsx`. DataTable nuevo (`queryKey ['equipment-owners-list']`, tableId `equipment-owners`).
- [ ] Columnas: Nombre · CUIT (mono) · Tipos de Contrato (badges, no ordenable, **sin filtro**) · Estado · Fecha de creación (oculta) · acciones.
- [ ] Filtros: Estado (faceted) · Nombre (text) · CUIT (text) · Fecha de creación (dateRange). Visibles: Estado, Nombre.
- [ ] Búsqueda "Buscar por nombre o CUIT..."; vacío "No hay titulares de equipos registrados".
- [ ] Exportación: `titulares-de-equipos` / "Titulares de Equipos" (tipos de contrato unidos por coma). Sin selección.
- [ ] Acciones por fila: "Editar" (`configuracion:titulares:update`) · "Ver Equipos" (siempre visible).

### Vista "Equipos de: {titular}" (reemplaza tabla y form en la misma subtab)
- [ ] Encabezado "Equipos de: {nombre}" + "Listado de equipos registrados para este titular" + botón "Volver a Titulares".
- [ ] Componentes: `VehiclesByOwnerList.tsx` → `_VehiclesByOwnerDataTable.tsx` (datos por `useQuery ['vehicles-by-owner-initial', ownerId]`, luego `queryKey ['vehicles-by-owner', ownerId]`), columnas `equipmentByOwnerColumns.tsx`, tableId `vehicles-by-owner`.
- [ ] Columnas: Dominio (link) · Número interno (link) — ambos a `/dashboard/equipment/action?action=view&id=…` · Tipo · Subtipo (oculta) · Marca (oculta, no ordenable) · Modelo (oculta, no ordenable) · Año · Condición · Estado documental · Chassis (oculta) · Motor (oculta) · Serie (oculta) · Kilómetros (oculta) · Horómetro (oculta) · Afectado a (no ordenable) · Estado (oculta).
- [ ] Filtros: Condición · Estado documental · Tipo · Subtipo · Estado (faceted, con iconos) · Dominio · Número interno · Serie · Motor · Chassis (text). Visibles: Condición, Estado documental, Tipo. **Sin filtro**: Marca, Modelo, Año, Kilómetros, Horómetro, Afectado a.
- [ ] Búsqueda "Buscar por dominio, número interno, serie..."; vacío "No hay equipos registrados para {titular}". Orden por defecto: dominio asc.
- [ ] Exportación: `equipos-{titular}` / "Equipos por Titular" / "Equipos de: {titular}". Sin selección ni acciones.

### Form lateral "Crear Titular" / "Editar Titular" (`EquipmentOwners/EquipmentOwnerForm.tsx`)
- [ ] Campos: Nombre* ("El nombre es requerido") · CUIT* (mín 6 caracteres; "El CUIT es requerido") · Tipos de Contrato (checkboxes Leasing / Alquiler / Prendado) · Activo (radio).
- [ ] Botones "Crear"/"Guardar" + "Cancelar".
- [ ] Toasts: "Titular guardado correctamente — Los cambios se han guardado exitosamente." / "Error — No se pudo guardar el titular…".
- [ ] Desactivar con equipos (`vehicles.owner_id`) → `DependencyValidationModal` ("Este titular tiene equipos asignados…"); "Reemplazar y desactivar" reasigna los equipos (`reassignVehiclesToOwner`) y toast "Titular actualizado correctamente — El titular y sus equipos han sido actualizados exitosamente." / "No se pudieron reasignar los equipos.".

## Configuración › Mantenimiento › Talleres — `/dashboard/configuration?tab=mantenimiento&subtab=talleres`

- [ ] Componente raíz: `src/features/Empresa/General/components/mantenimiento/TalleresTab.tsx` (server) → `talleres/TalleresTabClient.tsx` (client). Contenedor: `TabsManagerServer paramName="subtab" defaultTab="talleres"` en `src/features/Empresa/EmpresaComponent.tsx`; la subtab se ve con `configuracion:talleres:view`.
- [ ] Layout: `ResizablePanelGroup` horizontal: form a la izquierda (30%) + tabla (70%). Si no hay `create` ni `update` → sólo la tabla al 100%.
- [ ] Fallback de carga de la subtab: `Skeleton h-[400px]`; la tabla tiene otro `Suspense` con el mismo skeleton (lee la promesa con `use()`).

### Tabla Talleres
- [ ] Archivo de columnas: `talleres/TalleresTable.tsx` (`getTalleresColumns`). Sistema: **BaseDataTable viejo** (`tableId="talleres-table"`, visibilidad/filtros guardados en cookies `talleres-table` / `talleres-table-filters`).
- [ ] Título encima: "Talleres" + botón **Ver inactivos / Ver activos** (`VerActivosButton`, toggle; arranca mostrando activos; la lista se deriva en cada render).
- [ ] Columnas: Nombre · Tipo (badge interno/externo, capitalize) · Direccion · Provincia · Ciudad · Proveedor · Estado (badge Activo/Inactivo) · Acciones.
- [ ] Filtros (facetados client-side, `createFilterOptions` sobre la lista visible): Nombre, Tipo, Provincia. Toggle de filtros visibles (`showFilterOptions`).
- [ ] Búsqueda: no tiene buscador. Orden por defecto: el del server (`fetchAllWorkshops`); orden por columna con header clickeable (salvo Estado y Acciones).
- [ ] Exportación: Excel del toolbar base (default `showExport=true`). Opciones de vista (columnas) sí.
- [ ] Paginación base: 10 filas por defecto (cookie global `pageSize-table`). Contenedor con scroll `max-h-[600px]`.
- [ ] Selección múltiple / acciones masivas: no.
- [ ] Acción por fila: **Editar** (link) — solo si `configuracion:talleres:update`; carga el taller en el form (store Zustand `useTalleresStore`).
- [ ] Vacío: "Sin resultados".

### Formulario Crear/Editar Taller (panel lateral, no dialog)
- [ ] Archivo: `talleres/TalleresForm.tsx`. Título "Crear Taller" / "Editar Taller".
- [ ] Campos: **Nombre del Taller \*** (texto; "Debe ingresar el nombre del taller") · **Tipo de Taller \*** (select Interno/Externo; default Interno) · Direccion · Provincia (select; al cambiar limpia Ciudad) · Ciudad (select; deshabilitado sin provincia o "Cargando ciudades...") · Latitud / Longitud (number, `step=any`) · si Tipo = Externo: sección "Datos del Proveedor" con Nombre del Proveedor, Telefono del Proveedor, Email del Proveedor (valida "Email inválido") · Estado (radio Activo/Inactivo, default Activo).
- [ ] Botones: **Crear** / **Actualizar** (submit, `variant=brand`, deshabilitado mientras envía) + **Cancelar** (sólo editando: limpia y vuelve a modo crear).
- [ ] Envío: `createWorkshop` / `updateWorkshop`; toast.promise "Creando taller..." → "Taller creado correctamente" / "Error al crear el taller" (idem "Actualizando…" / "Taller actualizado correctamente" / "Error al actualizar el taller"); luego `router.refresh()` y reset del form. Los campos de proveedor se mandan `null` si es interno.
- [ ] Provincias/ciudades se cargan con `useEffect` + `useState` (no React Query).

## Configuración › Mantenimiento › Sectores — `/dashboard/configuration?tab=mantenimiento&subtab=sectores_taller`

- [ ] Componente raíz: `src/features/Empresa/General/components/mantenimiento/SectoresTab.tsx` → `sectores/SectoresTabClient.tsx`. Visible con `configuracion:sectores_taller:view`.
- [ ] Layout igual a Talleres: form 30% + tabla 70%, form sólo con `configuracion:sectores_taller:create|update`.

### Tabla Sectores de Taller
- [ ] Archivo: `sectores/SectoresTable.tsx` (`getSectoresColumns`). Sistema: **BaseDataTable viejo** (`tableId="sectores-table"`, cookies `sectores-table` / `sectores-table-filters`).
- [ ] Título "Sectores de Taller" + botón **Ver inactivos / Ver activos**.
- [ ] Columnas: Nombre · Descripcion · Taller · Cupo · Estado (badge) · Acciones.
- [ ] Filtros facetados: Nombre, Taller. Sin buscador. Export Excel y opciones de vista por default. Paginación 10. Sin selección.
- [ ] Acción por fila: **Editar** si `configuracion:sectores_taller:update` (store `useSectoresStore`).

### Formulario Crear/Editar Sector (panel lateral)
- [ ] Archivo: `sectores/SectoresForm.tsx`. Título "Crear Sector" / "Editar Sector".
- [ ] Campos: **Taller \*** (select de talleres internos; "Debe seleccionar un taller") · **Nombre del Sector \*** ("Debe ingresar el nombre del sector") · Descripcion (opcional) · Cupo Máximo (opcional; entero ≥ 1, "El cupo debe ser al menos 1"; placeholder "Cantidad máxima de equipos") · Estado (radio Activo/Inactivo).
- [ ] Botones: Crear / Actualizar (brand) + Cancelar (sólo editando).
- [ ] Envío: toast.promise "Creando sector..." → "Sector creado correctamente"; el error muestra **el mensaje del servidor** (ej. sector duplicado). Update: "Actualizando sector..." → "Sector actualizado correctamente" / "Error al actualizar el sector". Luego `router.refresh()` + reset.

## Configuración › Mantenimiento › Tipos de Reparación — `/dashboard/configuration?tab=mantenimiento&subtab=type_of_repair`

- [ ] Componente raíz: `src/features/Mantenimiento/TiposReparaciones/RepairTypeFormWrapper.tsx` (server, `Card p-6`) → `RepairTypeForm.tsx` (client; form + tabla en el mismo archivo). Visible con `configuracion:type_of_repair:view`.
- [ ] **Permisos del form leídos de otro módulo**: `canCreate = equipos:type_of_repair:create`, `canUpdate = equipos:type_of_repair:update` (no `configuracion:…`). Sin create ni update → sólo tabla al 100%.
- [ ] Layout: `ResizablePanelGroup` form 30% / tabla 70% (`min-w-[600px]`).

### Tabla Tipos de reparación
- [ ] Columnas en `RepairTypeForm.tsx` (`getRepairTypeColumns`). Sistema: **BaseDataTable viejo** (`tableId="repair-type-table"`, cookies `repair-type-table` / `repair-type-table-filters`).
- [ ] Columnas: Nombre · Descripción · Criticidad (badge: Alta=destructive, Media=warning, Baja=default) · Estado (Activo/Inactivo) · Tipo de Mantenimiento (badge Correctivo=warning, resto=success) · Autorizable (badge Sí/No) · Acciones.
- [ ] Filtros facetados: Nombre, Criticidad, Tipo de Mantenimiento, Autorizable. Sin buscador. Export Excel y vista por default. Paginación 10. Sin selección. No tiene toggle activos/inactivos (muestra todos).
- [ ] Acción por fila: **Editar** (si `equipos:type_of_repair:update`) → carga el registro en el form y trae sus sectores (`fetchSectorsForRepairType`).

### Formulario Tipo de reparación (panel lateral)
- [ ] Campos: **Nombre del tipo de reparación** ("Debe ingresar un nombre") · **Descripción** (Textarea, mínimo 3: "Intenta explicar con un poco más de detalle") · **Nivel de criticidad** (Baja/Media/Alta; "La criticidad es requerida") · **Tipo de mantenimiento** (Preventivo/Correctivo/Otro) · **Autorizable** (switch; ayuda "Requiere aprobacion del Jefe de Taller al ser agregada por un operario") · **Sectores de taller** (lista de checkboxes "sector - taller", con scroll; vacío: "No hay sectores disponibles"; cargada con React Query `workshop-sectors-config`).
- [ ] Modo crear: botón **Crear tipo de reparación** → `createTypeOfRepair` + `updateRepairTypeSectors`; toast "Creando tipo de reparación..." → "Tipo de reparación creado con éxito"; error con el mensaje del server; `router.refresh()`.
- [ ] Modo editar: **Actualizar tipo de reparación** → `updateTypeOfRepair` + sectores; toast "Tipo de reparación actualizado con éxito". **Eliminar** (destructive) abre AlertDialog "¿Estás seguro de que deseas eliminar este tipo de reparación?" / "Esta acción no se puede deshacer y se perderán todos los datos relacionados como las solicitudes de reparaciones que tengan este tipo de reparación." · botones "Cancel" (en inglés) y "Eliminar"/"Eliminando..." (bloqueado mientras borra) → `deleteTypeOfRepair`, toast "Tipo de reparación eliminado con éxito".
- [ ] No hay botón Cancelar para salir del modo edición. El borrado no chequea permiso `delete` (alcanza con `update`).

## Configuración › Mantenimiento › Grupos — `/dashboard/configuration?tab=mantenimiento&subtab=maintenance_groups`

- [ ] Componente raíz: `src/features/Mantenimiento/TiposReparaciones/MaintenanceGroupsWrapper.tsx` (server, `Card p-6`) → `MaintenanceGroupsClient.tsx`. Visible con `configuracion:maintenance_groups:view`.
- [ ] Permisos del form/edición leídos de **`equipos:maintenance_groups:create|update`** (no `configuracion`). Monta un `<Toaster />` del sistema viejo (`use-toast`).
- [ ] Layout: form 30% + tabla 70% (form sólo con create|update).

### Tabla Grupos de Reparación
- [ ] Archivo: `MaintenanceGroupsTable.tsx`. Sistema: **BaseDataTable viejo** (`tableId="maintenance-groups-table"`, cookies `maintenance-groups-table` / `-filters`). Título "Grupos de Reparación".
- [ ] Columnas: Nombre · Tipos de reparación (badge con el primero; si hay más, "X +N" con tooltip listando el resto; "-" si ninguno) · Descripción · Estado (badge) · Acciones.
- [ ] Filtros facetados: Nombre, Tipos de reparación (opciones = todos los tipos), Estado (Activo/Inactivo). Sin buscador. Export y vista por default. Paginación 10. Sin selección.
- [ ] Datos: **sólo grupos activos** (estado inicial `groups.filter(is_active)` guardado en `useState`, sin toggle).
- [ ] Acción por fila: **Editar** (si `equipos:maintenance_groups:update`) → carga el grupo en el form.

### Formulario Grupo de Reparación (panel lateral)
- [ ] Archivo: `MaintenanceGroupForm.tsx`. Título "Crear Grupo de Reparación" / "Editar Grupo de Reparación".
- [ ] Campos: Nombre del grupo · Descripción (textarea nativa) · Tipos de reparación asociados (`MultiSelectCombobox`, "No hay tipos de reparación") · Estado (radio Activo/Inactivo).
- [ ] Botones: **Crear** / **Editar** (brand) + **Limpiar** (modo crear) o **Cancelar** (modo editar).
- [ ] Envío: `createMaintenanceGroupAction` / `updateMaintenanceGroupAction` (con `type_ids`); toast.promise "Creando grupo..." → "Grupo de reparación creado con éxito" / "Error al crear el grupo" (idem actualizar); `router.refresh()` y reset.
- [ ] El schema Zod existe ("El nombre es requerido") pero **el form no usa `zodResolver`**: no valida nada en cliente.

## Configuración › Documentos (tipos de documento) — `/dashboard/configuration?tab=documentos&subtab=Personas|Equipos|Empresa`

- [ ] Componente raíz: `src/features/Documentacion/TiposDocumentos/TiposDocumentosTabContent.tsx` (server) dentro de `Suspense` con `Skeleton h-[400px]`. Tab visible con `configuracion:documentos:view`.
- [ ] Sub-tabs (`TabsManagerServer paramName="subtab"`, default `Personas`): **Personas** (`configuracion:tipos-docs-personas`), **Equipos** (`configuracion:tipos-docs-equipos`), **Empresa** (`configuracion:tipos-docs-empresa`). Cada una con `Suspense` + `TiposDocumentosSkeleton`.
- [ ] Botón de la barra de tabs: **Crear tipo de documento** (ícono +) envuelto en `PermissionGuardServer configuracion:documentos:create` → abre `_DocumentTypeFormModal` en modo crear (Aplica a = Persona por defecto).
- [ ] Props `showOnlyPersonas/Equipos/Empresa` permiten reutilizarlo mostrando una sola subtab (acá se usan las tres).

### Tablas Personas / Equipos / Empresa (las tres iguales salvo lo indicado)
- [ ] Archivos: `PersonasList/PersonasList.tsx` + `_PersonasDataTable.tsx`; `EquiposList/EquiposList.tsx` + `_EquiposDataTable.tsx`; `EmpresaList/EmpresaList.tsx` + `_EmpresaDataTable.tsx`. Columnas compartidas en `PersonasList/columns.tsx` (`getDocTypeColumns`).
- [ ] Sistema: **DataTable nuevo** (client-side mode con `queryFn`, `paramNamespace`/`tableId` = `doc-types-personas` / `doc-types-equipos` / `doc-types-empresa`, preferencias en BD, `Card > CardContent pt-6`).
- [ ] Columnas (meta.title): Nombre (tachado y gris si inactivo) · Obligatorio · Con vencimiento · Condicional · Multirrecurso · Mensual · Privado · Doc. de baja · [solo Equipos: Tipo de equipo · N° de Póliza] · Estado · Descripción · Fecha de creación · acciones. Booleanos como badge ✓ Sí / ✗ No.
- [ ] Ocultas por defecto: Multirrecurso, N° de Póliza, Mensual, Privado, Doc. de baja, Descripción.
- [ ] Filtros: Estado (Activo/Inactivo), Obligatorio, Con vencimiento, Condicional, Multirrecurso, Mensual, Privado, Doc. de baja (todos facetados lazy `fetchFacet`, Sí/No) · [Equipos: N° de Póliza (facetado), Tipo de equipo (facetado con labels)] · Nombre (texto) · Fecha de creación (dateRange). Visibles por defecto: Estado, Obligatorio, Con vencimiento, Condicional (4).
- [ ] Búsqueda: "Buscar por nombre...". Orden por defecto: activos primero, luego nombre asc (server; el orden elegido se aplica entre medio).
- [ ] Exportación: Excel `tipos-documentos-personas|equipos|empresa`, hoja/título "Tipos de Documentos - …", formatters Sí/No, Activo/Inactivo, fecha DD/MM/YYYY.
- [ ] Selección múltiple / acciones masivas: no.
- [ ] Acción por fila: botón lápiz **Editar** (sin chequeo de permiso) → abre `_DocumentTypeFormModal` en modo edición.
- [ ] Vacío: "No hay tipos de documentos".
- [ ] Empresa no recibe `permissionsMap` (no puede mostrar "Verificar documentos"; igual no aplica a Empresa).

### Dialog Nuevo/Editar Tipo de Documento (`components/_DocumentTypeFormModal.tsx`)
- [ ] Título "Nuevo Tipo de Documento" / "Editar Tipo de Documento" + descripción. En edición carga el detalle con React Query (skeleton mientras carga).
- [ ] Campos: **Nombre \*** ("El nombre es requerido"; placeholder "Ej: Licencia de conducir") · **Aplica a \*** (Empleados/Equipos/Empresa con íconos; **deshabilitado al editar**; al cambiar ajusta flags) · Tipo de equipo (sólo Equipos) · Opciones (checkboxes): Es obligatorio, Tiene vencimiento, Es mensual, Es privado, Documento de baja, [Persona] Puede cargarse desde un candidato, [no Empresa] Es multirrecurso (al destildar limpia póliza), [Equipos + multirrecurso] Lleva N° de póliza · Descripción ("Descripción opcional").
- [ ] Sección **Documento condicional** (`_ConditionsSection`): switch + badge "N condiciones"; texto "Este documento solo aplicará a empleados/equipos que cumplan al menos una condición de cada grupo configurado. Los grupos vacíos no restringen." Grupos Empleados (`_EmployeeConditions`, "Relaciones"/"Propiedades"): Tipo de Contrato, Provincia, Posición Jerárquica, Diagrama de Flujo, Posición en Empresa, Categoría, Gremio/Sindicato, Convenio, Centro de Costo, Sectores de Taller, Clientes, Aptitudes Técnicas, Sexo, Estado Civil, Nacionalidad, Tipo de DNI, Nivel de Educación, Tipo de Costo, Estado de Convenio. Equipos (`_EquipmentConditions`): Marca, Modelo, Tipo, Subtipo, Categoría Vehículo, Condición, Tipo de Costo, Tipo de Contrato, Clientes.
- [ ] Contador en vivo: "**N** empleado(s)/equipo(s) coinciden con las condiciones configuradas" ("Calculando coincidencias..." mientras carga; debounced).
- [ ] Validación extra: condicional sin condiciones → toast "Debe seleccionar al menos una condición".
- [ ] Footer: [editar] botón **Desactivar/Activar** (abre `_ToggleDocTypeDialog`) · [editar + obligatorio + no mensual + no Empresa + permiso `documentacion:tipos-docs-personas|equipos:update`] **Verificar documentos** · **Cancelar** · **Crear** / **Actualizar** ("Guardando...").
- [ ] Envío: `createDocumentType` / `updateDocumentType`; toasts "Tipo de documento creado" / "Tipo de documento actualizado" / mensaje del error; invalida `['doc-types']` y cierra.

### AlertDialog Desactivar / Activar "<nombre>" (`components/_ToggleDocTypeDialog.tsx`)
- [ ] Al abrir analiza el impacto (query sin reintentos; error → mensaje y botón "Cerrar"; tipos globales devuelven error de solo lectura).
- [ ] Desactivar — opciones radio según caso: con documentos subidos → aviso "Este tipo tiene N documento(s) subido(s). No se puede eliminar permanentemente." + "Desactivar y mantener las N alertas vacías / las alertas existentes" + "Desactivar y borrar las N alertas vacías"; no obligatorio → "Desactivar el tipo de documento" + (si se puede) "Eliminar permanentemente el tipo y todas sus alertas"; obligatorio sin subidos → "Desactivar y mantener alertas", "Desactivar y borrar las N alertas vacías", "Eliminar permanentemente (tipo + alertas)".
- [ ] Activar — si obligatorio con faltantes: "Activar y crear N alertas pendientes" / "Activar sin crear alertas"; si no: "Se activará el tipo de documento y se podrán volver a crear documentos de este tipo."
- [ ] Botones: Cancelar/Cerrar · Desactivar / Eliminar permanentemente / Activar. Toasts "Tipo de documento desactivado" / "…eliminado permanentemente" / "…activado"; invalida `['doc-types']`.

### Dialog Verificación de Documentos (`components/_VerifyDocumentsDialog.tsx`)
- [ ] Estados: skeleton (`_VerifyDocumentsSkeleton`), error ("Error al verificar" + botón reintentar), "Todo en orden" ("Los N empleados/equipos [que cumplen las condiciones|activos] tienen su alerta asignada correctamente.").
- [ ] Con inconsistencias: tarjetas "Alertas faltantes" y "Alertas sobrantes" con tabla (Personas: Legajo, Apellido, Nombre; Equipos: Dominio, N. Interno) y "y N mas...".
- [ ] Botones: Cerrar · **Corregir inconsistencias** ("Corrigiendo...") → AlertDialog "Confirmar correccion": "Se crearan N alertas nuevas y se eliminaran M alertas vacias. Esta accion no elimina documentos ya subidos." → toast "Se corrigieron X inconsistencias (A creadas, B eliminadas)"; invalida `['doc-types']`.

## Todas las Compañías — `/dashboard/configuration/companies`

- [ ] Componente raíz: `src/features/Empresa/General/components/AllCompaniesSection.tsx` (client). Datos con React Query (`useCompanyData`, key `COMPANIES_QUERY_KEY`).
- [ ] Alcance: **sin link en la UI**; sólo se llega por URL o desde el Manual de ayuda (`Ayuda/Manual/catalog/sections/configuracion.ts`).
- [ ] Título "Todas las Compañias" + texto "Aquí se verán todas las compañías".
- [ ] Grilla `CardsGrid.tsx` (6 columnas fijas): una tarjeta por compañía **activa** con nombre formateado y logo (card con `bg-white text-black` fijo). Click en la tarjeta → abre modal.
- [ ] Modal `ModalCompany.tsx` (**react-modal**, no shadcn): botón "X" para cerrar, nombre, descripción, logo, botón "Habilitar Edición / Deshabilitar Edición" (sólo alterna un estado; no habilita nada). Al cerrar invalida la query de compañías.
- [ ] Carga: texto "Cargando..." centrado a pantalla completa. Sin estado vacío explícito. Sin permisos.

## Registrar Compañía — `/dashboard/configuration/companies/new`

- [ ] Componente raíz: `src/features/Empresa/General/components/NewCompanySection.tsx` (server; `connection()` la hace dinámica). Acceso: link **"Agregar compañía"** del `CompanySwitcher` del sidebar; `proxy.ts` redirige acá a todo usuario sin empresa.
- [ ] Aviso (Alert info) si el usuario no tiene ninguna empresa: "Parece que no tienes ninguna Compañía registrada." / "Para utilizar la aplicación debes registrar tu compañía".
- [ ] Card "Registrar Compañía" / "Completa este formulario con los datos de tu nueva compañia".
- [ ] Formulario **nativo con FormData** (no react-hook-form): `CompanyFormFields.tsx` + `CityInput.tsx` + `CompanyLogoInput.tsx`. Validación en `lib/company-form.ts` (`parseCompanyForm`); errores pintados debajo de cada campo (`<campo>_error`, color rojo por `company-field-errors.ts`):
  - [ ] Nombre de la compañía \* (2–30)
  - [ ] CUIT de la compañía \* (11 números + dígito verificador: "El CUIT es inválido")
  - [ ] Sitio Web (opcional; URL válida)
  - [ ] Email \* (email)
  - [ ] Número de teléfono \* (5–25, sólo números, `+` opcional)
  - [ ] Dirección \* (4–50)
  - [ ] Seleccione un país \* (sólo "Argentina")
  - [ ] Seleccione una provincia \* / Seleccione una ciudad \* (ciudad deshabilitada sin provincia; "Cargando ciudades...")
  - [ ] Seleccione una Industria \*
  - [ ] Descripción \* (3–200)
  - [ ] Checkbox "Marcar para seleccionar Compañia por defecto"
  - [ ] Subir Logo (10MB máximo; input texto + file; acepta jpg, jpeg, png, gif, bmp, tif, tiff, webp)
- [ ] Botón **Registrar Compañía** ("Registrando..." y deshabilitado mientras envía) → `CreateCompanyButton.tsx` → `createCompany`; toast "Registrando Compañía" → "Compañía Registrada" / mensaje del server (errores por campo del server también se pintan); actualiza el store de compañías, deja la nueva como **empresa activa** y navega a `/dashboard`.

## Editar Compañía — `/dashboard/configuration/companies/[id]`

- [ ] Componente raíz: `src/features/Empresa/General/components/EditCompanySection.tsx` (server). Acceso: botón **Editar Empresa** de Configuración › General (guard `configuracion:general:update`).
- [ ] Sin acceso (`getCompanyForEdit` null: no es miembro, o no es owner y sin permiso): Card "Sin acceso" / "No tenés permisos para editar esta compañía."
- [ ] Alert info si el usuario no tiene empresa: "Editar Compañía registrada." / "Aquí podras editar tu compañía".
- [ ] Card "Editar Compañía" / "Edita este formulario con los datos que desees modificar". Mismos campos que el alta, precargados.
- [ ] Botón de `EditCompanyButton.tsx` (deshabilitado mientras envía) → `updateCompany(companyId, formData)` (el logo nuevo viaja junto); toast "Actualizando Compañía" → "Actualización exitosa, algunos cambios pueden tardar unos minutos en reflejarse" / mensaje del server; `router.refresh()`.

## Contacto (alta/edición/vista) — `/dashboard/configuration/contact` y `/dashboard/configuration/contact/action?action=new|edit|view&id=`

- [ ] Ambas rutas montan `src/features/Empresa/Contactos/components/ContactSection.tsx` → `ContactComponent.tsx`; difieren sólo en la posición del botón **Volver** (`BackButton`: izquierda en `/contact`, derecha en `/contact/action`) y el alto del skeleton.
- [ ] Alcance: **no hay links en el código** hacia estas rutas (sólo un comentario) → huérfanas, accesibles por URL.
- [ ] Carga: skeleton (`h-[400px]` / `h-64`); con `id`, mientras trae el contacto: skeleton `h-64`.
- [ ] `id` inexistente o de otra empresa: Card "Contacto no encontrado" / "El contacto no existe o no pertenece a la empresa activa."
- [ ] Título: "Registrar Contacto" (sin action) / "Editar Contacto" (edit) / vacío (view); descripción equivalente.
- [ ] Form (react-hook-form + `contactSchema` de `shared/schemas/schemas.ts`); en `view` (o con id sin `action=edit`) todo **readOnly**:
  - [ ] Nombre del Contacto \* (2–40)
  - [ ] Email (email válido)
  - [ ] Número de teléfono \* (4–15)
  - [ ] Seleccione un cliente (select; "Cargando clientes..."; valida "Debe seleccionar un cliente válido.")
  - [ ] Cargo \* (4–30)
- [ ] Botón **Registrar Contacto** / **Editar Contacto** (oculto en view) → toast.loading "Creando contacto"/"Actualizando contacto" → toast con el mensaje del server; éxito navega a `/dashboard/configuration`.
- [ ] Sin chequeo de permisos.

## Cliente (alta / ficha) — `/dashboard/configuration/customers/action?action=new|view&id=`

- [ ] Página `src/app/dashboard/configuration/customers/action/page.tsx` (server: trae cliente, contratos, áreas, sectores, unidades de medida y provincias; lee cookies `equipment-table-equipment[-filters]`) → `src/features/Empresa/Clientes/components/CustomerComponent.tsx`. Botón **Volver** arriba a la derecha.
- [ ] Alcance: **alcanzable** desde Comercial › Facturación (link al receptor, `invoice-links.ts` `customerHref`, `action=view`) y desde el Manual. Sin `id` = alta.
- [ ] Sin `id`: Card "Registrar Cliente" / "Completa este formulario con los datos de tu nuevo Cliente" + `CustomerForm.tsx`: Nombre · CUIT · Condición frente al IVA · Calle y número · Localidad · Provincia ("Cargando provincias…" / "No se pudieron cargar las provincias" / "Elegí la provincia") · Código postal · Email · Teléfono · Dirección de contacto · Estado · [si baja] Motivo de baja · Fecha de baja. Botón **Crear Cliente** (brand) → toast "Cliente guardado correctamente" / error; vuelve a `/dashboard/configuration`.
- [ ] Con `id`: `CustomerDetail/CustomerDetail.tsx` (componente **compartido** con Comercial › Clientes, `CustomersPanel`): título "Detalles del Cliente <nombre>" + botón **Cerrar** (→ `/dashboard/configuration`); tabs Detalle · Empleados · Equipos afectados · Equipos del cliente (`comercial:equipos-cliente:view`) · Áreas (`comercial:areas-cliente:view`) · Sectores (`comercial:sectores-cliente:view`) · Contratos (`comercial:service:view`). El contenido de cada tab se inventaría con Comercial › Clientes (mismo componente).
- [ ] Debajo: Card **Invitados** (tabla manual: Nombre, Email, Rol, Alta DD/MM/YYYY) con los usuarios compartidos de rol "Invitado" de ese cliente (desde el store). Vacío: "Este cliente no tiene usuarios invitados."
- [ ] Nota: `?action=new` no cambia nada (el alta depende de que no haya `id`).

## Items del Servicio — `/dashboard/configuration/services/[id]`

- [ ] Componente raíz: `src/features/Empresa/Clientes/components/Services/ServiceItemsSection.tsx` (client, React Query `['service-items', id]` + `['measure-units']`).
- [ ] Alcance: **ningún link en el código** apunta a esta ruta → huérfana (sólo por URL).
- [ ] Card "Items del Servicio " / "Detalle de todos los Items del servicio" + botón **Volver**.
- [ ] Filtro: select Activos/Inactivos (default Activos).
- [ ] Tabla **manual** (shadcn `Table`, con `TableBody` anidado dentro de `TableHead`): Nombre · Estado (badge) · Descripción · Unidad de medida · Precio (`$`) · Cliente · Acciones (**Editar**). Sin orden, búsqueda, export ni paginación. Sin estado vacío.
- [ ] Carga: texto "Cargando...".
- [ ] Modal `EditModal` (común, no shadcn Dialog) "Editar Item": Nombre del Servicio · Descripción del Servicio · Precio del Servicio (texto → Number) · Unidad de Medida (select). Sin validaciones.
- [ ] Botones: **Guardar** ("Guardando...") → `updateServiceItem`, toast "Item actualizado correctamente" · **Cancelar** · **Dar de Baja / Dar de Alta** (destructive/success) → toast "Item desactivado/activado correctamente". Bloqueados mientras guarda; invalida la query.
- [ ] Sin chequeo de permisos.

## Rarezas detectadas (Mantenimiento, Documentos y páginas sueltas)

- [ ] Tipos de Reparación y Grupos chequean permisos de **`equipos:type_of_repair` / `equipos:maintenance_groups`**, aunque la subtab se habilita con `configuracion:*`. Un rol con permisos sólo en Configuración ve la tabla sin form ni Editar.
- [ ] "Verificar documentos" (modal de tipo de documento) chequea **`documentacion:tipos-docs-personas|equipos:update`**, pero esas tabs están en `configuracion` en `permissions-map.ts`: el botón probablemente nunca aparece.
- [ ] Tipos de documento: el botón Editar por fila no tiene chequeo de permiso (la tab tiene acción `update` declarada).
- [ ] Tipos de reparación: el update atrapa el error adentro del `toast.promise` → siempre muestra éxito (fallo silencioso); el borrado no exige `delete`; AlertDialog con "Cancel" en inglés; no hay Cancelar de edición.
- [ ] Grupos: form sin `zodResolver` (no valida); tabla guarda los activos en `useState` inicial → después de crear/editar con `router.refresh()` la tabla no se actualiza, y los inactivos nunca se ven aunque el filtro Estado ofrezca "Inactivo". Monta un `<Toaster />` del sistema viejo.
- [ ] Talleres/Sectores: hay copias huérfanas `talleres/TalleresTab.tsx` y `sectores/SectoresTab.tsx` además de las usadas en `mantenimiento/`.
- [ ] Las 4 subtabs de Mantenimiento usan **BaseDataTable** (sistema viejo, cookies).
- [ ] `/companies`: modal con react-modal y botón "Habilitar Edición" que no hace nada; tarjetas con colores fijos blanco/negro.
- [ ] `/contact`, `/contact/action`, `/services/[id]` sin links entrantes (huérfanas); `/companies` sólo desde el Manual.
- [ ] `/services/[id]`: HTML inválido (`TableBody` dentro de `TableHead`) y sin permisos.


<!-- estado: completo -->
