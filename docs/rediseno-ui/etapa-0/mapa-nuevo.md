# Etapa 0.2 — Mapa nuevo de alphataco (APROBADO por el usuario el 2026-10-10)

Base: `relevamiento.md`. Boceto navegable: artifact "Mapa nuevo de alphataco" (link en la conversación del
2026-10-10). Vocabulario: `glosario.md`.

## 1. La idea

GH organiza por **tipo de registro** (empleados, equipos, documentos, operaciones…) y deja el trabajo del día
repartido entre módulos. alphataco se organiza por **lo que hace la empresa**, en cuatro grupos, y arranca por
**lo que hay que atender hoy** en lugar de un tablero de KPIs:

| Grupo del menú | Espacio (módulo) | Qué junta (de dónde viene hoy) |
|---|---|---|
| — | **Hoy** | Pendientes del día (vencimientos, avisos de taller por validar, aprobaciones, jornadas sin cerrar) + resumen. Los gráficos de hoy pasan a "Indicadores" (Dashboard › Principal y Estadísticas) |
| **Trabajo** | **Servicios** | Agenda (ex Gestor de Pedidos) · Jornadas (ex Partes Diarios) |
| | **Taller** | Avisos (ex Validar Solicitud) · Programación (Por Programar / Por Ingresar / En Taller) · Autorizaciones · Tablero (ex Vista Taller) · Unidades observadas (ex Equipos con Desvíos) · Cubiertas (ex Gomería) |
| | **Depósito** | ex Almacenes: Existencias, Movimientos, Préstamos, Pedidos, Materiales, Ubicaciones |
| **Recursos** | **Personas** | Nómina (ex Empleados activos/inactivos) · Ingresos (ex Selección) · Rotaciones (ex Diagramas) |
| | **Flota** | Unidades (ex Vehículos) · Equipos auxiliares (ex Equipamiento) · Fuera de flota (ex Dados de Baja) |
| **Control** | **Cumplimiento** | Toda la documentación en una sola bandeja, por **estado de vencimiento** y no por tipo de recurso: Vencidos · Vence pronto · Por revisar · Al día; filtro de "a quién aplica" (personas, flota, empresa). Reúne Documentación + Equipos › Documentos de Equipos + Dashboard › Documentación |
| | **Inspecciones** | ex Formularios + checklists |
| | **Indicadores** | ex Dashboard › Principal (gráficos) y Estadísticas (Operaciones, RRHH, Taller, Monitor) |
| **Negocio** | **Clientes** | Cartera (ex Clientes) · Contratos · Certificaciones · Facturas · Tarifas (ex Reglas de Precio) · Unidades de medida |
| pie del menú | **Ajustes** | ex Configuración (mismo contenido, reagrupado por espacio: Empresa, Personas, Flota, Taller, Depósito, Cumplimiento, Accesos) |
| pie del menú | **Soporte** | ex Ayuda: Consultas (ex Tickets) · Guía (ex Manual de uso) |

Lo que cambia de lugar (nada desaparece):

- **Documentos de equipos** sale de Equipos y **Próximos vencimientos** sale de Dashboard: los dos viven en Cumplimiento.
  En la ficha de cada persona/unidad sigue estando su sección de documentos (la misma tabla, reusada).
- **Equipos › Mantenimiento** (la pantalla vieja con su propio pipeline) se reemplaza por el acceso a Taller filtrado
  por esa unidad. *Requiere confirmar que no tenga una capacidad que Taller no cubra (se verifica en el módulo 2).*
- **Tipos de Documentos** (hoy en Equipos y en Configuración) queda solo en Ajustes › Cumplimiento › Requisitos.
- **Partes Diarios** de Comercial (vista para certificar) queda en Clientes › Certificaciones como paso previo, no como
  solapa con el mismo nombre que la de Operaciones.
- **Nuevo Pedido** de Mantenimiento deja de ser una solapa: es el botón "Aviso nuevo" de Taller.
- **KPIs** (hoy en Configuración) vuelve a Indicadores (definición en Ajustes, lectura en Indicadores).

## 2. El armazón

