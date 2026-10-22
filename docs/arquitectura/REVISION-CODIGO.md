# Revisión de calidad del código (loop)

Fuente de verdad del avance de la revisión de TODO el repo: duplicados, código muerto, SRP/SOLID y buenas prácticas. Se trabaja en una rama larga (`refactor/calidad-codigo`), con commits de una línea, sin empujar hasta juntar un lote grande, y verificando siempre con `check-types` (borrando `tsconfig.tsbuildinfo`), `npm test` y `next build`. Sin cambios de comportamiento.

## Reglas de esta revisión

- **Sin barriles**: ningún `index.ts` ni módulo que solo reexporte. Cada archivo importa del módulo donde el símbolo está definido (`@/features/X/archivo`). Los mocks de pruebas apuntan al módulo real.
- Un archivo o exportación sin ningún uso se **borra** (herramienta: `knip`, instalada fuera del repo en `/tmp/knipdir`, configuración con las rutas de Next como entradas). Lo que se carga por `import()` dinámico con `.then(m => m.X)` no lo ve `knip`: se verifica a mano antes de borrar.
- Lo repetido en más de un lugar se extrae a UN módulo compartido y se unifican todos los usos.
- Si una decisión es de producto, se anota abajo y se sigue.

## Inventario (archivos y líneas, sin tests)

| Módulo                              | Archivos | Líneas | Estado |
| ----------------------------------- | -------: | -----: | ------ |
| src/features/Mantenimiento          |      414 |  63539 | [x]    |
| src/features/Empresa                |      316 |  43383 | [x]    |
| src/features/Purchases              |      219 |  30336 | [x]    |
| src/features/Operaciones            |      212 |  28069 | [x]    |
| src/features/Equipos                |      135 |  21875 | [x]    |
| src/features/Treasury               |      183 |  21596 | [x]    |
| src/features/Dashboard              |      173 |  21093 | [x]    |
| src/features/Documentacion          |      143 |  17428 | [x]    |
| src/features/Warehouses             |      121 |  16050 | [x]    |
| src/features/Employees              |      107 |  15103 | [x]    |
| src/features/Comercial              |       95 |  12176 | [x]    |
| src/features/Ayuda                  |      137 |  10967 | [ ]    |
| src/features/Clothing               |       69 |  10858 | [x]    |
| src/features/Checklists             |       28 |   6175 | [ ]    |
| src/features/UserPermissionsManager |       39 |   5229 | [ ]    |
| src/features/OperatorPanel          |       25 |   4673 | [ ]    |
| src/features/Formularios            |       21 |   3874 | [ ]    |
| src/features/Seleccion              |       32 |   3823 | [ ]    |
| src/features/Permissions            |       12 |   3456 | [ ]    |
| src/features/Auth                   |       18 |   2463 | [ ]    |
| src/features/Jobs                   |       17 |   2229 | [ ]    |
| src/features/Layout                 |       22 |   1882 | [ ]    |
| src/features/ExternalApi            |       10 |   1152 | [ ]    |
| src/features/Notifications          |        9 |    777 | [ ]    |
| src/features/TabsManager            |        7 |    745 | [ ]    |
| src/features/MobileApi              |        6 |    212 | [ ]    |
| src/shared                          |      152 |  16124 | [ ]    |
| src/components                      |       48 |   4930 | [ ]    |
| src/lib                             |        6 |    580 | [ ]    |
| src/app                             |      161 |   5041 | [ ]    |
| scripts                             |       47 |  10759 | [ ]    |

## Los 25 archivos más grandes (candidatos a SRP)

| Líneas | Archivo                                                                            |
| -----: | ---------------------------------------------------------------------------------- |
|   1626 | src/features/Permissions/permissions-map.ts                                        |
|   1200 | src/features/Warehouses/lib/stock-engine.ts                                        |
|   1169 | src/features/Mantenimiento/MaintenanceOrders/pdf/MaintenanceOrderReportLayout.tsx  |
|   1130 | src/features/Auth/utils/emailTemplates.ts                                          |
|    860 | src/features/Mantenimiento/shared/components/ManualRepairsInput.tsx                |
|    842 | src/features/Permissions/actions/roles.server.ts                                   |
|    801 | src/features/Equipos/OtherEquipment/actions/actionsServer.ts                       |
|    758 | src/features/Mantenimiento/Gomeria/shared/iso/truck-geometry.ts                    |
|    744 | src/features/Purchases/actions/orders.server.ts                                    |
|    720 | src/features/Checklists/pdf/layouts/NormalizedChecklistPDFLayout.tsx               |
|    701 | src/features/Mantenimiento/Gomeria/Ordenes/components/ServiceOrderWizard.tsx       |
|    698 | src/features/Mantenimiento/WorkshopView/WorkshopSectorTasksTable/actions.server.ts |
|    677 | src/components/ui/sidebar.tsx                                                      |
|    633 | src/features/Mantenimiento/ApprovalInbox/actions/actionsServer.ts                  |
|    627 | src/features/Documentacion/TiposDocumentos/components/\_DocumentTypeFormModal.tsx  |
|    626 | src/features/Purchases/actions/receipts.server.ts                                  |
|    619 | src/features/Dashboard/Boards/components/\_DashboardBoard.tsx                      |
|    617 | src/shared/components/common/DataTable/DataTable.tsx                               |
|    610 | src/features/Warehouses/actions/catalog.server.ts                                  |
|    610 | src/features/Mantenimiento/Operaciones/actions/activity-log.server.ts              |
|    609 | src/features/Mantenimiento/shared/components/critical-deviations-repair-modal.tsx  |
|    604 | src/features/Mantenimiento/MaintenanceOrders/pdf/report-data.ts                    |
|    599 | src/features/Equipos/EquipoID/forms/vehicle-basic-data-form.tsx                    |
|    599 | src/features/Documentacion/TiposDocumentos/config/documentConditions.ts            |
|    597 | src/features/Employees/Diagrams/Reports/actions.server.ts                          |

