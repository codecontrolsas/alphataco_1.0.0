# Mapa actual de alphataco (punto de partida)

Generado del inventario funcional (`inventario/*.md`) el 2026-10-09. Es el **"antes"**: cada página, solapa,
modal o asistente que hoy existe, con su ruta. Se usa en la Etapa 1 de cada módulo (relevamiento) para compararlo
con GH y armar la propuesta. Las tablas y los modales que el inventario describe dentro de una sección se
enumeran recién en el relevamiento del módulo.

`##` = página o solapa · `###`/`####` = sub-solapa, modal, asistente o componente compartido.

## Empleados — `inventario/empleados.md` (25 secciones)

- Página Empleados — `/dashboard/employee` (contenedor)
- Empleados Activos — `/dashboard/employee?tab=employees&subtab=empleados-activos`
  - Tabla de empleados (compartida activos/inactivos)
  - Botones de la pantalla
- Empleados Inactivos — `/dashboard/employee?tab=employees&subtab=empleados-inactivos`
- Ficha de empleado — `/dashboard/employee/action?action=view|edit|new&employee_id=<id>&tab=<pestaña>`
  - Header (`EmpleadoID/components/EmployeeHeaderContent.tsx`) — solo con empleado existente
  - Barra de acciones
  - AlertDialog "¿Dar de baja empleado?"
  - AlertDialog "¿Activar empleado?"
  - Pestañas (`TabsManagerClientSide`, `paramName="tab"`, default `personalData`, lista `grid-cols-6`; labels con icono y texto oculto en mobile)
  - Modo vista (`EmpleadoID/components/EmployeeViewDisplay.tsx`)
  - Modo edición / alta — formulario único (`employeeFormSchema` en `EmpleadoID/schemas/employee-schema.ts`)
- Ficha — pestaña Documentación — `/dashboard/employee/action?...&tab=documents&subtab=permanentes|mensuales`
- Ficha — pestaña Diagramas — `/dashboard/employee/action?...&tab=diagrams&subtab=Diagramas|NuevoDiagrama`
  - Subtab "Diagramas" (`FolderOpen`) — permiso `empleados:diagramas-empleado`
  - Subtab "Nuevo Diagrama" (`Plus`) — permiso `empleados:new`
- Ficha — pestaña Indumentaria — `/dashboard/employee/action?...&tab=clothing`
  - Tabla de entregas
- Diagramas (contenedor) — `/dashboard/employee?tab=diagrams&subtab=old|new|massive_diagram|reports`
- Diagramas Cargados — `/dashboard/employee?tab=diagrams&subtab=old`
- Cargar Diagrama — `/dashboard/employee?tab=diagrams&subtab=new` (también en la ficha, subtab "Nuevo Diagrama")
- Carga Masiva — `/dashboard/employee?tab=diagrams&subtab=massive_diagram`
- Reportes — `/dashboard/employee?tab=diagrams&subtab=reports`
- Rarezas encontradas (no se tocan en el rediseño; anotar en PLAN §9 si corresponde)

## Selección — `inventario/seleccion.md` (13 secciones)

- Candidatos (lista) — `/dashboard/recruitment?tab=candidatos`
  - Botones de la pantalla
  - Estados especiales
  - Tabla de candidatos
- Candidato — alta / detalle — `/dashboard/recruitment/detail?action=new` · `?action=view&pre_employee_id=<id>`
  - Estados especiales (server)
  - Barra superior
  - Encabezado (Card)
  - Formulario del candidato (Card, react-hook-form + `preEmployeeFormSchema`)
  - Checklist de documentos — `components/PreEmployeeDocumentChecklist.tsx` (lista manual, no tabla)
  - Dialog "Rechazar candidato" — `components/RejectPreEmployeeDialog.tsx`
  - Sheet "Aprobar y crear legajo" — `components/ApprovePreEmployeeSheet.tsx`
  - Comportamientos no obvios

## Equipos — `inventario/equipos.md` (46 secciones)

- Shell del módulo — `/dashboard/equipment` (`?tab=`)
- Equipos — `?tab=equipos` (`&subtab=`)
- Vehículos — `?tab=equipos&subtab=vehicles`
  - Tabla Vehículos
- Equipamiento (otros equipos) — `?tab=equipos&subtab=others`
  - Tabla Otros equipos
- Dados de Baja — `?tab=equipos&subtab=inactive` (`&inactive_subtab=`)
  - Tabla Vehículos dados de baja — `&inactive_subtab=inactive_vehicles`
  - Tabla Otros equipos dados de baja — `&inactive_subtab=inactive_others`
- Documentos de Equipos — `?tab=documentos-de-equipos` (`&subtab=`)
- Tipos de Documentos — `?tab=tipos-de-documentos` (`&subtab=Equipos`)
  - Tabla Tipos de documentos de equipos
  - Dialog `_DocumentTypeFormModal` (crear / editar tipo)
  - Dialog `_ToggleDocTypeDialog` (AlertDialog)
  - Dialog `_VerifyDocumentsDialog`