| Pieza | Propuesta | Por qué |
|---|---|---|
| Menú | Grupos con rótulo (Trabajo / Recursos / Control / Negocio), Ajustes y Soporte abajo, Hoy arriba. Dentro de cada espacio las secciones se ven **como lista en el menú** (como hoy) pero con los nombres nuevos | GH es una lista plana de 10 ítems en otro orden |
| Encabezado | Migas `Espacio › Sección`, **buscador "Ir a…" (Ctrl+K)**: personas por legajo/nombre, unidades por dominio/interno, clientes y pantallas; ayuda contextual; tema | Ni GH ni alphataco tienen buscador: es el cambio de recorrido más grande (al dato en 1 paso). *Capacidad nueva: requiere aprobación* |
| Empresa activa | Sigue arriba del menú, textos nuevos ("Empresa", "Cambiar de empresa", "Buscar empresa", "Sumar empresa") | Hoy copia los textos de GH |
| Usuario | Pie del menú: "Mi perfil", "Salir"; se elimina el link roto a `/admin/panel` | Mismo menú que GH |
| Solapas de 2º nivel | Barra subrayada (no pills) y **contador** en cada una cuando aplica (ej. "Vencidos 12") | GH usa pills naranjas sin contador |

## 3. Rutas

Se abandona el prefijo `/dashboard` y los nombres de GH. Las carpetas siguen en inglés (regla del proyecto), pero
son otras:

| Hoy (= GH) | Nuevo |
|---|---|
| `/dashboard` | `/today` |
| `/dashboard/operations` | `/services` (`/services/agenda`, `/services/days/[id]`) |
| `/dashboard/maintenance` | `/workshop` |
| `/dashboard/warehouse` | `/stockroom` |
| `/dashboard/employee`, `/dashboard/recruitment` | `/people`, `/people/intake` |
| `/dashboard/employee/action?action=view&employee_id=X` | `/people/X` (alta: `/people/new`) |
| `/dashboard/equipment`, `.../action?id=X[&type=other]` | `/fleet`, `/fleet/X` |
| `/dashboard/document`, `/document/[id]` | `/compliance`, `/compliance/[id]` |
| `/dashboard/forms` | `/inspections` |
| (Dashboard › Estadísticas) | `/insights` |
| `/dashboard/comercial` (+ facturacion) | `/clients` (`/clients/[id]`, `/clients/invoices/...`) |
| `/dashboard/configuration` | `/settings` |
| `/dashboard/help` | `/support` |
| `/operator`, `/clothing`, `/maintenance` (QR) | `/crew`, `/handout`, `/unit` (QR) |

- Todas las rutas viejas **redirigen** a las nuevas (links en mails, PDFs, favoritos, y sobre todo los **QR ya
  impresos** que apuntan a `/maintenance/equipment/[id]`: esa redirección es permanente).
- `?tab=` / `?subtab=` pasan a segmentos de ruta donde la sección es una pantalla propia (`/workshop/schedule`,
  `/compliance/expired`), para que cada pantalla tenga su URL compartible.

## 4. Patrones nuevos (los aplica cada módulo)

1. **Ficha** (`/people/X`, `/fleet/X`, `/clients/X`): columna izquierda fija con el **resumen** (foto, legajo/dominio,
   estado de cumplimiento, asignación, accesos rápidos) y a la derecha las **secciones** como índice navegable
   (no solapas en grilla). **Edición por sección** ("Modificar" en cada bloque) en lugar del modo edición global de GH.
   *Mismo dato, otro recorrido: se valida en el módulo 1.*
2. **Lista**: título + **resumen por estado arriba de la tabla** (chips con contador que filtran: "En nómina 583 ·
   Con faltantes 41 · Egresados 70"), el alta a la izquierda del título, la tabla responsive que ya existe.
3. **Hoy**: lista de pendientes accionables agrupada por espacio, cada ítem con su acción directa.

## 5. Impactos (a resolver dentro de cada módulo, no ahora)

- Migración de `modules.name` / `tabs.name` (y `slug` donde cambie la URL) por UUID; `permissions-map.ts`.
- `src/proxy.ts` (rutas protegidas y redirecciones), links internos, mails, PDFs, QR.
- Manual: 65 `.mdx` + catálogo + `manual:check`.
- Tests Cypress que buscan por texto.
- La API externa (`/api/external/v1/*`) **no** cambia (es un contrato con terceros).

## 6. Decisiones que necesito del usuario

1. ¿Aprobás la agrupación (Hoy · Trabajo · Recursos · Control · Negocio) y los movimientos de la §1?
2. ¿Sumamos el buscador "Ir a…" (capacidad nueva)?
3. ¿Rutas nuevas sin `/dashboard`, con redirección de las viejas?
4. Ficha con resumen fijo y edición por sección: ¿va como patrón (se valida en Personas)?