## Duplicación detectada (jscpd, solo lectura)

1296 clones, 23.666 líneas duplicadas (4,9 %) antes de empezar. Por familia: columnas de DataTable (5.786 líneas), acciones `*.server.ts` (5.199), clientes `_XDataTable` (3.837), formularios (1.889), skeletons (1.718), diálogos (893), secciones (760). Pares de módulos con más código en común: Purchases↔Warehouses (1.020), Purchases↔Treasury (600), Treasury↔Warehouses (305), Documentacion↔Equipos (274).

## Guion por módulo (lo que hace cada pasada)

1. **Leer** todos los archivos del módulo (carpeta por carpeta). Los clones de `jscpd` que lo tocan están en el scratchpad del loop (`mods/<Modulo>.txt`); los números de línea cambiaron con los refactors anteriores: volver a medir con `npx --yes jscpd@4 <ruta> --min-tokens 60 --min-lines 8 --ignore "**/generated/**,**/*.test.*" --reporters console`.
2. **Hallazgos, en este orden:** (a) código muerto: archivos, componentes, props, ramas y funciones sin uso (verificar con `grep`/LSP; `knip` en `/tmp/knipdir`); (b) duplicados, entre módulos primero: extraer a UN módulo compartido (`src/shared/...` si lo usan varios módulos, `<Modulo>/shared` si solo uno) y unificar TODOS los usos; (c) SRP: archivos de más de ~400 líneas o funciones de más de ~80 con varias responsabilidades; (d) DIP: lógica de negocio que depende de `next/*`, de la sesión o de `prisma` global (recibir el contexto/cliente por parámetro); (e) OCP: `if/switch` repetidos por tipo (tabla de configuración o mapa); (f) ISP: props o interfaces enormes; (g) tipos manuales que deben inferirse; (h) estados de carga/vacío/error, accesibilidad y reglas de `.claude/rules/*` en lo que se toque.
3. **Reglas duras:** sin cambios de comportamiento visible; sin barriles (nada de `index.ts` que reexporte); `'use server'` solo exporta funciones async; código en inglés y comentarios/UI en español; sin tests nuevos (los existentes tienen que seguir pasando); no tocar migraciones ni el contrato de `/api/mobile/v1`.
4. **Verificar:** `rm -f tsconfig.tsbuildinfo && NODE_OPTIONS=--max-old-space-size=8192 npm run check-types` (0 errores) y `npm test` (1494 pasan); si se tocó una acción con pruebas de integración, correr esa suite contra un Postgres descartable (`docker run postgres:16`, `prisma migrate deploy`, `node scripts/seed-company.ts --name X`, `node scripts/seed-auth-fixtures.ts`).
5. **Commits** de una línea, sin atribución, **sin empujar**. Al final marcar la casilla del módulo en la tabla de arriba y anotar abajo qué se hizo, qué se borró (líneas) y qué quedó pendiente o necesita decisión.

## Hecho

