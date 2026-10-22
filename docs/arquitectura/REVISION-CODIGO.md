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
| src/features/Mantenimiento          |      414 |  63539 | [ ]    |
| src/features/Empresa                |      316 |  43383 | [ ]    |
| src/features/Purchases              |      219 |  30336 | [x]    |
| src/features/Operaciones            |      212 |  28069 | [ ]    |
| src/features/Equipos                |      135 |  21875 | [ ]    |
| src/features/Treasury               |      183 |  21596 | [x]    |
| src/features/Dashboard              |      173 |  21093 | [ ]    |
| src/features/Documentacion          |      143 |  17428 | [ ]    |
| src/features/Warehouses             |      121 |  16050 | [x]    |
| src/features/Employees              |      107 |  15103 | [ ]    |
| src/features/Comercial              |       95 |  12176 | [ ]    |
| src/features/Ayuda                  |      137 |  10967 | [ ]    |
| src/features/Clothing               |       69 |  10858 | [ ]    |
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

## Pendiente detectado en Compras (para las pasadas de Almacenes, Tesorería y otros)

- Las tablas de Almacenes y Tesorería pueden adoptar `createFacetFilters` y `useServerTableView` (hoy solo cambiaron su `EMPTY_FACET`); Equipos, Formularios y Checklists también copian `EMPTY_FACET`.
- Acciones `*.server.ts` con la misma cabecera (permiso, `isUuid`, `safeParse`, empresa, try/catch con `toPurchaseActionError`): quedan sin envoltorio común porque cambiarían ~60 acciones a la vez; conviene hacerlo junto con el caso de uso por módulo de la arquitectura de instancias.
- `createPurchaseReceipt` (~220 líneas) y `registerPayment` (~180) siguen siendo funciones largas: se parten en pasos junto con sus pruebas de integración.
- `sendPurchaseOrder`, `sendPurchaseQuote` y `sendPaymentOrder` repiten "mail y después marcar enviada"; un `sendThenMark` común exige decidir si el estado de la orden de pago también se marca.

## Pendiente detectado en Almacenes y Tesorería

- `tire-stock.ts` (569 líneas), `ReconciliationView.tsx` (527) y las acciones de cheques (441 y 439) siguen por encima de ~430 líneas: se partirían con sus pruebas de integración.
- `OwnChecksList/columns.tsx` y `ChecksList/columns.tsx` repiten celdas (número, banco, importe, fechas); `MovementDetailSheet` y `RequestDetailSheet` repiten la escalera cargando/error/vacío; `DepositChecksDialog` y `DiscountChecksDialog` repiten el campo de cuenta bancaria. Cada caso es chico (10 a 30 líneas); no se extrajo.
- Acciones `*.server.ts` de Tesorería y Almacenes: la cabecera permiso + `safeParse` + sesión + try/catch sigue sin envoltorio común (no se aplicó para no cambiar ~60 acciones a la vez; ver la nota de Compras).