- Mantenimiento — `?tab=type_of_repairs` (`&subtab=`)
  - Equipos con Desvíos — `&subtab=equipments_with_deviations`
  - Tipos de Reparación — `&subtab=type_of_repair`
  - Grupos — `&subtab=maintenance_groups`
  - Solicitudes de Mantenimiento — `&subtab=maintenance_requests`
  - Pedidos de Mantenimiento — `&subtab=maintenance_orders` (`&pedidos_tab=`)
  - Operaciones — `&subtab=maintenance_operations` (`&operations_tab=`)
- Ficha de vehículo — `/dashboard/equipment/action?action=view|edit|new&id=<id>` (`&tab=`)
  - Encabezado — `EquipoID/components/vehicle-header.tsx` (no se muestra en `new`; fallback `VehicleHeaderSkeleton`)
  - Menú ⋯ — `EquipoID/components/vehicle-quick-actions.tsx` (no renderiza en `new`)
  - Pestañas — `EquipoID/components/vehicle-tabs.tsx` (`TabsManagerClientSide`, `paramName="tab"`, default `basicData`; filtra por permisos en cliente con `usePermissions().canView`; skeleton mientras cargan los permisos; "Sin acceso" si no queda ninguna)
  - Formulario del vehículo — `EquipoID/components/vehicle-form.tsx` (envuelve todas las pestañas en un solo `<Form>`)
    - Datos Básicos — `EquipoID/forms/vehicle-basic-data-form.tsx` (grilla 1/2 columnas; todos `disabled` en view)
    - Asignación — `EquipoID/forms/vehicle-assignment-data-form.tsx`
  - Documentos — `tab=documents` (`&subtab=permanentes|mensuales`)
  - QR — `tab=qr`
  - Historial de Mantenimiento — `tab=operations` (`&mant_subtab=orders|rejected`)
  - Checklist — `tab=checklists`
  - Cubiertas — `tab=tires`
- Ficha de otro equipo (equipamiento) — `/dashboard/equipment/action?type=other&action=view|edit|new&id=<id>` (`&tab=`)
  - Encabezado — `OtherEquipment/components/OtherEquipmentHeader.tsx` (no en `new`; fallback `OtherEquipmentHeaderSkeleton`)
  - Menú ⋯ — `OtherEquipment/components/OtherEquipmentQuickActions.tsx`
  - Pestañas — `OtherEquipment/components/OtherEquipmentTabs.tsx` (`TabsManagerClientSide paramName="tab"`, default `basicData`, grid según cantidad)
  - Formulario — `OtherEquipment/components/OtherEquipmentForm.tsx`
    - Datos Básicos — `OtherEquipmentBasicDataForm.tsx`
    - `OtherEquipmentFileUpload` (fotos `image/*` máx. 4 · planos `.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.dwg,.dxf` sin máximo)
    - Asignación — `OtherEquipmentAssignmentForm.tsx`
  - Documentos — `tab=certifications`
  - Mantenimiento — `tab=maintenance`
  - QR — `tab=qr` (solo tipos con `generates_qr`)
- Rarezas encontradas (no se arreglan en el rediseño: se anotan en PLAN §9 y se avisa)

## Documentación — `inventario/documentacion.md` (21 secciones)

- Convenciones comunes (aplican a las 6 tablas de documentos)
- Documentos de Empleados · Permanentes — `/dashboard/document?tab=documentos-de-empleados&subtab=empleados-permanentes`
  - Tabla `employee-permanent-docs`
- Documentos de Empleados · Mensuales — `/dashboard/document?tab=documentos-de-empleados&subtab=empleados-mensuales`
  - Tabla (tableId de `MonthlyEmployeeDocumentsList`)
- Documentos de Equipos · Permanentes — `/dashboard/document?tab=documentos-de-equipos&subtab=equipos-permanentes`
  - Tabla
- Documentos de Equipos · Mensuales — `/dashboard/document?tab=documentos-de-equipos&subtab=equipos-mensuales`
  - Tabla
- Documentos de Empresa · Permanentes — `/dashboard/document?tab=documentos-de-empresa&subtab=empresa-permanentes`
  - Tabla `company-docs-permanentes`
- Documentos de Empresa · Mensuales — `/dashboard/document?tab=documentos-de-empresa&subtab=empresa-mensuales`
- Detalle de documento — `/dashboard/document/[id]?resource=Persona|Equipos|Empresa&tab=…`
- Dialogs de documentos
  - Dialog "Documento multirecurso" — `NewDocumentMulti`
    - Form `UploadDocumentMultiEmployee` / `UploadDocumentMultiEquipment` (`shared/components/`)
  - Dialog "Subir documento" — `SimpleDocument`
  - Dialog "Subir documento" de empresa — `AddCompanyDocumentForm`
  - Dialog "Renovar documento" — `UpdateDocuments`
  - Dialog "Reemplazar documento" — `ReplaceDocument`
  - Dialog "Eliminar documento" — `DeleteDocument`

