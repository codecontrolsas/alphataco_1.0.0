# Plan de refactor de Operaciones (auditoría 2026-10-14) — fuente para los agentes

Alcance: TODO `src/features/Operaciones/**` + consumidores. SIN cambiar comportamiento visible salvo lo decidido abajo. Sin tests, sin commits, sin lint/format, sin `tsc`/build/servidores dentro de los agentes (verifica el hilo principal). Migraciones SOLO en `alphataco_test` (rollback en `prisma/rollbacks/<nombre>/`, espejo en `prisma/sql/daily-report.sql`, equivalencia en BEGIN…ROLLBACK). `OP` = `src/features/Operaciones`.

## Decisiones del usuario

1. Comercial/Certificación: RECREAR la tabla con el DataTable actual (table-expert) y PAGINAR `getFilteredDailyReportRows` con tope; tipar formularios (`UseFormReturn<any>` ×4); evaluar mover `Certificacion` a Comercial.
2. Historial: UNIFICAR en el pipeline nuevo (`detail/history.server.ts` + `HistoryDialog`) con disparador delgado para Comercial. Detalle de línea: unificar SOLO el cascarón (`Field`, `EmptyValue`, `DetailSkeleton`, mapa de condiciones), manteniendo los campos de cada uno (Comercial: DNI/cargo; Operaciones: CUIL/jerarquía).
3. SQL de desvíos: SÍ optimizar (migración solo en alphataco_test): derivar los 4 contadores de los CTE, variante liviana para la UI sin `customer_equipment` ni `ORDER BY`, NO tocar `get_daily_report_deviations_indicator`, dejar marcado el Ticket 698. Mantener la salida JSON compatible con el mail.
4. Facets: migrar a lazy (`fetchFacet` + `getXxxSingleFacet`) en lista de pedidos y lista de partes.

## Escala

El parte real tiene 100–200 líneas; debe seguir funcionando si crece. Medido en alphataco_test con partes sintéticos (2030-01-01=100, 2030-01-02=2.000, 2030-01-03=20.000 líneas): tabla paginada ≤150 ms; `get_daily_report_deviations` = 58 ms/108 KB (100), 290 ms/2,1 MB (2.000), 2,3 s/21 MB (20.000); export de todo el parte 1,9 s a 20.000. Regla: ninguna consulta sin tope, payload de desvíos acotado, export en tandas.

## Hallazgos clave (del mapa)

- Comercial NO usa `get_daily_report_deviations`; hereda el tablero de Certificación (findMany sin `take` con 10 relaciones, `BaseDataTable`, form propio, `HistoryModal`/`ServiceDetailModal` legacy).
- Regla de desvíos copiada 4 veces: SQL `get_daily_report_deviations`, SQL `..._indicator` (no tocar), `PartesDiarios/lib/resource-deviations.ts`, `Jobs/templates/deviations.ts`; más `EmployeeSelector/columns.tsx:95-99`. Tipos duplicados: `Jobs/schemas/deviations.ts` (`employee_id`/`equipment_id` `z.string()`) vs `PartesDiarios/actions/validation.server.ts` (nullable) → bug latente en el mail: un único schema nullable-correcto en módulo SIN `'use server'`, tipos con `z.infer`.
- Dato muerto: `detail/lib/row-query.ts:351-385` trae `employees_diagram` por empleado por fila y ninguna columna lo usa.
- Facets bulk: `Preparte/list/actions.server.ts:302-495` (21 consultas por filtro), `_PreparteDataTable.tsx`, `PartesDiarios/list/*` (`getDailyReportFacets` se ejecuta dos veces en la primera carga).
- Muerto probable: `PartesDiarios/components/BulkStatusModal.tsx`, `hooks/useDailyReports.ts` (+index; solo se usa la constante `DAILY_REPORTS_QUERY_KEY`), `utils/utils.ts`, `fetchDailyReportsWithFilters`, `getDailyReportsForCurrentMonth`, `getEmployeesForForm/getVehiclesForForm/getOtherEquipmentForForm` (verificar con LSP/CodeGraph).
- Otras: `confirm()` nativo en `remitManager/components/DocumentViewer.tsx:15`; `<form>` nativo en `AddRemitDialog.tsx:71`; `useEffect` derivables en `PreparteBulkStatusModal`, `BulkStatusModal`, `RemitosManagerModal`, `LinkRemitoDialog`; `HistoryModal` fetch en efecto; `ServiceDetailDialog.tsx:109-112` formatea `Time` con `moment` local (la tabla usa `formatRowTime` UTC) → verificar y alinear; tipos manuales (`validation.server.ts`, `Preparte/types`, `daily-report-history.ts`, `remitManager/types`, `form-types.ts`, `ServiceDetailModal`); tipos `Cliente/Contrato/PreparteItem` exportados desde `PreparteManager.tsx` → mover a `Preparte/types`; dos `getDailyReportRowHistory` homónimas; `toFacetMap`/`crossWhere` copiadas 5 veces; `date-pickers`: verificar `PartesDiarios/components/DatePicker.tsx` (escritura directa) y moverlo a `src/shared/components` (lo usa `Employees/Diagrams/table/DiagramDetailTable.tsx:10`); `Jobs/lib/dates` debería vivir en `shared/lib`.

