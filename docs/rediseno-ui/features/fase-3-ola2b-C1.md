# Fase 3 - ola 2b - agente C1 (Equipos)

Se agrego solo `meta.mobile` (28 columnas), copiando §3.6 tablas 2 a 5. Nada mas: sin filtros, formatters, celdas ni orden.

- `src/features/Equipos/Equipos/VehicleList/columns.tsx`: domain, intern_number, status, type, condition, contractor_equipment, kilometer (label `Km`).
- `src/features/Equipos/OtherEquipment/list/columns.tsx`: intern_number, serial_number, status, type, condition, contractor_other_equipment, linked_vehicle.
- `src/features/Equipos/Equipos/DadosDeBaja/Vehiculos/components/columns.tsx`: domain, intern_number, status, type, termination_date (`Baja`), reason_for_termination (`Motivo`), condition.
- `src/features/Equipos/Equipos/DadosDeBaja/OtrosEquipos/components/columns.tsx`: intern_number, serial_number, status, type, termination_date (`Baja`), reason_for_termination (`Motivo`), linked_vehicle.

`npm run check-types`: verde.

Desvios respecto de §3.6: ninguno.

Hallazgos para la Fase 6: las columnas `actions` de los 4 archivos solo tienen `excludeFromExport` (sin `title`); los 4 archivos no usan `fetchFacet` (no auditado, fuera de alcance).

<!-- estado: completo -->
