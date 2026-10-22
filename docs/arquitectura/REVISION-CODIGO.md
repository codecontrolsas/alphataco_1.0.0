# Revisión de calidad del código (loop)

Fuente de verdad del avance de la revisión de TODO el repo: duplicados, código muerto, SRP/SOLID y buenas prácticas. Se trabaja en una rama larga (`refactor/calidad-codigo`), con commits de una línea, sin empujar hasta juntar un lote grande, y verificando siempre con `check-types` (borrando `tsconfig.tsbuildinfo`), `npm test` y `next build`. Sin cambios de comportamiento.

## Reglas de esta revisión

- **Sin barriles**: ningún `index.ts` ni módulo que solo reexporte. Cada archivo importa del módulo donde el símbolo está definido (`@/features/X/archivo`). Los mocks de pruebas apuntan al módulo real.
- Un archivo o exportación sin ningún uso se **borra** (herramienta: `knip`, instalada fuera del repo en `/tmp/knipdir`, configuración con las rutas de Next como entradas). Lo que se carga por `import()` dinámico con `.then(m => m.X)` no lo ve `knip`: se verifica a mano antes de borrar.
- Lo repetido en más de un lugar se extrae a UN módulo compartido y se unifican todos los usos.
- Si una decisión es de producto, se anota abajo y se sigue.

## Inventario (archivos y líneas, sin tests)

| Módulo | Archivos | Líneas | Estado |
|---|---:|---:|---|
| src/features/Mantenimiento | 414 | 63539 | [ ] |
| src/features/Empresa | 316 | 43383 | [ ] |
| src/features/Purchases | 219 | 30336 | [ ] |
| src/features/Operaciones | 212 | 28069 | [ ] |
| src/features/Equipos | 135 | 21875 | [ ] |
| src/features/Treasury | 183 | 21596 | [ ] |
| src/features/Dashboard | 173 | 21093 | [ ] |
| src/features/Documentacion | 143 | 17428 | [ ] |
| src/features/Warehouses | 121 | 16050 | [ ] |
| src/features/Employees | 107 | 15103 | [ ] |
| src/features/Comercial | 95 | 12176 | [ ] |
| src/features/Ayuda | 137 | 10967 | [ ] |
| src/features/Clothing | 69 | 10858 | [ ] |
| src/features/Checklists | 28 | 6175 | [ ] |
| src/features/UserPermissionsManager | 39 | 5229 | [ ] |
| src/features/OperatorPanel | 25 | 4673 | [ ] |
| src/features/Formularios | 21 | 3874 | [ ] |
| src/features/Seleccion | 32 | 3823 | [ ] |
| src/features/Permissions | 12 | 3456 | [ ] |
| src/features/Auth | 18 | 2463 | [ ] |
| src/features/Jobs | 17 | 2229 | [ ] |
| src/features/Layout | 22 | 1882 | [ ] |
| src/features/ExternalApi | 10 | 1152 | [ ] |
| src/features/Notifications | 9 | 777 | [ ] |
| src/features/TabsManager | 7 | 745 | [ ] |
| src/features/MobileApi | 6 | 212 | [ ] |
| src/shared | 152 | 16124 | [ ] |
| src/components | 48 | 4930 | [ ] |
| src/lib | 6 | 580 | [ ] |
| src/app | 161 | 5041 | [ ] |
| scripts | 47 | 10759 | [ ] |

## Los 25 archivos más grandes (candidatos a SRP)

