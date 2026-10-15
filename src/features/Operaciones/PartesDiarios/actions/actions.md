# Acciones de `PartesDiarios/actions/`

Server actions que quedan en esta carpeta. Las del detalle de un parte (cabecera, líneas, historial, clonado,
exportación) viven en `../detail/` y las del listado en `../list/actions.server.ts`.

## `queries.server.ts`

| Función                | Descripción                                                            | Firma                                |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| checkDailyReportExists | Partes ya existentes para las fechas dadas (empresa activa).           | checkDailyReportExists(dates: string[]) |

## `mutations.server.ts`

| Función                        | Descripción                                          | Firma                                                 |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| createDailyReport              | Crea partes diarios para las fechas dadas.           | createDailyReport(dates: string[])                    |
| deleteDailyReport              | Elimina un parte diario si está vacío.               | deleteDailyReport(reportId: string)                   |
| updateMultipleDailyReportStatus | Actualiza el estado de varias filas de parte diario. | updateMultipleDailyReportStatus(ids: string[], status: string) |

## `validation.server.ts`

| Función                   | Descripción                                   | Firma                             |
| ------------------------- | --------------------------------------------- | --------------------------------- |
| getDailyReportDeviations  | Desvíos de recursos de un parte diario.       | getDailyReportDeviations(...)     |

## `comercial-rows.server.ts` (carga de líneas desde Comercial)

| Función                          | Descripción                                          |
| -------------------------------- | ---------------------------------------------------- |
| getCustomersForRowForm           | Clientes, servicios e ítems para el formulario.      |
| getActiveEmployeesForRowForm     | Empleados activos para asignar.                      |
| getActiveEquipmentsForRowForm    | Equipos activos para asignar.                        |
| createComercialDailyReportRow    | Crea una línea desde Comercial.                      |
| updateComercialDailyReportRow    | Actualiza una línea desde Comercial.                 |

## Historial de una línea

Un único pipeline: `getDailyReportRowHistory(rowId)` en `../detail/history.server.ts` (Prisma, perímetro de la
empresa activa) mostrado por `../detail/components/HistoryDialog.tsx`. Lo usan el detalle del parte y la tabla de
Comercial/Certificación. El tipo es `DailyReportHistoryEntry`.