## Mantenimiento — `inventario/mantenimiento.md` (21 secciones)

- Pipeline (componente compartido de Operaciones y Taller)
- Operaciones › Validar Solicitud — `/dashboard/maintenance?tab=maint_operaciones&op_step=validate`
- Operaciones › Seguimiento — `/dashboard/maintenance?tab=maint_operaciones&op_step=in_workshop`
- Componente compartido: `OrderDetailDialog` (`MaintenanceOrders/components/OrderDetailDialog.tsx`)
- Vista Taller — `/dashboard/maintenance?tab=workshop_view`
- Taller › Por Programar — `/dashboard/maintenance?tab=maint_taller&taller_step=schedule`
- Taller › Por Ingresar — `/dashboard/maintenance?tab=maint_taller&taller_step=confirmed`
- Taller › En Taller — `/dashboard/maintenance?tab=maint_taller&taller_step=in_workshop`
  - Asistente de gestión — `OrderManagement/components/ManageOrderWizard.tsx` (Dialog de 4 pasos)
- Taller › Aprobaciones — `/dashboard/maintenance?tab=maint_taller&taller_step=approvals`
- Nuevo Pedido — `/dashboard/maintenance?tab=nuevo_pedido`
- Equipos con Desvíos — `/dashboard/maintenance?tab=equipments_with_deviations`
- Gomería — `/dashboard/maintenance?tab=gomeria&gomeria_tab=…`
  - Catálogo — `&gomeria_tab=catalogo_cubiertas`
  - Plantillas — `&gomeria_tab=plantillas_cubiertas`
  - Órdenes — `&gomeria_tab=ordenes_gomeria`
    - Asistente de órdenes — `Ordenes/components/ServiceOrderWizard.tsx` (también en `/maintenance/equipment/[id]/tire-service` vía QR, `mode="qr"`)
  - Marcas — `&gomeria_tab=marcas_cubiertas`
  - Tipos — `&gomeria_tab=tipos_cubiertas`
- Otras pantallas de Mantenimiento fuera de `/dashboard/maintenance`
- Tablas del sistema viejo (BaseDataTable)

## Operaciones — `inventario/operaciones.md` (24 secciones)

- Gestor de Pedidos — `/dashboard/operations?tab=preparte`
  - Botones de cabecera
  - Tarjetas de estado (encima de la tabla)
  - Tabla de pedidos
  - Dialog: Confirmar pedido (por fila)
  - Sheet: Nuevo / Editar Pedido (`components/PreparteForm.tsx` + `preparte-form/*`, schema `schemas/preparte-form.ts`)
  - Dialog: Cambiar estado masivamente (`components/PreparteBulkStatusModal.tsx`)
  - Dialog: Detalle del pedido (`components/PreparteDetailModal.tsx`)
  - Dialog: Generar Informe (`components/PreparteReportModal.tsx`)
- Partes Diarios (lista) — `/dashboard/operations?tab=dailyreportstable`
  - Form "Crear parte diario"
  - Tabla de partes diarios
- Detalle del parte diario — `/dashboard/operations/[uuid]`
  - Barra superior (solo con `operaciones:detalle-parte-diario:update`)
  - Tabla editable de filas
  - Sheet: Agregar / Editar fila — Asignar recursos (`detail/components/DailyReportRowForm/`)
  - Dialog: Edición masiva por estado (`detail/components/BulkEditModal.tsx`)
  - Dialog: Clonar registros (`detail/components/CloneRowsDialog.tsx` + `CloneRowsConflictView.tsx`, server `detail/clone.server.ts`, `lib/clone-conflicts.ts`)
  - Dialog: Eliminar registro (`detail/components/DeleteRowDialog.tsx`)
  - Dialog: Detalle del Servicio (`detail/components/ServiceDetailDialog.tsx`)
  - Dialog: Historial de Cambios (`detail/components/HistoryDialog.tsx`, server `detail/history.server.ts`)
- Selectores de empleados/equipos "por característica" — sin pantalla viva
- Partes diarios en Comercial: remitos, historial y certificación — `/dashboard/comercial?tab=comerce&subtab=daily_reports`
- Notas

## Comercial y Facturación — `inventario/comercial.md` (37 secciones)

- Clientes (listado) — `/dashboard/comercial?tab=comerce&subtab=customers`
  - Tabla Clientes — `Empresa/Clientes/components/CustomersList.tsx` (columnas en el mismo archivo, `customerColumns`)
  - Formulario de cliente — `Empresa/Clientes/components/CustomerForm.tsx` (schema `schemas/customer.ts`)
- Ficha del cliente (embebida) — desde el listado de Clientes (sin cambio de URL)
  - Pestaña Detalle — `CustomerDetailTab.tsx`
  - Pestaña Empleados — `CustomerEmployeesTab.tsx`
  - Pestaña Equipos afectados — `CustomerEquipmentTab.tsx`
  - Dialog de afectación M:M — `CustomerDetail/AssignmentDialog.tsx`
  - Pestaña Equipos del cliente — `CustomerOwnEquipmentTab.tsx`
  - Pestaña Áreas — `CustomerAreasTab.tsx`
  - Pestaña Sectores — `CustomerSectorsTab.tsx`
  - Pestaña Contratos — `CustomerContractsTab.tsx`
