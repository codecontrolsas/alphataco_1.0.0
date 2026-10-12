# Módulo 1 · Personas — relevamiento (GH vs alphataco)

Relevado el 2026-10-10. Alcance: Empleados (lista activos/inactivos), Diagramas (4 sub-solapas), Selección
(candidatos + ficha), ficha de empleado. Contrato: `inventario/empleados.md` y `seleccion.md` (coinciden con el
código salvo los DRIFT de abajo).

## 1. Lado a lado

| Unidad | GH | alphataco hoy | ¿Igual? |
|---|---|---|---|
| Entrada | Empleados (2º en el menú) | Empleados (2º) + Selección (3º) | ≈ |
| Solapas | Empleados (Activos/Inactivos) · Pre Legajos · Documentos de Empleados · Diagramas · Tipos de Documentos · CCT | Empleados (Activos/Inactivos) · Diagramas; Selección aparte | ≈ (subconjunto) |
| Tabla de empleados | Avatar+nombre link, Email, Legajo, Estado (Avalado/No avalado/Incompleto/Completo/Completo con doc vencida), Sector, Puesto, Fecha de ingreso, Afectaciones; filtros Estado/Sector/Puesto; "Excel · Filtros · Columnas" + "+ Agregar empleado" naranja; ⋯ Ver/Editar | Idéntica (columnas, filtros por defecto, textos, export "Listado de Empleados Activos") | **=** |
| Ficha | Card: avatar 96px + h1 + puesto + email/DNI/badge; barra "Volver · ⋯ (Enviar Email, Dar de Baja) · Editar"; 6 pestañas a lo ancho (Datos Personales, Contacto, Laborales, Documentación, Diagramas, Indumentaria); un solo form con "Guardar cambios" abajo | Idéntica | **=** |
| Baja | ⋯ → "Dar de Baja Empleado" → AlertDialog motivo + fecha | Idéntico | **=** |
| Pre legajo / candidato | Lista "Nuevo Pre Legajo"; ficha con 4 pestañas; estados En proceso/Pre ingreso/Rechazado/Legajo creado; Sheet "Aprobar y crear legajo" | Igual, renombrado a "Candidato" en módulo Selección | ≈ |
| Diagramas | Cargados (buscador + grilla) · Cargar Diagrama ("Generar Diagrama") · Carga Masiva (3 pasos) · Reportes | Idéntico | **=** |

## 2. Unidades a rediseñar (alphataco, con archivo raíz)

- Página `/dashboard/employee`: `src/app/dashboard/employee/page.tsx:32` (SectionManagerServer `tab`; subtab Activos/Inactivos).
- Tabla de personas: `src/features/Employees/Empleados/EmployeeList/` (`EmployeeList.tsx:22`, `_EmployeeDataTable.tsx:119`, `columns.tsx:173`, `actions.server.ts`). tableId `employees-active` / `employees-inactive`.
- Diagramas: `src/features/Employees/Diagrams/EmployeesDiagram.tsx:10` (subtabs `old`, `new`, `massive_diagram`, `reports`).
- Selección: `src/app/dashboard/recruitment/page.tsx:21` → `features/Seleccion/` (lista `PreEmployeeList`, ficha `PreEmployeeDetailClient.tsx:83`, `RejectPreEmployeeDialog`, `ApprovePreEmployeeSheet`, checklist de documentos).
- Ficha: `src/app/dashboard/employee/action/page.tsx` → `features/Employees/EmpleadoID/components/EmployeeDetailClient.tsx:116` (header `EmployeeHeaderContent.tsx:13`, quick actions `employee-quick-actions.tsx:40`, pestañas, form único).
- Modales: baja/activar (`employee-quick-actions.tsx:126/151` + `shared/TerminationFormFields.tsx`, **compartido con Usuarios y Equipos**), anular entrega de ropa, subir documento del candidato, rechazar candidato, aprobar y crear legajo.

## 3. Guardado por sección (necesario para la ficha nueva)

Hoy hay una sola action `updateEmployee(id, EmployeeFormData)` que recibe todo: con un payload parcial falla
(`BigInt(province)`) o borra datos (`city` → null, `allocated_to` → []). Hace falta
`updateEmployeeSection(id, 'personal'|'contact'|'work', data)` que valide con el sub-schema en el servidor
(`personalDataSchema`, `contactDataSchema`, `employeeWorkDataSchema`), escriba solo esos campos y en laborales maneje
las M:M y `controlar_alertas_documentos_single_employee`. Los componentes de campos ya están separados por sección
(`PersonalDataFields`, `ContactDataFields`, `EmployeeWorkDataForm`). El alta sigue con el form completo.

## 4. Links entrantes que hay que redirigir o actualizar

- Ficha: tablas de Documentación, Dashboard (vencimientos, disponibles, ausentismo), Partes diarios (`ServiceDetailModal`, `HistoryModal`), Selección ("Ver legajo", post-aprobación), buscador "Ir a…".
- **Mail de vencimientos** `features/Jobs/templates/documents-expiry.ts:68-75` → redirección obligatoria.
- `RrhhSectionClient.tsx:81` → `?tab=diagrams&subtab=old&diagOld_*` (contrato de filtros).
- `revalidatePath` en `EmpleadoID/actions.server.ts`, `document-actions.ts`, `cancel.server.ts`, Selección (3 archivos).
- Manual: catálogo `sections/empleados.ts`, `sections/seleccion.ts`; `.mdx` de empleados, procesos y selección.
- `next.config.js:61` ya redirige `/dashboard/employee/pre-legajo`.

## 5. Hallazgos (a `hallazgos.md`)

- Sin permisos en el servidor: `createEmployee`, `updateEmployee`, `toggleEmployeeStatus`, mutaciones de diagramas, `createPreEmployee`, `updatePreEmployee`. La ficha no chequea permiso de página. La baja/activar no exige permiso.
- `ServiceDetailDialog.tsx:216` linkea a `/dashboard/employee/<id>` (404 hoy).
- "Enviar Email" deshabilitado sin email: su toast de error es inalcanzable.
- Huérfanos: `DiagramNewTypeForm.tsx`, `forms/employee-form.tsx`, `use-employee-form.ts`.
- `PRE_LEGAJOS_ROUTE='/dashboard/employee'` revalida la ruta equivocada.
- DRIFT del inventario: Indumentaria tiene columnas Estado, Depósito, Costo y acción "Anular".
