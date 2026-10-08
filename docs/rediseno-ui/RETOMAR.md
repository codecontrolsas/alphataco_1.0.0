# Cómo retomar el rediseño (si se cortó la sesión o los créditos)

Todo el estado vive en archivos de esta carpeta; nada depende de la memoria de una sesión o de un agente.
Este procedimiento es **idempotente**: se puede correr cuantas veces haga falta.

## 1. Ver dónde quedó

1. `git branch --show-current` → tiene que ser `feat/rediseno-ui`. Si no, `git checkout feat/rediseno-ui`.
2. Leer la **bitácora** (`PLAN.md` §10) y los checkboxes de la fase en curso (`PLAN.md` §4).
3. Archivos de trabajo: un archivo está **terminado** solo si su última línea es `<!-- estado: completo -->`.
   ```bash
   for f in docs/rediseno-ui/AUDITORIA-UI.md docs/rediseno-ui/inventario/*.md docs/rediseno-ui/features/*.md; do
     [ -f "$f" ] && { tail -1 "$f" | grep -q 'estado: completo' && echo "OK   $f" || echo "FALTA $f"; }; done
   ```
4. Si hay agentes todavía corriendo en esta sesión (aparecen en la lista de tareas / `ListAgents`), **no relanzar
   nada**: esperar su aviso.

## 2. Relanzar lo que falte

Cada pieza pendiente se relanza con el mismo encargo, agregando siempre: *"el archivo puede existir a medio
hacer: leelo, conservá lo ya escrito, completá lo que falta y terminá con `<!-- estado: completo -->`; guardá de
forma incremental"*.

### Fase 0
| Archivo esperado | Agente | Encargo |
|---|---|---|
| `AUDITORIA-UI.md` | `ui-skills` | Protocolo de plan + auditoría por feature (plantilla de `features/<feature>.md`, checklist de auditoría con una línea por regla aplicable de `vercel-react-best-practices`, formato de informe, criterio de "en cero", reparto con otros agentes). Ver `PLAN.md` §3.1. |
| `inventario/configuracion.md`, `ayuda.md`, `seleccion.md`, `auth-y-errores.md` | general-purpose | Ficha "antes" por pantalla (componente raíz; por tabla: sistema, columnas, filtros, búsqueda, orden, export, selección/acciones masivas, acciones por fila con permiso; botones con permiso; dialogs y formularios con campos/validaciones/envío; estados especiales; comportamientos no obvios), con `- [ ]`. |
| `inventario/empleados.md`, `equipos.md`, `documentacion.md` | general-purpose | Ídem. |
| `inventario/operaciones.md`, `mantenimiento.md` | general-purpose | Ídem + en `mantenimiento.md` la sección "Tablas del sistema viejo (BaseDataTable)" de Mantenimiento: en uso (cadena hasta un `page.tsx`) u huérfana, y si hay versión nueva. |
| `inventario/comercial.md`, `formularios.md`, `dashboard.md`, `paneles-de-campo.md` | general-purpose | Ídem + en `comercial.md` la misma clasificación para las `BaseDataTable` de Clientes, Certificación, talleres/sectores, `employees-table`, `vehicle-operations-history` y `SimpleDocument`. |

| `inventario/crecimiento.md` | general-purpose | Clasificar TODA superficie con colecciones (DataTables, BaseDataTable, tablas y listas manuales, historiales, comentarios, selectores) en `acotado`/`crece`, estado actual (paginado en servidor / carga todo / limit fijo), riesgo y qué hacer (decisión D7 de `PLAN.md`). |

Cuando todo esté `completo`: tildar Fase 0 en `PLAN.md`, anotar en la bitácora, actualizar el tablero y pasarle
al usuario el inventario para revisar (Checkpoint 0) junto con la decisión D6.

### Fase 1
| Archivo esperado | Agente | Encargo |
|---|---|---|
| `features/fase-1-progreso.md` | `ui-skills` | Implementar `features/fase-1-fundamentos.md` §4.7 pasos 1-8 + controles de código del 9, retomando desde el primer paso sin tildar del archivo de progreso. Sin navegador, sin commits, sin lint. |

