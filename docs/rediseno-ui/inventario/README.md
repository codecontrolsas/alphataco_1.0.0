# Inventario funcional "antes"

> Plan v2 (2026-10-09): la columna "Fase del plan" es del plan v1 (archivado). El orden vigente está en `../PLAN.md` §5.

Ficha de lo que la app hace HOY, pantalla por pantalla. Es el contrato del rediseño: cada `- [ ]` se prueba y se
tilda después de rediseñar su pantalla. Una ficha sin tildar = la fase no cerró (`PLAN.md` §3, punto 4).

Escrito desde el código el 2026-10-07 (sin pruebas en navegador). Si al rediseñar aparece algo que la ficha no
tiene, se agrega a la ficha antes de tocarlo.

| Archivo | Secciones | Checks | Fase del plan |
|---|---|---|---|
| `auth-y-errores.md` | 10 | 62 | 1 |
| `configuracion.md` | 44 | 566 | 6.1 |
| `empleados.md` | 13 | 231 | 6.2 |
| `seleccion.md` | 2 | 97 | 6.2 |
| `equipos.md` | 11 | 281 | 6.3 |
| `documentacion.md` | 9 | 177 | 6.4 |
| `operaciones.md` | 6 | 140 | 6.5 |
| `mantenimiento.md` | 14 | 151 | 6.6 |
| `comercial.md` | 14 | 148 | 6.7 |
| `formularios.md` | 8 | 76 | 6.8 |
| `dashboard.md` | 4 | 111 | 6.9 |
| `ayuda.md` | 4 | 108 | 6.10 |
| `almacenes.md` | 17 | 155 | 6.11 |
| `paneles-de-campo.md` | 20 | 198 | 4 (indumentaria) y 7 |
| **Total** | **176** | **2501** | |

Notas que cruzan módulos:
- Las tablas de documentos de empleados y de equipos son las mismas en `/dashboard/document`, en las fichas de
  empleado y de equipo, y en Equipos → Documentos de Equipos: cambiarlas impacta todas esas pantallas.
- **Equipos → Mantenimiento** (`/dashboard/equipment?tab=type_of_repairs`) es la vista del circuito anterior, pero
  **está viva**: monta 5 de las tablas viejas en uso. Se rediseña igual (el funcionamiento no cambia), aunque el
  manual no la documente.
- **Almacenes** (`almacenes.md`, relevado el 2026-10-08) modificó pantallas que ya tenían ficha: entregas de ropa
  (`paneles-de-campo.md` §3, `empleados.md` pestaña Indumentaria, `configuracion.md` Indumentaria), Gomería y el
  `OrderDetailDialog` (`mantenimiento.md`), cubiertas de la ficha del vehículo (`equipos.md`) y el detalle de OT del
  operario (`paneles-de-campo.md` §1). El detalle de cada cambio está en la sección "Afectaciones cruzadas" de
  `almacenes.md`: sumarlo a la ficha correspondiente antes de rediseñar esa pantalla.

## Tablas del sistema viejo (`BaseDataTable`): clasificación

**18 en uso → se migran al DataTable actual (Fase 5) · 9 huérfanas → se borran.**

| En uso | Dónde se monta | Versión nueva |
|---|---|---|
| `Empresa/Clientes/components/CustomersList` | Comercial → Clientes | no |
| `CustomerDetail/CustomerEquipmentTab`, `equipos/customerEquipmentTable` | ficha del cliente | no |
| `area_clientes/areaTable`, `sector_clientes/sectorTable` | ficha del cliente | no |
| `Services/ServiceTable` (2 lugares), `Services/ServiceItemsTable` | Comercial → Contratos | no |
| `meansure_units/MensureUnitsTable` | Comercial → Unidades de medida | no |
| `Operaciones/Certificacion/components/EnhancedComercialReportTable` | Comercial → Partes diarios | no |
| `Empresa/General/components/mantenimiento/talleres/TalleresTable`, `sectores/SectoresTable` | Configuración → Mantenimiento | no |
| `Mantenimiento/TiposReparaciones/RepairTypeForm`, `MaintenanceGroupsTable` | Configuración → Mantenimiento y Equipos → Mantenimiento | no |
| `Mantenimiento/Operaciones/components/OperacionesTableClient`, `OperacionesPlanificadasTableClient`, `ParaTaller/components/ParaTallerTableClient` | Equipos → Mantenimiento | cubiertas solo en parte por Seguimiento y Taller |
| `Employees/Empleados/components/tables/data/employees-table` | Comercial y Clientes | parcial (`_EmployeeDataTable`, sin filtro por cliente) |
| `Equipos/EquipoID/components/vehicle-operations-history` | ficha del vehículo | `OtherEquipmentMaintenanceTable` como modelo |

Al migrar se conservan la exportación a Excel y el selector de columnas que hoy vienen activos por defecto.

| Huérfana (se borra) | Reemplazo vigente |
|---|---|
| `Mantenimiento/Operaciones/components/OperacionesTable` | `OperacionesTableClient` |
| `Mantenimiento/Operaciones/components/OperacionesPlanificadasTable` | `OperacionesPlanificadasTableClient` |
| `PedidosMantenimiento/components/PedidosTable`, `PedidosTableClient` | Pendientes y Confirmados nuevos |
| `PedidosMantenimiento/Pendientes/components/PendientesTableClient` | `_PendingOrderDataTable` |
| `PedidosMantenimiento/Confirmados/components/ConfirmadosTableClient` | `_ConfirmedOrderDataTable` |
| `Planificacion/components/PlanificacionTableClient` (y la carpeta `Planificacion/`) | Taller → Por Programar |
| `MaintenanceOrders/components/MaintenanceOrdersClient` | `table/_MaintenanceOrderDataTable` |
| `OrderManagement/components/OrderManagementClient` | `ManageOrderWizard` (desde En Taller) |

Antes de borrar cada una: confirmar importadores con LSP `findReferences` (regla del repo).

## Código muerto detectado (se borra en Fase 9, confirmando importadores)

`Mantenimiento`: `OrderManagementTabContent` y su cadena (`OrderManagementList`, `_OrderManagementDataTable`,
`OrderManagement/columns.tsx`), `MaintenanceOrders/table/MaintenanceOrdersTableContent.tsx`,
`NuevoPedido/components/NuevoPedidoForm.tsx`, `SolicitudesMantenimiento/components/EntradaTallerDialog.tsx`,
`Pipeline/components/WorkflowPipeline.tsx` · `Empresa/General`: `talleres/TalleresTab.tsx`,
`sectores/SectoresTab.tsx` (copias), `CentrosDeCostos/table/column.tsx` (vacío) · `Operaciones`:
`PartesDiarios/components/BulkStatusModal.tsx` · `Employees`: `EmployeeForm`, `DiagramNewTypeForm`,
`use-employee-form` · `Dashboard`: 10 componentes de gráficos sin importadores · `Ayuda`: `ReportAnIssue.tsx`,
`useMyTicketsPage.ts` (CLI, ver D6) · Rutas sin enlaces entrantes (confirmar con el usuario antes de borrar):
`/dashboard/configuration/services/[id]`, `/contact`, `/contact/action`, `/forms/new`, `/forms/new/example`,
`/clothing/thanks`, `/reset_password/confirm`.

## Bugs previos encontrados

Cada archivo tiene su sección de rarezas/hallazgos al final. **No se arreglan en el rediseño** (el funcionamiento
no cambia): se listan en `PLAN.md` §9 para que el usuario decida si van como tickets.

<!-- estado: completo -->