- Ficha del cliente (página) — `/dashboard/configuration/customers/action?action=new|view&id=<uuid>`
- Contratos — `/dashboard/comercial?tab=comerce&subtab=service`
  - Tabla Contratos — `Empresa/Clientes/components/Services/ServiceTable.tsx` (columnas en `getServiceColumns`)
  - Formulario de contrato — `Services/ServicesForm.tsx` (schema `schemas/service.ts`)
  - Detalle del contrato (pestañas locales)
  - Tabla Items del contrato — `Services/ServiceItemsTable.tsx`
- Items del contrato (página suelta) — `/dashboard/configuration/services/[id]`
- Unidades de Medida — `/dashboard/comercial?tab=comerce&subtab=mensure_units`
- Reglas de Precio — `/dashboard/comercial?tab=comerce&subtab=reglas-precio`
- Certificaciones — `/dashboard/comercial?tab=comerce&subtab=certificaciones`
- Facturación (listado) — `/dashboard/comercial?tab=comerce&subtab=facturacion` (+ params `invoices_*` de la tabla)
  - Tabla Comprobantes — `Facturacion/list/InvoicesList.tsx` → `list/_InvoicesDataTable.tsx` (columnas `list/columns.tsx`, actions `list/actions.server.ts`)
- Nueva factura — `/dashboard/comercial/facturacion/nueva?origen=certificaciones|manual`
- Comprobante — `/dashboard/comercial/facturacion/[id]?resultado=emitida|rechazada|pendiente`
  - Editor de borrador — `components/editor/InvoiceEditor.tsx` + `InvoiceDraftForm.tsx` (schema `editor-form.ts`)
  - Detalle de comprobante emitido — `components/detail/InvoiceDetail.tsx`
- Partes Diarios (comercial) — `/dashboard/comercial?tab=comerce&subtab=daily_reports`
  - Tabla — `Operaciones/Certificacion/components/EnhancedComercialReportTable.tsx` (formatters `export-formatters.ts`)
  - Sheet alta/edición de línea — `Operaciones/Certificacion/components/DailyReportRowFormRefactored.tsx` (store `useDailyReportFormStore`, secciones en `form-sections/`)
- Tablas del sistema viejo (BaseDataTable)
  - 10. `TalleresTable.tsx` — Configuración → Mantenimiento → Talleres
  - 11. `SectoresTable.tsx` — Configuración → Mantenimiento → Sectores de taller
  - 12. `employees-table.tsx` — ficha del cliente → Empleados
  - 13. `vehicle-operations-history.tsx` — ficha del equipo → Historial de Mantenimiento
- Hallazgos (bugs previos / inconsistencias — anotar en §9 del plan, no arreglar en silencio)

## Almacenes — `inventario/almacenes.md` (25 secciones)

- Stock — `/dashboard/warehouse?tab=stock`
- Detalle del material (kardex) — `/dashboard/warehouse/materials/[id]`
- Movimientos — `/dashboard/warehouse?tab=movimientos`
- Detalle del movimiento — `/dashboard/warehouse/movements/[id]`
- Nuevo movimiento — `/dashboard/warehouse/movements/new`
  - Componente compartido: `DestinationFields` (`Movements/components/DestinationFields.tsx`)
  - Componente compartido: `SearchCombobox` (`components/SearchCombobox.tsx`)
- Materiales — `/dashboard/warehouse?tab=materiales`
- Depósitos — `/dashboard/warehouse?tab=depositos`
- Préstamos — `/dashboard/warehouse?tab=prestamos`
- Pedidos — `/dashboard/warehouse?tab=pedidos`
- Detalle del pedido — `/dashboard/warehouse/requests/[id]`
- Nuevo pedido — `/dashboard/warehouse/requests/new`
- Entregar pedido — `/dashboard/warehouse/requests/[id]/deliver`
- Configuración — `/dashboard/warehouse?tab=config-almacen`
- Otras superficies del módulo
- Afectaciones cruzadas (pantallas de otros módulos que Almacenes modificó)
  - Entregas de ropa — panel `/clothing/delivery` → actualizar `paneles-de-campo.md` §3
  - Entregas de ropa — ficha del empleado, pestaña Indumentaria → actualizar `empleados.md` (sección "Ficha — pestaña Indumentaria")
  - Catálogo y reportes de indumentaria — Configuración → Indumentaria → actualizar `configuracion.md` (Indumentaria)
  - Cubiertas en Gomería → actualizar `mantenimiento.md` (Gomería)
  - Cubiertas en la ficha del vehículo → actualizar `equipos.md` (pestaña Cubiertas)
  - Pedidos de materiales desde el taller → actualizar `mantenimiento.md` (`OrderDetailDialog`) y `paneles-de-campo.md` §1
