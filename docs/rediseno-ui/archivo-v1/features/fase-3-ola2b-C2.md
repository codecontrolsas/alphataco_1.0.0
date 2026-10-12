# Fase 3 — Ola 2b, agente C2: progreso

Modo rediseño (§4.0): solo `meta.mobile` y `selectionActions`. Sin filtros, `meta.title`, formatters ni migración de facetas.

- [x] Empleados: `Employees/Empleados/EmployeeList/columns.tsx` — `file`, `fullName`, `status`, `company_positions`,
  `termination_date` (solo inactivos), `hierarchy`, `contractor_employee`, `date_of_admission`.
- [x] Preparte: `Operaciones/Preparte/list/columns.tsx` — `numero_pedido`, `customer`, `status`, `service`,
  `executionDate`, `serviceItem`, `quantity`.
- [x] Facturación: `Comercial/Facturacion/list/columns.tsx` — `cbte_type`, `voucher_number`, `status`, `customer`,
  `total`, `issue_date`, `cae`.
- [x] `_PreparteDataTable.tsx`: "Cambiar estado" agregado a `selectionActions`.
- [x] `npm run check-types`: verde.

## Desvíos

- `fullName` ya tiene `meta.title: 'Nombre completo'` (la tabla de §3.6 asumía que no); se anotó igual `label: 'Nombre completo'`,
  equivalente al default.
- `selectionActions` en `types.ts` tiene firma `(selectedRows: Row<TData>[]) => ReactNode` (no el `ctx` de §3.5.4); se usó la real
  (`rows.map(r => r.original)`).
- "Cambiar estado" **no se movió**: quedó en `toolbarActions` Y en `selectionActions`, porque ninguna parte consume
  `selectionActions` todavía y moverlo lo haría desaparecer.

## Pendiente para la ola 2

Al integrar `selectionActions`, quitar el prop `toolbarActions` de `_PreparteDataTable.tsx` (comentario TRANSITORIO en el
archivo). Si no, con 0 seleccionados queda un "Cambiar estado" deshabilitado en la toolbar.

## Hallazgos para la Fase 6

- Preparte sigue con facetas bulk (`getPreparteFacets`, `options`/`externalCounts`, `isFetchingFacets`); no se migró.

<!-- estado: completo -->