- [x] **Código muerto, pasada 3:** 44 archivos huérfanos (selectores antiguos del parte diario, secciones duplicadas de Checklists, kit de UI sin uso, utilidades legacy) y 4 más tras quitar los barriles (`TabsManager*`, `iso/react/live`), más ~105 exportaciones y tipos sin uso.
- [x] **Barriles eliminados (35):** `Permissions` (index y `actionsServer`), `DataTable/index`, `Checklists`, `TabsManager`, `Mantenimiento/*`, `Operaciones/*`, `shared/lib/mail`, `compliance`, `Jobs/lib/dates`, etc. 674 imports reescritos con un codemod (compilador de TypeScript) al archivo de origen.
- [x] **Skeletons de tabla:** 17 archivos idénticos reemplazados por `<TableSkeleton inCard columnCount rowCount />` (compartido).
- [x] **Reset de la demo** (rama heredada): conexión del dueño y empresa fijada en la transacción.
- [x] **Compras (`src/features/Purchases`):** duplicación medida con jscpd sobre Compras, Almacenes, Tesorería y `shared` (sin pruebas): de 364 clones y 5.520 líneas duplicadas (5,22 %) a 237 y 3.088 (2,94 %); 1.112.286 → 1.076.707 tokens (−3,2 %). Las líneas brutas casi no bajan (105.828 → 105.128) porque el formateo de los commits ensancha las líneas largas de los archivos sin formatear: la medida confiable son los tokens y los clones. Lo unificado, con los usos de Almacenes y Tesorería actualizados:
  - **Listas con DataTable (7 de Compras + pedidos de Almacenes):** `shared/lib/table-list-query.ts` (validación de filtros de la URL, orden `resolveSorts`, conteo de relaciones M:M, `SingleFacetResult`), `table-facet-lookups.ts` (opciones de perfiles), `Purchases/lib/list-facet-lookups.ts`, `list-filters.ts` (importe y número de comprobante, que estaban copiados 3 veces), `list-access.ts` (`companyIdIfCanView`) y `exportFailure` en `export-batches.ts` (20 acciones de export de los tres módulos). `isUuid` vive en `shared/lib/uuid.ts` (se borró `UUID_RE` de `action-errors`, de Tesorería y de Compras).
  - **Clientes `_XDataTable` y columnas:** `DataTable/facet-filters.ts` (`createFacetFilters`: fábrica de filtros `fixed`/`lookup` y `EMPTY_FACET`, que 12 tablas de Almacenes y Tesorería declaraban por su cuenta), `DataTable/useServerTableView.ts` (estado de vista, visibilidad inicial y props comunes), `DataTable/column-helpers.tsx` (`titled`, `matchesId`, `matchesAnyId`, `matchesNullableId`…), `Purchases/components/DocumentLinks.tsx` y `formatDateOnlyAr` en `argentina-time.ts` (13 copias).
  - **Formularios y diálogos:** `shared/components/common/form-fields.tsx` (`InputFormField`, `TextareaFormField`, `DateFormField`: ~70 campos de Compras, Almacenes y Tesorería), `name-catalog/NameFormDialog.tsx` (rubros, conceptos de gasto, categorías, unidades y conceptos de Tesorería), `Purchases/Settings/components/NameCatalogSection.tsx`, `ConfirmReasonDialog.tsx` (las tres confirmaciones con motivo de Compras, Almacenes y Tesorería), `DateRangeFields.tsx` (cuenta corriente de proveedores y clientes), `Purchases/components/period-report.tsx` (Libro IVA y Retenciones).
  - **Secciones y skeletons:** `TabsManager/section-tab.tsx` (`sectionTab`) reemplaza los arreglos de 10, 7 y 9 pestañas de Compras, Almacenes y Tesorería; `skeletons/SectionTableSkeleton.tsx` borra tres skeletons de sección y `PeriodReportSkeleton` dos más.
  - **PDF:** `pdf-layout.tsx` suma `PartyBox`, `WithholdingsTable`, `PaymentMethodsList` y `TotalLine`, y `pdf-text.ts` suma `pdfPaymentDetail`: el recibo de Tesorería ya no copia los estilos ni el encabezado de la orden de pago.
  - **Otros:** `unwrapAction` pasó a `shared/lib/unwrap-action.ts` (69 importadores; Compras ya no depende de Almacenes), `Permissions/lib/view-scope.server.ts` (alcance de solicitudes y pedidos), `Warehouses/lib/destination-search.ts` (búsqueda de destino en 4 listas) y `PURCHASES_PATH`, `SESSION_EXPIRED` y `TRANSACTION_OPTIONS` en `action-errors.ts`.
  - **Archivos partidos (todos los de Compras quedan bajo 425 líneas):** `lib/payments.ts` 642 → 332 (`payment-locks`, `payment-auto-withholdings`, `payment-revalidation`), `lib/due-invoices.ts` 517 → 230 (`-debts`, `-unified`), `actions/orders.server.ts` 744 → 404 (`order-writes`, `approval-notifications.server`, `order-send.server`), `requests.server.ts` 565 → 280 (`request-writes`, `request-from-material.server`), `receipts.server.ts` 626 → 423 (`receipt-queries.server`), `invoices.server.ts` 579 → 329 (`invoice-build`, `invoice-arca.server`), `invoice-queries.server.ts` 451 → ~220 (`invoice-detail.server`), `suppliers.server.ts` 424 → 282 (`supplier-queries.server`), `quotes.server.ts` 411 → 328 (`quote-send.server`), `PaymentOrderForm` 572 → 370, `RegisterPaymentDialog` 503 → 282, `PurchaseRequestForm` 447 → 237 y `PurchaseOrderForm` 431 → 281 (las filas de línea en archivos propios).
  - Verificación: `check-types` limpio, `npm test` (1494), las suites de integración de Compras, Tesorería y Almacenes contra un Postgres descartable (en serie: en paralelo se pisan entre sí) y `next build` compilando.
- [x] **Almacenes y Tesorería (`src/features/Warehouses`, `src/features/Treasury`):** jscpd sobre ambos módulos (sin pruebas): de 140 clones y 1.905 líneas duplicadas (4,22 %) a 96 y 1.374 (3,01 %); 483.957 → 476.986 tokens. `knip` no encontró archivos ni exportaciones sin uso en estos módulos; solo se borraron un import (`moment`) y un helper (`contains`) sin lectura que reportó `tsc --noUnusedLocals`.

  - **Tablas `_XDataTable` (13):** pasan a `createFacetFilters` (`fixed`/`lookup`, incluida la opción "Sin asignar") y `useServerTableView` (estado de vista, visibilidad inicial y props comunes); las 13 listas de columnas usan `titled` y `matchesId` en lugar de repetir encabezado y filtro. Las listas de acciones usan `toFacetMap` de `shared/lib/table-facets` (5 copias locales borradas).
  - **Almacenes:** `components/CatalogRowActions.tsx` (acciones de fila de depósitos y materiales) y `Settings/components/MaterialCatalogSection.tsx` (categorías y unidades) reemplazan cuatro componentes casi idénticos. `lib/action-errors.ts` suma `WAREHOUSE_PATH`, `NO_PERMISSION`, `firstIssue`, `nullable` e `isForeignKeyError` (la constante de la ruta estaba copiada en 5 acciones).
  - **Tesorería:** `lib/use-treasury-mutation.ts` (`useTreasuryMutation`: ejecuta la acción, invalida las queries del módulo, refresca la ruta y avisa el error) en 12 diálogos; `lib/action-errors.ts` suma `treasurySession` y `assertNotFuture` (copiadas en cheques, cheques propios y conciliación).
  - **Archivos partidos:** `lib/stock-engine.ts` 1.200 → 782 (`stock-locks.ts`: lecturas con lock y escritura de saldos; `stock-loans.ts`: devolución y baja de préstamos; `stock-destination.ts`: validación del destino). Solo se movieron funciones: el orden de locks documentado en `stock-engine.ts` no cambió (se verificó que el conjunto de líneas es el mismo) y las pruebas de integración del motor pasan. `actions/catalog.server.ts` 610 → `depots.server.ts` (196), `materials.server.ts` (251) y `catalog-settings.server.ts` (212). `actions/reconciliation.server.ts` 561 → 398 + `reconciliation-reads.server.ts` (255).
  - Verificación: `check-types` limpio, `npm test` (1494), suites de integración de Almacenes, Tesorería, Compras y Ropa contra un Postgres descartable (en serie) y `next build` compilando.