- Rarezas y bugs previos (para `PLAN.md` §9; no se arreglan en el rediseño sin preguntar)
- Crecimiento (D7)

## Formularios y Checklists — `inventario/formularios.md` (12 secciones)

- Lista de formularios — `/dashboard/forms?tab=formularios`
  - Tabla `forms` (Formularios)
- Detalle de formulario (respuestas) — `/dashboard/forms/[id]` (+ query params de la tabla `checklist-answers`)
  - Tabla `checklist-answers` (Respuestas de checklist) — rama A
  - Tabla de respuestas de formulario viejo — rama B
- Nueva respuesta — `/dashboard/forms/[id]/new`
  - Formulario `NormalizedChecklistForm` (compartido con `/maintenance/equipment/[id]/checklists/[checklistId]`)
- Ver respuesta (ruta vieja) — `/dashboard/forms/[id]/view` (`[id]` = id de la RESPUESTA)
- Ver respuesta (ruta nueva) — `/dashboard/forms/[id]/view/[answerId]`
- Constructor de formularios custom (legacy) — `/dashboard/forms/new`
- Responder formulario custom (legacy) — `/dashboard/forms/new/example?formid=<id>`
- Hallazgos a anotar (no se arreglan en el rediseño sin preguntar)

## Configuración — `inventario/configuracion.md` (102 secciones)

- Configuración › General (contenedor) — /dashboard/configuration?tab=general&subtab=…
- Configuración › General › Empresa — ?tab=general&subtab=company
- Configuración › General › Centro de Costos — ?tab=general&subtab=cost-center
  - Tabla Centros de costo
  - Form Crear/Editar Centro de Costo
- Configuración › General › Organigrama — ?tab=general&subtab=organigrama
  - Tabla Sectores (organigrama)
  - Form Crear/Editar Sector
- Configuración › General › Usuarios (contenedor) — ?tab=general&subtab=users&usertab=…
- Configuración › General › Usuarios › Usuarios — ?tab=general&subtab=users&usertab=usuarios-empleados
  - Tabla Usuarios de la empresa
    - Flujo Dar de baja (AlertDialogs encadenados por `step`)
    - Flujo Reactivar
    - Celda Empleado vinculado (`Usuarios/components/LinkEmployeeCell.tsx`) — **sin chequeo de permiso**
  - Dialog Agregar Usuario (`Usuarios/components/create-user-modal.tsx` + `create-user-form.tsx`)
- Configuración › General › Usuarios › Gestión de Roles — ?tab=general&subtab=users&usertab=gestion-roles
  - Dialog Crear/Editar Rol (estado con `useState`, no RHF)
  - Eliminar rol
  - Dialog Gestionar usuarios del rol (`ManageRoleUsersDialog.tsx`)
- Configuración › General › Usuarios › Accesos Externos — ?tab=general&subtab=users&usertab=accesos-externos
  - Tabla Accesos externos
  - Dialog Nuevo acceso externo (`components/CreateExternalAccessModal.tsx`) — 2 pasos en el mismo dialog
- Configuración › General › KPIs (contenedor) — ?tab=general&subtab=kpis&kpiview=…
- Configuración › General › KPIs › Indicadores — ?tab=general&subtab=kpis&kpiview=indicadores
  - Tabla KPIs
  - Form Crear/Editar KPI (`KPIs/components/KpiForm.tsx`, panel lateral)
  - Dialog Detalle de KPI (`KPIs/components/KpiDetailModal.tsx`)
- Configuración › General › KPIs › Gráficos — ?tab=general&subtab=kpis&kpiview=graficos
- Configuración › General › Datos fiscales — ?tab=general&subtab=datos-fiscales[&cert=homologacion|produccion]
  - Resumen "Facturación electrónica" (`components/FiscalReadinessSummary.tsx`)
  - Ambiente (`components/FiscalEnvironmentSection.tsx`, `#ambiente`)
  - Datos fiscales del emisor (`components/IssuerFiscalForm.tsx`, `#datos-del-emisor`)
  - Puntos de venta (`components/SalesPointsSection.tsx`, `#puntos-de-venta`) — tabla manual (shadcn `Table`)
  - Certificado de ARCA (`components/ArcaCertificateSection.tsx`, `#certificado-arca`)
- Configuración › General › Documentación — ?tab=general&subtab=documentacion
  - Tabla Documentos de empresa
- Detalle de usuario — /dashboard/configuration/user/[id]
  - Tarjeta de perfil (`Empresa/Usuarios/components/UserProfileCard.tsx`)
  - Gestor de permisos (`UserPermissionsManager/UserPermissionsManager.tsx`)
- Configuración › RRHH (contenedor) — `/dashboard/configuration?tab=rrhh`
  - Modal compartido `DependencyValidationModal` (usado por Diagramas, Contrato, Puestos)