## Paquetes (archivos disjuntos entre sí)

- **P0** (hilo principal): crear `OP/lib/facets.ts` (`toFacetMap`, `buildCrossWhere` genérico) y `src/shared/lib/dates.ts` (contenido de `Jobs/lib/dates`, y `Jobs/lib/dates` re-exporta). Solo crea.
- **P1 Contrato único de desvíos**: crear `OP/PartesDiarios/schemas/deviations.ts` (sin `'use server'`); editar `PartesDiarios/actions/validation.server.ts`, `Jobs/schemas/deviations.ts`, `Jobs/templates/deviations.ts` (imports), `Jobs/jobs/daily-report-deviations.ts` si hace falta, `detail/hooks/useValidationData.ts`, `detail/columns/types.ts`, `EmployeeSelector/columns.tsx` (usar `resource-deviations.ts` para la clasificación de diagrama).
- **P2 SQL desvíos** (tras P1): solo `prisma/sql/daily-report.sql` + migración nueva + rollback + equivalencia en alphataco_test.
- **P3 Detalle paginado**: `detail/lib/row-query.ts` (sacar `employees_diagram`, separar `assert*InCompany` a `detail/lib/perimeter.ts`), `detail/queries.server.ts` (tabla de config de facets con `OP/lib/facets.ts`), `detail/export.server.ts` (export en tandas), `detail/types/index.ts`.
- **P4 Historial unificado** (antes de P5): `detail/components/HistoryDialog.tsx` (sin cambiar props), `detail/history.server.ts`, `components/HistoryModal.tsx` (borrar), `components/HistorySkeleton.tsx`, `types/daily-report-history.ts`, `actions/queries.server.ts` (quitar historial legacy), y SOLO las líneas del historial en `Certificacion/components/EnhancedComercialReportTable.tsx`.
- **P5 Comercial/Certificación** (tras P4): `Certificacion/**` + `Comercial/Comerce/components/DailyReportWrapper.tsx` + `Comercial/Comerce/ComerceTabContent.tsx` (+ `PartesDiarios/components/ServiceDetailModal.tsx` y `actions/comercial-rows.server.ts` si hace falta). table-expert.
- **P6 Listas lazy (table-expert)**: `PartesDiarios/list/**`, `Preparte/list/**`, `Preparte/components/{OrderStatusMetrics*,PreparteManager}.tsx`, `Preparte/constants.ts`.
- **P7 Pedidos acciones/forms**: `Preparte/actions/**` (menos `list/actions.server.ts`), `hooks/**`, `lib/**`, `schemas/**`, `types/**`, `components/{preparte-form/**,PreparteForm*,PreparteBulkStatusModal,PreparteConfirmForm,PreparteReportModal,OrderSummaryAside}.tsx`.
- **P8 Detalle de línea y remitos**: `detail/components/{ServiceDetailDialog,DailyReportRowForm/**,EmployeeSelector/**,EquipmentSelector/**,bulk-edit/**,clone/**}`, `detail/{form-data,mutations,clone}.server.ts`, `remitManager/**`.
- **P9 Limpieza** (al final): borrar muerto confirmado, mover `DatePicker` a shared, actualizar `actions.md`, `remitManager/README.md`, `prisma/sql/INVENTARIO.md`.
  Orden: P0 → {P1, P3, P6, P7, P8 en paralelo} → P2 → P4 → P5 → P9.

Queda fuera (ya revisado): `Preparte/components/order-detail/**`, `Preparte/NewOrder/**`, `detail/columns/{line-columns,badge-cells,index,status-columns}.tsx`, `shared/components/**`, `DailyReportProgress/StatusPills/AttentionBanner/AttentionSection/Header`.