- [x] **Equipos (`src/features/Equipos`):** jscpd (sin pruebas, solo el módulo): de 104 clones y 2.307 líneas duplicadas (8,1 %) a 73 y 1.323 (5,04 %); 24.224 → 12.417 tokens duplicados. `knip` sin archivos ni exportaciones sin uso en el módulo; `tsc --noUnusedLocals --noUnusedParameters` encontró props y parámetros muertos (se borraron).
  - **Columnas:** `titled` (ahora con `extraMeta` para `excludeFromExport`) y el nuevo `matchesNullableColumnValue` (enum nullable, en `DataTable/column-helpers.tsx`) reemplazan ~140 encabezados y ~25 `filterFn` copiados; `matchesNullableId` para las FK. `components/cells.tsx` (antes `VehicleList/components/cells.tsx`) suma `ConditionCell`, `LabelBadgeCell`, `NameCell`, `NameBadgeCell`, `EquipmentIdentity`, `ViewRecordMenu`, `matchesContractor` y un `ContractorsCell` parametrizable; lo usan las cuatro tablas (vehículos, otros equipos y sus dados de baja). `lib/condition-config.ts` es el único dueño de íconos y variantes de condición: se borraron el reexport de `VehicleList/columns.tsx` y `OtherEquipment/list/column-helpers.tsx`.
  - **Tablas `_XDataTable` (4):** pasan a `createFacetFilters` + `useServerTableView`; `facet-filters.ts` suma `enumFilterOptions`, `textFilter` y `dateRangeFilter`. Las facetas de vehículos devuelven `resolvedOptions` como `{ id, name }` (el tipo común `SingleFacetResult`) y se borraron los `build*FacetResult` de `vehicle-list-client.ts`.
  - **Código muerto:** props `permissions`/`permissionsMap` de `VehicleList`, `VehicleTabContent` e `InactiveVehicleList`, y el parámetro `checked` de los dos formularios de afectación.
- [x] **Mantenimiento (`src/features/Mantenimiento`):** jscpd: de 126 clones y 2.390 líneas duplicadas (3,03 %) a 124 y 2.366 (3,04 %); 22.942 → 22.428 tokens (el módulo ya estaba cerca del piso por pasadas previas; lo grande quedó sin tocar, ver pendientes). Las ~85 columnas con `titled` y ~20 `filterFn` nullable pasaron a los compartidos.
  - **Código muerto:** `Gomeria/shared/TireDiagramRenderer.tsx` (307 líneas: un renderer sin uso y un reexport de tipos; `TireDiagramHitch` pasó a `tire-diagram-utils.ts` y los 6 importadores apuntan ahí), `getCachedExistingMaintenanceOrder`, `getMaintenanceRequestActivityLogCached`, `getWorkOrderActivityLogCached`, `getGroupTypeIds`, `ORDER_NUMBER_TABS`, `FOCUS_RING`, `PrismaLike`, tipos sin uso de `MaintenanceOrders/table/columns.tsx` y de `critical-deviations-repair-modal.tsx`, `handleDescriptionChange` de `useWizardItems` y las props `onDescriptionChange` (paso 1) y `sectors` (paso 4) del asistente de órdenes, más ~25 imports sin uso.
  - Verificación: `check-types` limpio, `npm test` (1494) y `next build` compilando. No se tocaron acciones con lógica de escritura, por eso no se corrieron las suites de integración.
- [x] **Documentación y Empresa (`src/features/Documentacion`, `src/features/Empresa`):** jscpd por módulo (sin pruebas): Documentación 38 clones y 577 líneas duplicadas (2,92 %); Empresa 196 y 3.730 (7,01 %). `knip` solo marcó dos exportaciones duplicadas (default + nombrada) y `tsc --noUnusedLocals --noUnusedParameters` encontró props, variables e imports muertos (se borraron).
  - **Documentación:** `lists-shared/document-columns.tsx` (documento, estado, subido el, afectado a, mandatorio, multirecurso, período, motivo de rechazo, acciones, legajo y empleado) reemplaza ~900 líneas copiadas en las cuatro `columns.tsx` de empleados y equipos (permanentes y mensuales); `TiposDocumentos/components/_DocTypesDataTable.tsx` reemplaza los tres clientes de personas, equipos y empresa (una tabla con la configuración por `document_applies`); las cuatro tablas de documentos pasan a `useServerTableView` y se borró `useDocumentListTable`.
  - **Empresa:** `components/catalog-columns.tsx` (`nameColumn`, `activeStatusColumn`, `createdAtColumn`, `editActionColumn`, `RowLinkButton`) en 12 `columns.tsx` de catálogos; 11 clientes `_XDataTable` pasan a `useServerTableView` y al nuevo `Permissions/hooks/usePermissionChecker.ts`; `titled` reemplaza 161 encabezados repetidos en Empresa y Documentación.
  - **Código muerto:** props `expires` (Eliminar/Reemplazar documento) e `id` (Reemplazar), `CLIENT_SELECT`, `nameMap`, variables y estado sin uso (`banWithEmployee`, `watch`, `setValue`, `reset`, `checklistsError`, `logger`).
  - Verificación: `check-types` limpio, `npm test` (1494) y `next build` compilando. No se tocó lógica de acciones de escritura, por eso no se corrieron las suites de integración.