- Configuración › RRHH › Tipos de Diagramas — `?tab=rrhh&subtab=listado`
  - Tabla "Diagramas de trabajo"
  - Form lateral "Crear Diagrama" / "Editar Diagrama" (`WorkDiagrams/WorkDiagramForm.tsx`)
- Configuración › RRHH › Tipos de Novedades — `?tab=rrhh&subtab=diagrams`
  - Tabla "Tipos de Novedades"
  - Form lateral "Crear Novedad" / "Editar Novedad" (`DiagramTypes/components/DiagramTypeForm.tsx`)
- Configuración › RRHH › CCT — `?tab=rrhh&subtab=convenios`
  - Modales (AlertDialog con form dentro, submit que no burbujea a forms padres)
- Configuración › RRHH › Tipos de Contrato — `?tab=rrhh&subtab=contract-types`
  - Tabla "Tipos de Contrato"
  - Form lateral "Crear Tipo de Contrato" / "Editar Tipo de Contrato" (`ContractTypes/components/ContractTypeForm.tsx`)
- Configuración › RRHH › Puestos — `?tab=rrhh&subtab=positions`
  - Tabla "Puestos"
  - Form lateral "Crear Posición" / "Editar Posición" (`Positions/PositionsFormNew.tsx`)
- Configuración › RRHH › APT (Aptitudes Técnicas) — `?tab=rrhh&subtab=aptitudes`
  - Tabla "Aptitudes Técnicas"
  - Form lateral "Crear Aptitud Técnica" / "Editar Aptitud Técnica" (`AptitudesTecnicas/AptitudesForm.tsx`)
- Configuración › RRHH › Artículos (contenedor) — `?tab=rrhh&subtab=items-maestro&clothing-tab=…`
- Configuración › RRHH › Artículos › Artículos — `…&clothing-tab=articulos`
  - Tabla "Artículos de indumentaria"
  - Dialog "Nuevo artículo" / "Editar artículo" (`ClothingItems/components/ClothingItemForm.tsx`)
- Configuración › RRHH › Artículos › Marcas — `…&clothing-tab=marcas`
- Configuración › RRHH › Artículos › Talles — `…&clothing-tab=talles`
- Configuración › RRHH › Artículos › Reportes — `…&clothing-tab=reportes`
  - Tabla "Entregas de indumentaria"
- Configuración › Equipos (contenedor) — `/dashboard/configuration?tab=vehicles`
- Configuración › Equipos › Tipos de Unidad — `?tab=vehicles&subtab=tipos`
  - Tabla "Tipos de Equipo"
  - Form lateral "Crear Tipo de Unidad" / "Editar Tipo de Unidad" (`EquipmentTypes/EquipmentTypeForm.tsx`)
- Configuración › Equipos › Marcas — `?tab=vehicles&subtab=marcas`
- Configuración › Equipos › Modelos — `?tab=vehicles&subtab=modelos`
- Configuración › Equipos › Subtipos — `?tab=vehicles&subtab=subtipos`
  - Form lateral "Crear Subtipo de Unidad" / "Editar Subtipo de Unidad" (`EquipmentSubTypes/EquipmentSubTypeForm.tsx`)
- Configuración › Equipos › Titulares — `?tab=vehicles&subtab=titulares`
  - Tabla "Titulares de Equipos"
  - Vista "Equipos de: {titular}" (reemplaza tabla y form en la misma subtab)
  - Form lateral "Crear Titular" / "Editar Titular" (`EquipmentOwners/EquipmentOwnerForm.tsx`)
- Configuración › Mantenimiento › Talleres — `/dashboard/configuration?tab=mantenimiento&subtab=talleres`
  - Tabla Talleres
  - Formulario Crear/Editar Taller (panel lateral, no dialog)
- Configuración › Mantenimiento › Sectores — `/dashboard/configuration?tab=mantenimiento&subtab=sectores_taller`
  - Tabla Sectores de Taller
  - Formulario Crear/Editar Sector (panel lateral)
- Configuración › Mantenimiento › Tipos de Reparación — `/dashboard/configuration?tab=mantenimiento&subtab=type_of_repair`
  - Tabla Tipos de reparación
  - Formulario Tipo de reparación (panel lateral)
- Configuración › Mantenimiento › Grupos — `/dashboard/configuration?tab=mantenimiento&subtab=maintenance_groups`
  - Tabla Grupos de Reparación
  - Formulario Grupo de Reparación (panel lateral)
- Configuración › Documentos (tipos de documento) — `/dashboard/configuration?tab=documentos&subtab=Personas|Equipos|Empresa`
  - Tablas Personas / Equipos / Empresa (las tres iguales salvo lo indicado)
  - Dialog Nuevo/Editar Tipo de Documento (`components/_DocumentTypeFormModal.tsx`)
  - AlertDialog Desactivar / Activar "<nombre>" (`components/_ToggleDocTypeDialog.tsx`)
  - Dialog Verificación de Documentos (`components/_VerifyDocumentsDialog.tsx`)