| Líneas | Archivo |
|---:|---|
| 1626 | src/features/Permissions/permissions-map.ts |
| 1200 | src/features/Warehouses/lib/stock-engine.ts |
| 1169 | src/features/Mantenimiento/MaintenanceOrders/pdf/MaintenanceOrderReportLayout.tsx |
| 1130 | src/features/Auth/utils/emailTemplates.ts |
| 860 | src/features/Mantenimiento/shared/components/ManualRepairsInput.tsx |
| 842 | src/features/Permissions/actions/roles.server.ts |
| 801 | src/features/Equipos/OtherEquipment/actions/actionsServer.ts |
| 758 | src/features/Mantenimiento/Gomeria/shared/iso/truck-geometry.ts |
| 744 | src/features/Purchases/actions/orders.server.ts |
| 720 | src/features/Checklists/pdf/layouts/NormalizedChecklistPDFLayout.tsx |
| 701 | src/features/Mantenimiento/Gomeria/Ordenes/components/ServiceOrderWizard.tsx |
| 698 | src/features/Mantenimiento/WorkshopView/WorkshopSectorTasksTable/actions.server.ts |
| 677 | src/components/ui/sidebar.tsx |
| 633 | src/features/Mantenimiento/ApprovalInbox/actions/actionsServer.ts |
| 627 | src/features/Documentacion/TiposDocumentos/components/_DocumentTypeFormModal.tsx |
| 626 | src/features/Purchases/actions/receipts.server.ts |
| 619 | src/features/Dashboard/Boards/components/_DashboardBoard.tsx |
| 617 | src/shared/components/common/DataTable/DataTable.tsx |
| 610 | src/features/Warehouses/actions/catalog.server.ts |
| 610 | src/features/Mantenimiento/Operaciones/actions/activity-log.server.ts |
| 609 | src/features/Mantenimiento/shared/components/critical-deviations-repair-modal.tsx |
| 604 | src/features/Mantenimiento/MaintenanceOrders/pdf/report-data.ts |
| 599 | src/features/Equipos/EquipoID/forms/vehicle-basic-data-form.tsx |
| 599 | src/features/Documentacion/TiposDocumentos/config/documentConditions.ts |
| 597 | src/features/Employees/Diagrams/Reports/actions.server.ts |

## Duplicación detectada (jscpd, solo lectura)

1296 clones, 23.666 líneas duplicadas (4,9 %) antes de empezar. Por familia: columnas de DataTable (5.786 líneas), acciones `*.server.ts` (5.199), clientes `_XDataTable` (3.837), formularios (1.889), skeletons (1.718), diálogos (893), secciones (760). Pares de módulos con más código en común: Purchases↔Warehouses (1.020), Purchases↔Treasury (600), Treasury↔Warehouses (305), Documentacion↔Equipos (274).

## Hecho

- [x] **Código muerto, pasada 3:** 44 archivos huérfanos (selectores antiguos del parte diario, secciones duplicadas de Checklists, kit de UI sin uso, utilidades legacy) y 4 más tras quitar los barriles (`TabsManager*`, `iso/react/live`), más ~105 exportaciones y tipos sin uso.
- [x] **Barriles eliminados (35):** `Permissions` (index y `actionsServer`), `DataTable/index`, `Checklists`, `TabsManager`, `Mantenimiento/*`, `Operaciones/*`, `shared/lib/mail`, `compliance`, `Jobs/lib/dates`, etc. 674 imports reescritos con un codemod (compilador de TypeScript) al archivo de origen.
- [x] **Skeletons de tabla:** 17 archivos idénticos reemplazados por `<TableSkeleton inCard columnCount rowCount />` (compartido).
- [x] **Reset de la demo** (rama heredada): conexión del dueño y empresa fijada en la transacción.

## En curso / siguiente

1. Columnas de DataTable repetidas (Documentacion↔Equipos, Equipos DadosDeBaja, Clothing, Dashboard): fábricas de columnas compartidas.
2. Acciones `*.server.ts` con la misma estructura (permiso + try/catch + logger): helper común.
3. Clientes `_XDataTable` y formularios/diálogos CRUD repetidos (Purchases, Warehouses, Treasury).
4. Archivos de más de 600 líneas: partir por responsabilidad.
5. Recorrido módulo por módulo con la lista de arriba (marcar la casilla al terminar).

## Decisiones de producto pendientes

(ninguna por ahora)