- [x] **Ropa y Dashboard (`src/features/Clothing`, `src/features/Dashboard`):** jscpd sobre ambos módulos (sin pruebas): de 123 clones y 2.611 líneas duplicadas (6,42 %) a 35 y 508 (1,36 %); 26.714 → 4.813 tokens duplicados. `knip` sin hallazgos y `tsc --noUnusedLocals --noUnusedParameters` solo marcó un `import { prisma }` sin uso (`Clothing/actions/session.server.ts`, borrado).
  - **Ropa, tablas de entregas (historial del empleado, todas las entregas y reportes):** `components/delivery-columns.tsx` (selección, fecha, tipo, estado, personas y legajos, artículos, depósito, costo, firma, notas y acciones: ~600 líneas copiadas en tres `columns.tsx`), `lib/delivery-list-query.ts` (select de personas y artículos, filtros por persona y legajo, facetas de tipo, estado, depósito y persona), `lib/delivery-table-config.ts` (opciones de tipo, filtro de firma y formateadores de exportación) y `components/DeliveriesTable.tsx` (`DataTable` con buscador, selección y barra de descarga masiva). Las tres tablas pasan a `createFacetFilters` + `useServerTableView` + `usePermissionChecker`, y las acciones a `resolveSorts`, `toFacetMap` y el nuevo `createCrossWhere` de `shared/lib/table-facets.ts` (el cross-filter de las facetas, copiado en cada `*SingleFacet`).
  - **Ropa, catálogo (marcas, artículos, talles):** `components/catalog-columns.tsx` (nombre, estado, fecha de creación y acciones editar / activar), `hooks/useCatalogTable.ts` (permisos, diálogo y activar/desactivar), `lib/catalog-list-query.ts` (el `where` por empresa y la faceta de estado) y `components/ClothingNameFormDialog.tsx` (los formularios de marca y talle quedan como configuración). Cinco skeletons idénticos pasan a `fallback/ClothingTableSkeleton.tsx`. `CancelDeliveryDialog` usa `ConfirmReasonDialog`.
  - **Dashboard, documentos por vencer:** `Documentacion/components/expiring-doc-columns.tsx` (tipo de documento, vencimiento, estado, fecha de carga, enlace y filtros comunes) y `ExpiringDocsDataTable.tsx`: las tablas de empleados y equipos quedan en ~60 líneas cada una.
  - **Dashboard, Estadísticas:** `shared/charts/period-controls.tsx` (`getBucketKey`, `getDataWindow` y el selector de mes y agrupación) reemplaza lo copiado en "Histórico de servicios" (Operaciones) y "Gestión de pedidos" (Sala de Control): cada gráfico conserva su ventana (`MONTHS_BACK`). `RecursosHumanos/components/absence-cells.tsx` (porcentaje de ausentismo y botón "Ver ausentes").
  - **Dashboard, Principal:** `components/VehicleListDialog.tsx` (los diálogos de equipos disponibles y fuera de servicio), `shared/charts/DonutCenter.tsx` (total en el centro de las tres donas), `AvailableEmployeesDialog` con `createFacetFilters`.
  - **Archivos partidos:** `Boards/components/_DashboardBoard.tsx` 619 → 490 (`_SortableWidget.tsx`), `Principal/actions/fleet.server.ts` 547 → 103 (+ `fleet-lists.server.ts` con las tablas de los diálogos y `lib/today-report-vehicles.ts`) y `rrhh.server.ts` 575 → 153 (+ `rrhh-lists.server.ts`). No se cambió ningún cálculo, ventana ni consulta de los gráficos y KPIs.
  - Verificación: `check-types` limpio, `npm test` (1494), `next build` compilando y, contra un Postgres descartable, una prueba temporal (no se conserva) que ejecutó las listas, exportaciones y facetas de entregas y catálogo con filtros, búsqueda y orden.
- [x] **Operaciones (`src/features/Operaciones`):** jscpd (sin pruebas, solo el módulo): de 36 clones y 494 líneas duplicadas (1,35 %) a 22 y 255 (0,71 %); 5.216 → 2.625 tokens duplicados. `knip` sin hallazgos en el módulo; `tsc --noUnusedLocals --noUnusedParameters` encontró imports, tipos, funciones y props muertos (se borraron: `RowToClone`, `invalidCommand`, `toPgTime`, props `isLoading` de `LocationSection`/`CustomerContractSection`, ~30 imports de las secciones del pedido). No se tocaron firmas, códigos de error ni idempotencia de `detail/use-cases/*`.
  - **Facetas y filtros de las líneas del parte:** `lib/row-facets.ts` (`SHARED_ROW_FACETS`: estado, tipo de servicio, jornada, cliente, servicio, ítem y sector, copiados en el tablero de certificación y en el detalle), `lib/row-facet-options.ts` (`buildRowFacetResult`, `rowStatusIcons`: las opciones de los filtros y los iconos de estado, que estaban en `useCertificationFacets` y `useDetailFacets`), `lib/customer-services.ts` (`activeValidServices`, `activeServiceItems`: servicios y ítems vigentes del cliente, copiados en el formulario del detalle y en el de certificación).
  - **Tablas:** las tres de PartesDiarios (lista, detalle) y Certificación pasan a `useServerTableView`, `createFacetFilters`/`enumFilterOptions`/`dateRangeFilter` (lista de partes) y `usePermissionChecker`; `titled` reemplaza 64 encabezados con `meta.title` y `matchesId`/`matchesNullableId`/`matchesAnyIdOrNone` 17 `filterFn` (se borraron `matchesNullable` y `matchesAny` locales de Certificación). La tabla de pedidos (Preparte) conserva su `handleStateChange` propio (limpia la selección al cambiar filtros) y sus facetas devuelven `{ value, label }`, por eso no usa `useServerTableView` ni `createFacetFilters`.
  - **Detalle del parte:** `columns/employee-columns.tsx` pasa de 4 columnas copiadas a `driverColumn` y `helperColumn`; `completedColumn` (día y noche) en `status-columns.tsx`; `LoadingBadge`, `AssignedBadge` y `DeviationBadge` en `badge-cells.tsx`; `equipment/EquipmentChip.tsx` (`EquipmentChip`, `ChipBadge`, `toggleId`) en los campos de equipos propios y otros equipos; `RowColorLegend` acepta `showDeviations` y la usa Certificación; los horarios usan `InputFormField`.
  - **Archivos partidos:** `Preparte/actions/mutations.server.ts` 573 → 321 (`lib/preparte-references.ts`: validación de perímetro y traducción de sector/área; `actions/move-preparte-file.server.ts`: la imagen del pedido, la prueba de integración apunta al archivo nuevo); `HistoryDialog.tsx` 567 → 116 (`history/history-helpers.tsx` y `history/HistoryEntry.tsx`). Ningún archivo del módulo supera las 520 líneas.
  - Verificación: `check-types` limpio, `npm test` (1494) y `next build` compilando. No se tocó lógica de escritura de los casos de uso (solo se movieron funciones de Preparte), por eso no se corrieron las suites de integración (la única del módulo, `move-preparte-file`, necesita RustFS).