- Todas las Compañías — `/dashboard/configuration/companies`
- Registrar Compañía — `/dashboard/configuration/companies/new`
- Editar Compañía — `/dashboard/configuration/companies/[id]`
- Contacto (alta/edición/vista) — `/dashboard/configuration/contact` y `/dashboard/configuration/contact/action?action=new|edit|view&id=`
- Cliente (alta / ficha) — `/dashboard/configuration/customers/action?action=new|view&id=`
- Items del Servicio — `/dashboard/configuration/services/[id]`
- Rarezas detectadas (Mantenimiento, Documentos y páginas sueltas)

## Ayuda — `inventario/ayuda.md` (19 secciones)

- Shell del módulo — `/dashboard/help` (`?tab=tickets` | `?tab=manual`)
- Centro de Ayuda (Tickets) — `/dashboard/help?tab=tickets[&ticket=<id>]`
  - Encabezado
  - Bandeja "Pendientes de tu aprobación" — `components/ApproverInbox.tsx` (lista manual)
  - Panel "Mis tickets" (lista manual con pestañas propias) — `HelpCenter.tsx` + `MyTicketsList.tsx` + `TicketCard.tsx`
  - Panel de resolución — `components/TicketResolutionPanel.tsx` (en tarjeta y en Sheet)
  - Formulario "Reportar un problema" — `components/TicketForm.tsx` (Card fija a la derecha en ≥ lg, sticky; plegada en mobile; carga diferida `ssr:false` con placeholder pulsante)
  - Panel "Todos los tickets del proyecto" (aprobador) — `components/ApproverAllTickets.tsx` (lista manual paginada server-side)
  - Sheet de detalle — `components/detail/TicketDetailSheet.tsx` (Sheet derecho, `sm:max-w-2xl`, carga diferida `ssr:false`)
  - Composer de comentarios — `components/detail/TicketCommentComposer.tsx` (no es RHF)
  - Dialog "Solicitar reapertura del ticket" — `components/detail/TicketReopenRequestDialog.tsx` (shadcn `Dialog`, RHF + zod)
  - Dialog "Proponer el cierre del TKT-<id>" — `components/detail/TicketCloseProposalDialog.tsx` (`<dialog>` nativo propio, sin RHF)
- Manual de uso — `/dashboard/help?tab=manual[&guide=<slug>][#<ancla>]`
  - Índice — `components/ManualIndex.tsx`
  - Portada (sin `guide`) — `components/ManualHome.tsx`
  - Buscador — `components/ManualSearch.tsx` (client, React Query + server action `searchManual`)
  - Guía (`?guide=<slug>`) — `components/GuideView.tsx` (MDX compilado en server con `next-mdx-remote`, `remark-gfm`, `rehype-slug`)
  - Avisos (`components/ManualNotice.tsx`)
- Rarezas encontradas

## Dashboard — `inventario/dashboard.md` (22 secciones)

- Principal — `/dashboard` o `/dashboard?tab=principal`
  - Fila de KPIs — `Principal/components/KpiCardsRow.tsx` (Server, fallback `KpiCardsSkeleton`)
  - Servicios del Día — `Principal/components/ServicesSection.tsx` (client; datos SSR de `getServicesSummary`)
    - Dialog `ServicesDetailDialog.tsx` — "Detalle de servicios por cliente"
  - Recursos Humanos — `Principal/components/RrhhSection.tsx` → `RrhhSectionClient.tsx`
    - Dialog `AvailableEmployeesDialog.tsx` — "Empleados Disponibles (n)"
  - Estado de Equipos — `Principal/components/EquipmentOperationSection.tsx` → `EquipmentOperationClient.tsx`
  - Equipos — Estado de Flota — `Principal/components/EquipmentFleetSection.tsx` → `EquipmentFleetClient.tsx`
    - Dialog `AvailableVehiclesDialog.tsx` — "Disponible / Sin asignar (n)"
    - Dialog `VehiclesOnRepairDialog.tsx` — "Vehiculos no disponibles (n)"
- Documentación (próximos vencimientos) — `/dashboard?tab=documentacion&subtab=empleados|vehiculos`
  - Tabla Empleados — `Documentacion/Empleados/` (`EmployeeExpiringDocsList.tsx` → `_EmployeeExpiringDocsDataTable.tsx`, `columns.tsx`)
  - Tabla Vehículos — `Documentacion/Vehiculos/` (`VehicleExpiringDocsList.tsx` → `_VehicleExpiringDocsDataTable.tsx`, `columns.tsx`)
