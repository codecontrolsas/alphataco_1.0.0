# Fase 3 - Ola 2b - C3 (Documentación)

Solo `meta.mobile` (§3.6 tablas 7 y 8). Sin filtros, titles ni formatters.

- `Documentacion/DocumentosEquipos/Permanentes/columns.tsx`: vehicle (title 1), state (status), document_type (subtitle), validity (field 1), contractor (field 2), created_at (field 3).
- `Documentacion/TiposDocumentos/PersonasList/columns.tsx`: name (title 1), is_active (status), mandatory (field 1), explired (field 2), special (field 3).
- Labels por defecto en todos (coinciden con los `meta.title` existentes).

## Desvíos
- `EquiposList` no tiene `columns.tsx` propio (reutiliza `getDocTypeColumns` de PersonasList), así que no se anotó `equipment_type` como subtítulo.

## Hallazgos para la Fase 6
- Ninguno.

check-types: verde.

<!-- estado: completo -->