- [x] **Empleados y Comercial (`src/features/Employees`, `src/features/Comercial`):** jscpd sobre ambos módulos (sin pruebas): de 17 clones y 187 líneas duplicadas (0,59 %) a 13 y 135 (0,39 %); 341.016 → 333.962 tokens. `knip` sin hallazgos en los dos módulos; `tsc --noUnusedLocals --noUnusedParameters` solo marcó `MassiveFormDataBase` (borrado). Las pasadas previas ya habían unificado casi todo lo que cruzaba módulos.
  - **Tablas:** `_EmployeeDataTable`, `_DiagramReportsDataTable`, `_CertificationsDataTable` y `_InvoicesDataTable` pasan a `createFacetFilters` (`fixed`/`lookup`), `enumFilterOptions`, `textFilter`, `dateRangeFilter` y `useServerTableView`; la de empleados usa además `usePermissionChecker`. Se borraron los `makeEnumFetchFacet`/`makeFkFetchFacet`/`build*FacetResult` locales y la fusión manual de visibilidad (~350 líneas).
  - **Exports:** las acciones de export de certificaciones y comprobantes usan `exportFailure`.
  - **Formularios:** `SelectFormField` en `shared/components/common/form-fields.tsx` (selector de catálogo `{ id, name }` con skeleton, `disabled` y `onValueChange`); lo usa el formulario de datos laborales del legajo (9 selectores, 560 → 385 líneas).
  - **Archivos partidos:** `Diagrams/Reports/actions.server.ts` 597 → 342 (`Reports/lib/report-query.ts`: filtros permitidos, orden, select, `buildWhereClause` y `toReportRow`). Solo se movieron funciones.
  - Verificación: `check-types` limpio, `npm test` (1494) y `next build` compilando. No se tocó lógica de escritura ni firmas de casos de uso; por eso no se corrieron las suites de integración.

## En curso / siguiente

1. Columnas de DataTable repetidas (Documentacion↔Equipos, Equipos DadosDeBaja, Clothing, Dashboard): fábricas de columnas compartidas.
2. Acciones `*.server.ts` con la misma estructura (permiso + try/catch + logger): helper común.
3. Clientes `_XDataTable` y formularios/diálogos CRUD repetidos (Purchases, Warehouses, Treasury).
4. Archivos de más de 600 líneas: partir por responsabilidad.
5. Recorrido módulo por módulo con la lista de arriba (marcar la casilla al terminar).

## Decisiones de producto pendientes

- **Compras, filtros visibles guardados:** las tablas de Recepciones, Solicitudes, Proveedores, Órdenes de pago y Vencimientos ignoran la preferencia guardada de filtros visibles (`initialFilterVisibility` llega y no se usa); Órdenes, Cotizaciones y Facturas sí la aplican. Es un defecto previo que se conservó para no cambiar el comportamiento: se corrige pasando `savedFilterVisibility` a `useServerTableView` en esas cinco tablas.
- **Compras, búsqueda de comprobante en Vencimientos:** al unificar `voucherNumberWhere`, un punto de venta o número fuera de rango en Vencimientos ahora devuelve una lista vacía (como ya hacía Facturas) en vez de un error.

- **Almacenes, `companyId` sin uso:** `createMaterialCategory` y `createMeasurementUnit` (`actions/catalog-settings.server.ts`) llaman a `getActiveCompanyId()` y no usan el resultado. Se dejó la llamada (puede lanzar si no hay empresa activa); se puede borrar si se confirma que no hace falta.

- **Equipos y Mantenimiento, presentación distinta por tabla (conservada):** el tooltip de afectaciones es negro (`bg-black`) en los otros equipos y con el estilo por defecto en los vehículos; el texto vacío es "Sin afectar" en Otros equipos activos y "-" en el resto; el "Año" es monoespaciado en vehículos activos y texto plano en las demás tablas; el badge de "Motivo de baja" es `secondary` en vehículos activos y texto plano en las bajas. `ContractorsCell` conserva esas diferencias con props (`emptyText`, `tooltipClassName`); se unifican si se decide un criterio.
- **Mantenimiento, descripciones del asistente de órdenes:** `pendingChanges.descriptionUpdates` de `useWizardItems` se sigue enviando al guardar pero ya no hay quien lo llene (nadie llamaba a `handleDescriptionChange`). Se puede borrar el camino completo si se confirma que la descripción de la tarea ya no es editable.
- **Mantenimiento, `getItemComments(item, source, …)`:** el parámetro `source` no se lee; lo pasan 3 llamadores y la prop `source` de `ItemComments` que consumen ~8 diálogos. Se puede quitar en cascada.