| `features/fase-1-auditoria.md` | `ui-skills` | Auditar la Fase 1 con `AUDITORIA-UI.md` (bloques A-H), corregir S1/S2 hasta cero; retomar el informe si existe. |

Cuando esté `completo`: verificación en navegador (1440/768/375, claro/oscuro, §8 del plan) → auditoría `ui-skills`
en cero → bitácora y tablero.

Fase 1 cerrada el 2026-10-07 (verificada en navegador).

### Fase 2
| Archivo esperado | Agente | Encargo |
|---|---|---|
| `features/fase-2-primitivos.md` | `ui-skills` | Plan de la Fase 2 (primitivos de `PLAN.md` §4) con la plantilla de `AUDITORIA-UI.md`: reemplazos existentes con su contrato, API, mobile/teclado/ARIA/casos límite, ubicación, reparto en paralelo, página de ejemplo local. Solo documento. |
| `features/fase-2-progreso.md` (marca `<!-- ola 0: completa -->`) | `ui-skills` | Ola 0 de `fase-2-primitivos.md` §4.7 (use-media-query, formatters, contexto de ResponsiveDialog, revestimiento §3.11). Retomar desde el primer paso sin tildar. |
| `features/fase-2-auditoria.md` | `ui-skills` | Auditoría de la Fase 2 (AUDITORIA-UI.md A-H) con los 5 bugs de entrada anotados en la bitácora; corregir S1/S2 hasta cero. |
| ídem, ola 1 | 5 agentes `ui-skills` en paralelo (A-E de §4.7) | Solo cuando la ola 0 esté completa y verificada en navegador. |

Fase 2 cerrada el 2026-10-08.

### Fase 3
| Archivo esperado | Agente | Encargo |
|---|---|---|
| `features/fase-3-datatable.md` | `ui-skills` | Plan de la Fase 3 (DataTable desktop + mobile) con la plantilla de `AUDITORIA-UI.md`, escrito para que lo ejecute `table-expert`; incluye la solución al desborde de toolbar/paginación a 375px y `meta.mobile` de las 9 tablas anchas. Solo documento. |
| `features/fase-3-progreso.md` (`<!-- ola 0: completa -->`) | `table-expert` | Ola 0 de `fase-3-datatable.md` §4.7 en modo rediseño (§4.0): tipos, `mobile-columns.ts`, raíz contenida (§3.2), fade de un lado. Retomar desde el primer paso sin tildar. |
| `features/fase-3-ola1-B{1..4}.md`, `fase-3-ola2b-C{1..3}.md` | `table-expert` ×7 en paralelo | Piezas de la ola 1 y `meta.mobile` de la ola 2b según `fase-3-datatable.md` §4.7; archivos exclusivos por agente. Relanzar solo los que falten. |
| `features/fase-3-auditoria.md` | `ui-skills` | Auditoría de la Fase 3 (AUDITORIA-UI.md A-H) hasta S1=S2=0, contra el contrato §5 de `fase-3-datatable.md`. |
| ola 2 (integración) | `table-expert` | `DataTable.tsx`, `index.ts`, `DOCS.md`, `DataTableMobileFilters.tsx`. Solo con B1-B4 completos. |

### Fases siguientes
Seguir `PLAN.md` §4 en orden. Para cada feature: plan `ui-skills` (`features/<feature>.md`) → implementación →
auditoría `ui-skills` en cero (`AUDITORIA-UI.md`). Al terminar cada paso, anotar en la bitácora.

## 3. Reglas que no cambian al retomar

- No commitear ni pushear sin pedido explícito del usuario. Entrega única al final.
- No cambiar funcionalidad. Dev server: `npx next dev --webpack` (no borrar `.next`).
- Tablero: https://claude.ai/artifact/4pZMgvn4XXXixC758U4iYo — se actualiza republicando (desde otra sesión,
  con `url`).