- Estadísticas — `/dashboard?tab=estadisticas&subtab=operaciones|rrhh|mantenimiento|desvios`
  - Operaciones — `Estadisticas/Operaciones/OperacionesTabContent.tsx` → `OperacionesChartsDynamic` (dynamic `ssr:false`) → `OperacionesChartsClient.tsx`
  - RRHH — `Estadisticas/RecursosHumanos/absenteeism-dashboard.tsx` (dentro de `<Card>`)
    - Tabla "Resumen por Sector" — `components/DepartmentSummaryTable/_DepartmentSummaryDataTable.tsx` + `columns.tsx`
    - Tabla "Ausentismo Diario - <Mes Año>" — `components/DailyAbsenceTable/_DailyAbsenceDataTable.tsx` + `columns.tsx`
    - Tabla "Detalle de Ausencias por Empleado" — `components/EmployeeAbsenceTable/_EmployeeAbsenceDataTable.tsx` + `columns.tsx`
  - Mantenimiento — `Estadisticas/Mantenimiento/MantenimientoTabContent.tsx` → `MantenimientoChartsDynamic` → `MantenimientoChartsClient.tsx`
  - Sala de Control — `/dashboard?tab=estadisticas&subtab=desvios` → `SalaDeControl/SalaDeControlTabContent.tsx`
- Resumen de la sección

## Paneles de campo — `inventario/paneles-de-campo.md` (34 secciones)

- Layout del panel — `src/app/operator/(panel)/layout.tsx`
  - Header — `src/features/OperatorPanel/components/OperatorHeader.tsx` (sticky, `z-50`, blur)
- Raíz — `/operator` (`src/app/operator/page.tsx`)
- Login — `/operator/login` (`src/app/operator/login/page.tsx` → `features/OperatorPanel/components/LoginForm.tsx`)
- Lista de Órdenes de Trabajo — `/operator/dashboard`
  - Tarjeta de OT — `components/WorkOrderCard.tsx`
- Detalle de OT — `/operator/work-order/[workOrderId]`
  - Header — `components/WorkOrderDetail/WorkOrderHeader.tsx`
  - Lista de tareas — `components/WorkOrderDetail/TaskList.tsx`
  - Tarjeta de tarea — `components/WorkOrderDetail/TaskCard.tsx`
  - Barra inferior de acciones
  - Dialog "Agregar Tarea" — `components/AddTaskDialog.tsx` (`ResponsiveDialog`: drawer en mobile)
  - Dialog "Devolver Tarea" — `components/ReturnTaskDialog.tsx` (`ResponsiveDialog`)
  - Dialog "Cerrar Orden de Trabajo" — `components/CloseWorkOrderDialog.tsx` (`ResponsiveDialog`)
- Layout — `src/app/maintenance/layout.tsx`
  - Header común — `features/Mantenimiento/shared/components/maintenance-header.tsx` (sticky `z-50`, blur)
- Login del QR — `/maintenance` (`?equipment=<id>`)
- Gracias (salida) — `/maintenance/thanks` (`src/app/maintenance/thanks/page.tsx`, client)
- Dashboard del equipo — `/maintenance/equipment/[id]`
- Lista de checklists — `/maintenance/equipment/[id]/checklists`
- Completar checklist — `/maintenance/equipment/[id]/checklists/[checklistId]`
  - Modal "Registrar Desvíos" — `features/Mantenimiento/shared/components/critical-deviations-repair-modal.tsx` (Dialog `max-w-4xl`)
  - Modal "Registrar desvío adicional" — `shared/components/AdditionalDeviationModal.tsx` (Dialog `max-w-2xl`)
- Nuevo pedido de mantenimiento — `/maintenance/equipment/[id]/request`
- Operación de Gomería — `/maintenance/equipment/[id]/tire-service`
- Layout del panel — `src/app/clothing/(panel)/layout.tsx`
- Raíz — `/clothing`
- Login — `/clothing/login` (`ClothingDelivery/components/ClothingLoginForm.tsx`)
- Entregas — `/clothing/delivery` (`?employee_id=<uuid>` y params de la tabla con prefijo `all-deliveries`)
  - Asistente "Registrar Entrega" — `ClothingDelivery/components/DeliveryWizard.tsx`
  - Tabla "Todas las entregas" — `features/Clothing/AllDeliveries/AllDeliveriesList/`
- Gracias — `/clothing/thanks` (`src/app/clothing/thanks/page.tsx`, client)
- Hallazgos y comportamientos no obvios (para §9 del PLAN; no se arreglan en el rediseño sin preguntar)
- Conteo

## Acceso y errores — `inventario/auth-y-errores.md` (14 secciones)

- Raíz — `/`
- Login — `/login` (`?error=oauth`)
  - Formulario de ingreso (form nativo + server action; NO react-hook-form)
  - Estados especiales
- Recuperar contraseña — `/reset_password`
  - Formulario (react-hook-form + `recoveryPassSchema`)
- Confirmar enlace — `/reset_password/confirm` (`?error=invalid_token`)
- Nueva contraseña — `/reset_password/update-user` (`?token=…`, `?error=…`)
  - Formulario (react-hook-form + `changePassSchema`)
- 404 — `not-found.tsx` (global)
- Error de aplicación — `src/app/error.tsx`
- Error global — `src/app/global-error.tsx`
- Error del dashboard — `src/app/dashboard/error.tsx`
- Carga del dashboard — `src/app/dashboard/loading.tsx`