- **Ropa y Dashboard, filtro "Estado" de marcas, artículos y talles:** `is_active` llega como texto (`'true'`/`'false'`) a `buildFiltersWhere` y Prisma lo rechaza ("Expected Boolean, provided String"): elegir un estado en esas tres tablas falla. Es un defecto previo que se conservó; se corrige convirtiendo `is_active` a booleano en `buildClothingCatalogWhere` (`Clothing/lib/catalog-list-query.ts`).
- **Ropa, presentación distinta por tabla (conservada):** el badge de "Inactivo" es gris con `opacity-60` en marcas y artículos y rojo en talles; el nombre inactivo va tachado en marcas y artículos y en negrita en talles; el filtro "Estado" de talles no lleva íconos y solo muestra ese filtro por defecto; la tabla de talles no tiene buscador. Los parámetros de `catalogNameColumn` y `catalogActiveColumn` guardan esas diferencias.
- **Ropa, facetas si la consulta falla:** al unificar con `createFacetFilters`, una faceta de estado, tipo de entrega o firma que falla en el servidor muestra la lista vacía (antes mostraba las opciones sin conteos). Solo cambia el caso de error.
- **Dashboard, Estadísticas:** "Histórico de servicios" abre las vistas semanal y mensual con 2 meses previos y "Gestión de pedidos" con 0 y 5; los rótulos de período usan guion "-" en uno y raya "–" en el otro. Se conservaron; se unifican si se decide un criterio.
- **Ropa, el filtro de firma cuenta solo la página visible** en el historial del empleado y en todas las entregas (se calcula con las filas cargadas, no en el servidor, como en reportes).

- **Operaciones, Certificación y detalle del parte, colores de fila:** la prioridad es distinta. En el detalle una línea editada por Comercial gana sobre la agregada después de la fecha del parte; en Certificación gana la agregada después. Se conservó (`getRowClassName` y `getCertificationRowClassName`); si se decide un criterio, se unifica en un solo helper.
- **Operaciones, presentación distinta por tabla (conservada):** el tooltip de "asignado correctamente" tarda 100 ms en empleados y 300 ms en equipos del detalle; el área se rotula con `descripcion_corta` en el detalle y con `nombre` en Certificación; el filtro de equipo propio de Certificación solo cuenta vehículos y el del detalle suma otros equipos. Por eso `SHARED_ROW_FACETS` no incluye `area`, `equipment` ni `employees`.
- **Operaciones, `Preparte/list`:** la acción `getPreparteSingleFacet` devuelve `resolvedOptions` como `{ value, label }` y no como el `SingleFacetResult` común (`{ id, name }`); unificarlo permitiría usar `createFacetFilters` en la tabla de pedidos.
- **Empleados, tabla de empleados y Reportes de novedades:** el `value` del selector de tipo de documento, nacionalidad, país y sexo en `PersonalDataFields` es controlado (`value` + `defaultValue`) y el de `SelectFormField` solo usa `defaultValue`; no se unificaron para no cambiar cuándo se repinta el valor. Pendiente decidir cuál es el correcto.
- **Comercial, archivos grandes sin partir:** `Facturacion/lib/emission.server.ts` (548; `issueInvoice` ocupa ~230 líneas del flujo fiscal) y `Certificaciones/actions/certifications.server.ts` (512) se dejaron enteros por riesgo (emisión ARCA); partirlos pide pruebas de integración con Postgres.
- **Comercial, esqueleto de la lista de certificaciones:** `CertificationsTableSkeleton` es casi `TableSkeleton inCard` pero con `aria-busy`/`aria-label` y otro ancho de buscador; se conserva hasta decidir si `TableSkeleton` acepta etiqueta accesible.

## Pendiente detectado en Compras (para las pasadas de Almacenes, Tesorería y otros)

- Las tablas de Almacenes y Tesorería pueden adoptar `createFacetFilters` y `useServerTableView` (hoy solo cambiaron su `EMPTY_FACET`); Equipos, Formularios y Checklists también copian `EMPTY_FACET`.
- Acciones `*.server.ts` con la misma cabecera (permiso, `isUuid`, `safeParse`, empresa, try/catch con `toPurchaseActionError`): quedan sin envoltorio común porque cambiarían ~60 acciones a la vez; conviene hacerlo junto con el caso de uso por módulo de la arquitectura de instancias.
- `createPurchaseReceipt` (~220 líneas) y `registerPayment` (~180) siguen siendo funciones largas: se parten en pasos junto con sus pruebas de integración.
- `sendPurchaseOrder`, `sendPurchaseQuote` y `sendPaymentOrder` repiten "mail y después marcar enviada"; un `sendThenMark` común exige decidir si el estado de la orden de pago también se marca.

## Pendiente detectado en Almacenes y Tesorería

- `tire-stock.ts` (569 líneas), `ReconciliationView.tsx` (527) y las acciones de cheques (441 y 439) siguen por encima de ~430 líneas: se partirían con sus pruebas de integración.
- `OwnChecksList/columns.tsx` y `ChecksList/columns.tsx` repiten celdas (número, banco, importe, fechas); `MovementDetailSheet` y `RequestDetailSheet` repiten la escalera cargando/error/vacío; `DepositChecksDialog` y `DiscountChecksDialog` repiten el campo de cuenta bancaria. Cada caso es chico (10 a 30 líneas); no se extrajo.
- Acciones `*.server.ts` de Tesorería y Almacenes: la cabecera permiso + `safeParse` + sesión + try/catch sigue sin envoltorio común (no se aplicó para no cambiar ~60 acciones a la vez; ver la nota de Compras).

## Pendiente detectado en Equipos y Mantenimiento

- Las columnas comunes de las cuatro tablas de equipos (tipo, subtipo, marca, modelo, propietario, sector, centro de costo) siguen escritas en cada `columns.tsx` (~85 y ~70 líneas repetidas entre `OtherEquipment/list` y las bajas); una fábrica `relationColumn({ id, title, getName, getId, display })` las reduciría a una línea cada una.
- Mantenimiento: `Gomeria/Marcas` y `Gomeria/Tipos` (`_MarcasDataTable`/`_TiposDataTable`, columnas y `*-list.server.ts`, ~100 + 70 líneas) son el mismo "catálogo con activar/desactivar"; y `Gomeria/shared/facet-helpers.ts` repite lo de `createFacetFilters`. `OrderManagement/actions/queries.server.ts` (85 y 55 líneas internas), `NuevoPedido/actions/orders.server.ts` vs `requests.server.ts` (~47 líneas repetidas) y `ApprovalInbox/actions/actionsServer.ts` (633 líneas) piden extraer helpers de consulta con sus pruebas de integración.
- Archivos de Mantenimiento por encima de ~600 líneas que no se partieron: `MaintenanceOrderReportLayout.tsx` (1.169), `ManualRepairsInput.tsx` (860), `truck-geometry.ts` (758), `ServiceOrderWizard.tsx` (701), `WorkshopSectorTasksTable/actions.server.ts` (698).
- `Empresa/Clientes/lib/status-config.ts` tiene su propio `conditionIcons`/`conditionVariants`, igual a `Equipos/lib/condition-config.ts`.

- **Documentación, `mode` sin uso:** `resolveDocumentTypeAccess` (`TiposDocumentos/lib/document-type-policy.ts`) y `catalog-scope.ts` de Empresa/Equipos reciben `mode` y no lo leen; lo pasan sus pruebas. Se dejó para no editar pruebas.
- **Empresa, `company_id` sin uso:** `createDiagramType` (`RRHH/DiagramTypes/actions.server.ts`) llama a `getActiveCompanyId()` y no usa el resultado (puede lanzar sin empresa activa). Se dejó la llamada.
- **Empresa, nombre de fila nulo:** el nombre accesible del botón "Editar" de puestos decía "Editar null" con nombre nulo; se conserva.

## Pendiente detectado en Documentación y Empresa

- `usePermissionChecker` solo se aplicó en las tablas de catálogos de Empresa; otros ~40 archivos (Clothing, Employees, Mantenimiento/Gomeria, Operaciones, Formularios, Dashboard, Clientes, Usuarios) siguen armando `hasPermission` a mano.
- Clientes `_XDataTable` de Empresa que no se migraron a `useServerTableView`: `EquipmentOwner`, `VehiclesByOwner`, `Customers`, `ExternalApiClients`, `Users`, `CustomerEmployees` y `CustomerEquipment` (calculan la visibilidad de filtros desde los filtros o con lista propia).
- Formularios de catálogo de Empresa (`EquipmentBrandForm`, `CostCenterForm`, `ContractTypeForm`, `DiagramTypeForm`, `TalleresForm`, `SectoresForm`: 40 a 78 líneas repetidas cada par), acciones `*.server.ts` de catálogos (`CostCenter`, `Hierarchy`, `Positions`, `WorkDiagrams`, 20 a 27 líneas), modales `Add*Modal` de CCT y skeletons de tabla de RRHH/Equipos: sin extraer.
- Skeletons de Documentación (`Monthly*`/`*Permanent*DocumentsSkeleton`) y `_EmployeeConditions`/`_EquipmentConditions` repiten 20 a 30 líneas; `_DocumentTypeFormModal.tsx` (627) y `documentConditions.ts` (599) siguen sin partir.

## Pendiente detectado en Ropa y Dashboard

- `Dashboard/Estadisticas/Mantenimiento/actions/actions.server.ts` (559 líneas) agrupa cinco acciones independientes (resumen, categoría, por tipo, origen y clase): se partiría por tarjeta, con sus importadores.
- `RecursosHumanos/components/AbsenteeismTrendChart.tsx` y `HeadcountTrendChart.tsx` (y sus `charts/*-trend-chart.tsx`) repiten el marco (tarjeta, rango, carga y error, ~20 líneas) pero el cálculo de tendencia difiere: no se tocó.
- `Dashboard/Estadisticas/Operaciones/components/ClientRankingChart.tsx` y `SalaDeControl/components/OrderManagementBarChart.tsx` comparten ~26 líneas de gráfico de barras; los botones de métricas de los dos clientes (`OperacionesChartsClient`, `OrderManagementClient`) difieren en el diseño, por eso no se unificaron.
- `Clothing/actions/session.server.ts` y `OperatorPanel/actions/session.server.ts` repiten el login por correo y empleado (~30 líneas) con reglas distintas (sector de taller vs. empleado).
- `Dashboard/Estadisticas/KPIs/Indicadores/actions.server.ts` repite ~40 líneas de la consulta de listas con las de Ropa, Selección y Operaciones (`where` + orden + faceta); entra en el helper de listas de acciones pendiente de la sección de Compras.
- Archivos de más de 500 líneas que quedan: `Dashboard/lib/widget-registry.ts` (537, tabla de configuración de widgets) y `Dashboard/Estadisticas/Mantenimiento/actions/actions.server.ts` (559).

## Pendiente detectado en Operaciones

- `PartesDiarios/list/actions.server.ts` y `Preparte/list/actions.server.ts` repiten la cabecera de lista (`sanitizeFilters`, rango de fechas, `toFacetMap`, conteo y export por tandas, ~12 líneas) y `comercial-rows.server.ts` vs `Preparte/actions/mutations.server.ts` repiten la verificación de perímetro de cliente/contrato/ítem/equipo (~11 líneas): entran en el helper de listas de acciones pendiente de Compras.
- `EmployeeSection.tsx` (dos bloques de campo de rol de ~20 líneas), `report-workbook.ts` (dos tramos de ~10 líneas) y `CustomerContractSection`/`LocationSection` (campos de 8 a 18 líneas) quedan con repeticiones internas chicas.
- Archivos más grandes del módulo: `Preparte/list/columns.tsx` (511), `Preparte/list/actions.server.ts` (448), `PartesDiarios/detail/clone.server.ts` y `queries.server.ts` (~440): sin costuras claras que justifiquen partirlos.
