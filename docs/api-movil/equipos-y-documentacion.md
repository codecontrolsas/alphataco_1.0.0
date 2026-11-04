# API móvil v1 — Equipos y Documentación (solo lectura)

> **Revisión del contrato: 3** (rediseño de la app, lote W2). La API sigue siendo `v1` (`X-Mobile-Api-Version: 1`):
> las revisiones 2 y 3 solo AGREGAN (campos opcionales, parámetros y endpoints nuevos), nada se quita ni cambia de
> significado. `GET /capabilities` informa `contractRevision: 3`. Lo de la revisión 2 (lote W1: Empleados, Partes
> diarios, `/me`, Equipos y Documentos) está en «Revisión 2» y lo nuevo (Capacitaciones, Tableros, Avisos, Búsqueda
> global y `/me`) en «Revisión 3», ambas al final de este documento.

Contrato para la app móvil. Todo bajo `/api/mobile/v1`, con el token de portador del login (`POST /session`).
Los schemas Zod son la fuente de verdad: `src/features/MobileApi/contracts/equipment.ts` y `contracts/documents.ts`
(las rutas validan la SALIDA contra ellos antes de responder). Ningún endpoint escribe.

## Reglas comunes

- **Módulos**: `movil` y el módulo de la ruta (`equipos` o `documentacion`) tienen que estar encendidos para la empresa
  del token. Si no, **404 `MODULE_DISABLED`** (igual que Empleados y Operaciones). Además, los documentos de empleados
  exigen `empleados` y los de equipos, `equipos`: con esos módulos apagados la clase de recurso desaparece de las listas y
  su ficha responde 404 `MODULE_DISABLED`.
- **Anuncio**: `GET /capabilities` (instancia) y `GET /me` (empresa) informan `equipos.equipment` y
  `documentacion.documents` en `modules`. `/me.permissions` suma (agregado compatible):
  - `equipos.vehicles` = `{ listActive, listInactive, record, technical, assignment, documents }`
  - `equipos.others` = `{ listActive, listInactive, record, technical, assignment, certifications }`
  - `documentacion` = `{ resources: ('employee'|'equipment'|'company')[], employee|equipment|company: { permanent, monthly }, detail }`
    (`resources` ya descuenta los módulos apagados).
- **Permisos**: los MISMOS de la web (claves en `MOBILE_PERMISSION_KEYS`, con la insignia «Móvil» en el editor de roles).
  Sin el permiso de la pantalla web equivalente: **403 `FORBIDDEN`**.
- **Errores**: `{ "error": { "code", "message" } }`. `401 UNAUTHENTICATED` (sin token, vencido o usuario bloqueado),
  `403 FORBIDDEN`, `404 NOT_FOUND` (no existe o es de otra empresa: nunca se distingue), `404 MODULE_DISABLED`,
  `422 INVALID_INPUT` (parámetros o cursor inválidos), `500 INTERNAL_ERROR`.
- **Caché**: las lecturas devuelven `ETag` + `Cache-Control: private, no-cache`; con `If-None-Match` igual responde 304.
- **Paginación**: `limit` (1–50, default 30) y `cursor` opaco (`nextCursor` de la página anterior; `null` = no hay más).
  `total` viene solo en la primera página. Un cursor de otra consulta es 422: volver a la primera página.
- **Fechas**: días `YYYY-MM-DD`. Los vencimientos de documentos son el **día argentino**; «por vencer» = vence dentro de
  30 días (mismo umbral y misma hora argentina que la web).
- **Estados con tono**: `{ code, label, tone }` con `tone` ∈ `ok | warn | danger | neutral` (la app pinta con su tema).

## Equipos

Dos clases, como las pestañas de la web: `vehicle` (Vehículos, tabla `vehicles` con `type_of_vehicle = 1`) y `other`
(Equipamiento, `other_equipment`).

### `GET /equipment`

| Parámetro | Valores | Notas |
| --- | --- | --- |
| `kind` | `vehicle` (default) \| `other` | Un listado es de UNA clase |
| `status` | `active` (default) \| `inactive` | Dados de baja = `inactive` |
| `q` | texto ≤ 60 | Cada palabra en dominio, interno, serie, chasis, marca o modelo (vehículo); interno, n° de serie, placa, marca o modelo (equipamiento). Tolera patentes con espacios o guiones |
| `typeId` | uuid | Tipo de equipo (`/equipment/filters`) |
| `condition` | `operativo` \| `no_operativo` \| `en_reparacion` \| `operativo_condicionado` \| `en_preparacion` | |
| `docStatus` | `Completo` \| `Completo_con_doc_vencida` \| `Incompleto` \| `Avalado` \| `No_avalado` | Se ignora con Documentación apagada |
| `cursor`, `limit` | | Orden: dominio (vehículo) o interno (equipamiento), los vacíos al final, desempate por id |

Permiso: `equipos:vehicles:view` / `equipos:others:view`; con `status=inactive`, `equipos:inactive:view`.

Respuesta: `{ items, nextCursor, total }`; cada ítem:
`{ id, kind, identifier, domain, internNumber, serialNumber, type, brand, model, year, condition, isActive, docStatus }`
(`docStatus` null si Documentación está apagada).

### `GET /equipment/filters`

`{ kinds: [{ value, label, statuses: [{ value, label }] }], types: [{ id, name, kind }], conditions: [{ value, label }], docStatuses: [{ value, label }] }`.
Solo las clases y estados que el usuario puede listar (403 si ninguno).

### `GET /equipment/{kind}/{equipmentId}`

Permiso: ficha visible (`equipos:detalle-equipo` o `equipos:detalle-otro-equipo`, visibilidad inferida como la web).
Los bloques viajan SOLO con el permiso de su sección (un bloque sin permiso no viaja, ni vacío):

- Siempre: `id, kind, identifier, isActive, condition, docStatus, termination ({ date, reason } | null)`.
- `technical` (`datos-basicos` / `datos-basicos-otro`): tipo, subtipo, marca, modelo, año, dominio, interno, n° de serie,
  chasis, motor, kilometraje, horas de motor, horómetro, placa del fabricante, vehículo vinculado, **`owner`**
  (titular/propietario `{ name, cuit }`), `contract { type, number, startDate, expirationDate }`,
  `certification { has, number, expirationDate }`. Sin importes (la app no muestra valores ni precios).
- `assignment` (`asignacion` / `asignacion-otro`): `customers` (clientes afectados `{ id, name }`), `sector`, `costCenter`.
- `documents` (solo vehículos; Documentación encendida y `documentos-de-equipos` visible + permanentes/mensuales):
  `{ permanent: [...] | null, monthly: [...] | null, summary: { total, missing, expired, expiringSoon } }`; cada documento
  `{ id, type, monthly, mandatory, status, state, validity, period, hasDetail }`. `null` en un grupo = sin permiso.
- `certifications` (solo equipamiento, `certificaciones-otro`): `[{ id, name, expirationDate, status: valid|expiring|expired }]`.
  **Solo metadatos** (ver «Huecos»).

## Documentación

Tres clases de recurso: `employee`, `equipment` (vehículos), `company`. Las filas salen del MISMO motor de cumplimiento
que las listas web: estado derivado (no el guardado), filas **faltantes** sintéticas para los tipos obligatorios sin
documento, y los documentos **archivados** («ya no aplica», `archived_at`) quedan fuera de listas y fichas.

Estado de la app (`status`) a partir del de la web (`state`, que también viaja):

| `status` | Significa | `state` de la web |
| --- | --- | --- |
| `missing` | Faltante (tipo obligatorio sin documento) | `pendiente` (label «Faltante») |
| `rejected` | El documento más nuevo está rechazado | `rechazado` |
| `expired` | Vencido | `vencido` |
| `expiring` | Vigente que vence en ≤ 30 días | `aprobado` o `presentado` |
| `valid` | Vigente | `aprobado` o `presentado` (presentado = cargado, sin revisar; la web lo cuenta como cumplido) |

### `GET /documents`

| Parámetro | Valores | Notas |
| --- | --- | --- |
| `resource` | `employee` \| `equipment` \| `company` | Sin él: todas las clases que el usuario puede ver |
| `period` | `permanent` \| `monthly` | Sin él: los dos (los que puede ver) |
| `status` | `valid` \| `expiring` \| `expired` \| `missing` \| `rejected` | |
| `typeId` | uuid | Tipo de documento |
| `q` | texto ≤ 60 | Cada palabra en el tipo o el recurso (legajo, apellido y nombre; dominio, interno o serie) |
| `resourceId` | uuid | Documentos de UN empleado o equipo (exige `resource` = employee/equipment) |
| `cursor`, `limit` | | Orden: faltantes, rechazados, vencidos, por vencer, vigentes; dentro, el que vence antes |

Permiso por clase y período: pestaña visible (`documentos-de-empleados|equipos|empresa`) + `view` de la subpestaña de
permanentes o mensuales; tipos privados solo con `view_private`. Pedir explícitamente una clase sin permiso: 403.

Ítem: `{ id, resource, type, status, state, validity, period, hasDetail }`.
- `resource` = `{ kind, id, name, fileNumber, domain, internNumber }` — en un empleado **`fileNumber` (legajo) viaja siempre**.
- `type` = `{ id, name, mandatory, monthly, hasExpiry, private }`.
- Una fila faltante tiene `id` = `missing:<recurso>:<tipo>[:<período>]` y `hasDetail: false` (no tiene ficha).

### `GET /documents/filters`

`{ resources: [{ value, label, periods }], statuses: [{ value, label }], types: [{ id, name, resource, monthly }] }`.

### `GET /documents/{resource}/{documentId}`

Ficha de un documento REAL. Permiso: `documentacion:detalle-de-documento:view` **y** la lista de esa clase y período
(privados con `view_private`). 404 si no existe en la empresa, está archivado, no tiene archivo o ya no es la fila vigente
de su lista (p. ej. una versión anterior reemplazada).

`{ id, resource, type, status, state, validity, period, uploadedAt, denyReason, policyNumber, hasFile }`.

### `GET /documents/{resource}/{documentId}/file`

Enlace para ver o bajar el archivo, con los MISMOS chequeos que la ficha. Sin caché.
`{ url, expiresAt, fileName }` — `url` es relativa al servidor y vence a los **5 minutos**.

### `GET /documents/{resource}/{documentId}/file/content?c=&exp=&sig=`

La `url` anterior. **No lleva token de portador** (la puede abrir un visor de PDF o de imágenes): la firma HMAC ata
empresa + clase + documento + vencimiento con una clave derivada propia. El path del archivo NO viaja en la URL: se
resuelve en la base por id dentro de la empresa de la firma, y se vuelve a exigir que el documento no esté archivado,
tenga archivo y que los módulos sigan encendidos. Responde el archivo (stream) con su `Content-Type`,
`Content-Disposition: inline`, `Cache-Control: private, max-age=300`. Firma alterada o vencida: 403; módulo apagado: 404.

## Huecos conocidos

- **Archivos de las certificaciones de equipamiento** (`other_equipment_certifications.file_url`): solo metadatos. Esas URLs
  se sirven por `/api/files` (sesión web por cookie, sin `view_private`) y no hay todavía un enlace firmado móvil para
  ellas; se puede sumar con el mismo patrón que los documentos.
- **Versiones anteriores** de un documento (reemplazadas por una más nueva) no tienen ficha en la app: la app solo ve lo
  que muestran las listas web.
- **Revocación del enlace de archivo**: es por vencimiento (5 minutos). Quitarle un permiso a un usuario no invalida un
  enlace ya emitido hasta que vence (mismo criterio que las fotos de empleados, 15 minutos).
- **Rendimiento**: las listas de documentos, como en la web, calculan el cumplimiento de toda la empresa en cada pedido
  (no hay N+1, pero cada página recalcula). Con empresas grandes conviene filtrar por `resource`/`period`.

---

# Revisión 2 — rediseño de la app (lote W1)

Solo lectura, mismos permisos que la web. Regla de oro: **lo que el rol no puede ver no viaja, ni su existencia**: un
bloque sin permiso se omite (no va vacío; vacío significa «no tiene»). Todos los campos nuevos son opcionales.

## Reglas comunes de la revisión 2

- **Fechas y horas, siempre hora argentina.** Días `YYYY-MM-DD`. Fecha y hora: `YYYY-MM-DDTHH:mm:ss-03:00` (desfase
  explícito; Argentina no tiene horario de verano). Un vencimiento «como evento» usa el inicio del día (`T00:00:00-03:00`).
  Horas de pared (`startTime`/`endTime`) `HH:mm`, sin zona.
- **Resumen documental** (`documentSummary`): `{ valid, expiring, expired, missing, rejected }`, calculado con el MISMO motor
  de cumplimiento de la web (estado derivado, sin «ya no aplica» ni archivados; permanentes y mensuales según permisos;
  tipos privados solo con `view_private`). `rejected` va aparte: la web lo cuenta junto con los faltantes. «Alerta» =
  `expired + expiring + missing + rejected > 0`. El motor evalúa solo recursos **activos**: en bajas el resumen es `null`.
- **Claves de permiso nuevas** (también en `MOBILE_PERMISSION_KEYS`): `hse:capacitaciones:view` y
  `equipos:historial-mantenimiento-equipo:view`.

## `GET /me`

Agregados: `role: { name } | null` (rol del usuario en la empresa activa, `user_roles`; con varios, los nombres unidos con « / »),
`roles: string[]` y `canSwitchCompany: boolean` (true si el usuario tiene más de una empresa: propias o compartidas activas,
igual que el selector de la web). `permissions.empleados` suma `documentSummary`, `absences`, `trainings` y
`permissions.equipos.vehicles` suma `documentSummary`, `maintenance`, `driver`.

## Empleados

### `GET /employees`

- Cada ítem suma `lastName`, `firstName` (`fullName` sigue siendo «Apellido Nombre») y `documentSummary`.
  `documentSummary` es `null` si el rol no ve la lista de documentos de empleados (pestaña + permanentes o mensuales),
  Documentación está apagada o es una baja. Un activo sin documentos que apliquen trae todo en cero.
- Parámetros nuevos:
  - `startsWith=<letra>` (índice alfabético): la primera página arranca en el primer apellido que empieza con esa letra
    (sin distinguir mayúsculas), con el mismo orden y colación del listado; si ningún apellido empieza con la letra,
    arranca en el siguiente. Solo con `sort=name` (si no, 422). Con `cursor` manda el cursor. No cambia `total`.
  - `alerts=1`: solo activos con alguna alerta documental. 403 sin permiso sobre la lista de documentos de empleados;
    422 con `status=inactive` o con Documentación apagada.
- Primera página: `totals: { all, withAlerts } | null`. `all` = empleados con los filtros aplicados (sin `alerts`);
  `withAlerts` = los que tienen alguna alerta. `null` sin permiso, en bajas o con Documentación apagada.
- Rendimiento: el motor calcula la empresa entera una vez por pedido (no hay N+1); como en `/documents`, cada página recalcula.

### `GET /employees/{id}` (ficha)

Secciones nuevas, cada una solo si el rol puede ver su fuente (si no, no viajan):

| Sección | Fuente y permiso | Contenido |
| --- | --- | --- |
| `absences` | Novedades del diagrama de los tipos que computan ausentismo (`diagram_type.computes_absenteeism`). Mismo permiso que `diagram`. | `{ total, items[] }`: 20 tramos más recientes (días seguidos del mismo tipo) `{ type, shortName, reason, from, to, days, status }`. `reason` = comentario del diagrama. `status`: `upcoming` Programada · `ongoing` En curso · `finished` Finalizada. |
| `trainings` | `hse_training_assignments` (capacitaciones publicadas, asignación sin archivar). `hse:capacitaciones:view` + módulo `hse`. | `[{ id, course, status, result, approvedAt, expiresAt, score }]`. `status`: `valid` · `expiring` (≤ 30 días) · `expired` · `pending` (pendiente, rindiendo o sin intentos). `result` = estado guardado (`pending`, `in_progress`, `passed`, `failed`, `expired`). `score` = % del último intento. |
| `assignedEquipment` | **Derivado de los partes diarios** (no existe una asignación fija empleado-equipo). Ver partes diarios + lista de la clase de equipo; módulos `operaciones` y `equipos`. | `[{ id, kind, identifier, domain, internNumber, type, since }]`: equipos que figuran junto al empleado en su último parte (de los últimos 7 días, sin líneas canceladas ni reprogramadas). `since` = primer día de la racha de partes consecutivos del empleado en que figura ese equipo. |
| `activity` | Fuentes que ya existen: movimientos de documentos (`documents_employees_logs`), vencimientos y asignaciones a partes. | Hasta 10 eventos `{ kind, at, title, detail }`: `document_uploaded` (documentos del legajo, con las reglas de permisos y tipos privados de la documentación), `document_expired` (vencimiento de los últimos 60 días; no hay un evento guardado, sale de la fecha), `report_assignment` (línea de parte en que se lo asignó; requiere ver los partes). |

## Partes diarios

### `GET /daily-reports/{reportId}/rows`

Respuesta `no-store` como siempre (alimenta la `baseVersion` de los comandos). Cada línea suma:

- `workdayType`: `8h` · `12h` · `24h` · `por_horario` · `null` (vacío). `workingDay` (texto guardado) sigue igual.
- `startTime`, `endTime` (`HH:mm`): solo en `por_horario`; `null` en el resto.
- `shift` (`dia` | `noche`): solo en 12 h (el guardado o, en filas viejas, el que sale del personal cargado); `null` en el resto.
- `employees[]` suma `roleKind` (`chofer` | `ayudante`) y `roleShift` (`dia` | `noche`), solo en 12 y 24 h (`role` crudo sigue).
- `sector`, `area`, `serviceType` (`{ code, label }`: mensual / adicional / adicional_permanente), `serviceItem`, `quantity`
  (número), `cancelReason`.
- `linkedOrder`: `{ id, number, status } | null` (pedido de origen, `preparte`).
- `changeHistory`: `{ count, lastAt, lastBy }` (historial de la línea; `count: 0` y `lastAt/lastBy: null` si no tiene).
- `copiedFrom`: `{ rowId, reportDate } | null` (línea de la que se copió).
- `clientEquipment`: `[{ id, name }]` (equipos del cliente).
- `GET /daily-report-rows/{rowId}` (recursos para los comandos) no cambia.

### `GET /daily-reports/strip` — tira de días

Parámetros: `date` (día central, `YYYY-MM-DD`, por defecto hoy argentino), `before` y `after` (0–31, por defecto 14).
Una sola consulta. Respuesta: `{ today, from, to, days[] }` con, por día, `{ date, state, reportId, reportStatus, rowCount, pendingCount, unassignedCount }`:

- `noReport`: no hay parte ese día.
- `withNews`: hay parte con líneas `pendiente` o `sin_recursos_asignados` (el criterio de «partes que requieren atención» de la web).
- `complete`: hay parte y no tiene líneas pendientes ni sin recursos.

Permiso: ver los partes diarios (`operaciones:detalle-parte-diario:view`). ETag como las demás lecturas.

## Equipos

### `GET /equipment` (lista)

Cada ítem suma (la lista web ya muestra estas columnas con el permiso de la lista):
`plate` (dominio del vehículo; **`null` en equipamiento**, que se nombra por `identifier` = interno o n° de serie, con `internNumber` y `serialNumber`),
`mileage` (kilómetros) y `engineHours` (horas de motor; en equipamiento, el horómetro), `customers` `[{ id, name }]` y `customer` (el primero),
`costCenter`. Además, según permiso:

- `documentSummary`: vehículos activos con la lista de documentos de equipos; equipamiento con certificaciones de la ficha (cuentan `valid`/`expiring`/`expired`, sin vencimiento = vigente). `null` en bajas o con Documentación apagada.
- `driver`: `{ id, fileNumber, name, lastDate, alert } | null`. **Derivado de los partes diarios** (no hay chofer fijo por equipo): el chofer (día, si no noche) de la línea más reciente de los últimos 7 días en que figura el equipo. Solo vehículos activos y con ver los partes. `alert` = el chofer tiene alerta documental (`null` si el rol no ve los documentos de empleados).
- `maintenance`: `{ nextService, lastOrder }`, solo vehículos y con `equipos:historial-mantenimiento-equipo:view` + módulo `mantenimiento`. `nextService` = orden abierta (ni completada ni rechazada) con la fecha programada más cercana desde hoy `{ orderId, orderNumber, date, status }` (no hay un plan de services por kilometraje en la base). `lastOrder` = la orden más recientemente creada, en cualquier estado `{ orderId, orderNumber, createdAt, status, description }`. `status` = `{ code, label, tone }` del circuito de taller.
- Primera página: `totals: { all, operative, inWorkshop, withExpiry }` sobre el universo de la lista (clase, estado, tipo y búsqueda; **sin** `condition` ni `docStatus`, para usarlos de tarjetas-filtro). `operative` = condición «operativo»; `inWorkshop` = «en reparación»; `withExpiry` = estado documental «Completo con doc vencida» (`null` con Documentación apagada).

### `GET /equipment/{kind}/{id}` (ficha)

Suma `plate`, `driver`, `maintenance` (mismas reglas que la lista) y `documentSummary` (de los documentos o certificaciones que el rol ve en la ficha).
Kilómetros, horas, clientes y centro de costo ya viajaban en `technical` / `assignment` con el permiso de su sección.

## Documentos

### `GET /documents`

- Parámetros nuevos: `customerId` (solo recursos afectados a ese cliente; los documentos de la empresa quedan afuera), `group=expiry` y `bucket`.
  Los filtros por tipo (`typeId`), estado (`status`) y «pertenece a» (`resource`: `employee` personal · `equipment` equipos · `company` empresa) ya existían.
- Primera página: `summary: { valid, expiring, expired, missing, rejected, total }` calculado sobre todo lo que cumple los filtros **salvo `status`** (sirve de tarjetas-filtro).
- `group=expiry` cambia la forma de la respuesta: `{ groups[], excluded, summary }`.
  - Grupos (`key`): `overdue` Vencidos (estado vencido o fecha anterior a hoy) · `thisWeek` Esta semana (hoy y los próximos 6 días) · `thisMonth` Este mes (después de esa semana y hasta el último día del mes calendario) · `later` Más adelante. Siempre vienen los cuatro, con su `count`, su primera página `items` (`limit` es por grupo) y su `nextCursor`.
  - `bucket=<key>` pide UN grupo; con su `cursor` se sigue paginando dentro del grupo. Un cursor de otro grupo, o un `cursor` sin `bucket`, es 422.
  - `excluded: { missing, noExpiry }`: filas que no entran en ningún grupo (faltantes y documentos sin vencimiento).
  - Orden dentro del grupo: el que vence antes primero.
- `GET /documents/filters` suma `customers: [{ id, name }]` (para `customerId`).

### `GET /documents/{resource}/{id}` (ficha)

Suma: `uploadedBy` (nombre de quien lo subió), `review` (`{ code, label, tone, reason }`: estado de revisión **guardado** pendiente / presentado / aprobado / rechazado, con `reason` = motivo si está rechazado; la web **no guarda quién aprobó**, por eso no hay «aprobado por»),
`appliesTo` (`{ total, upToDate }`: recursos de la clase y período a los que aplica el tipo, y cuántos están al día = vigentes o por vencer; incluye los faltantes en `total`),
`conditions` (`{ scope, allText, criteria[], multiresource, mandatory, downDocument }`: por qué se pide el tipo; `criteria` = `[{ key, label, values[] }]` con puesto, clientes, sector, categoría, aptitud, etc., tomadas de las `conditions` del tipo; `scope` `all` = «Todo el personal»/«Todos los equipos», `conditions`, `none`) y
`versions` (`[{ at, by }]`, hasta 20, más nuevo primero: movimientos registrados del documento; vacío en documentos de la empresa, que no los registran). `appliesTo` recalcula la clase completa, como las listas.

## Lo que NO se pudo (no existe en la base)

- `power` (potencia) de los equipos: no hay columna.
- Chofer fijo del equipo y equipo fijo del empleado: no hay asignación; se derivan de los partes diarios (ver arriba).
- «Próximo service» por kilometraje u horas: no hay plan de mantenimiento; se usa la fecha programada de la orden abierta.
- «Aprobado por» de un documento: la web no lo guarda.
- Eventos «documento vencido» como registros: no se guardan; se derivan de la fecha de vencimiento.
- Versiones anteriores del archivo de un documento: se guarda un solo archivo; `versions` es el historial de movimientos (fecha y quién), no de archivos.

---

# Revisión 3 — Capacitaciones, tableros, avisos y búsqueda (lote W2)

Solo lectura, mismos permisos que la web. Misma regla de oro de la revisión 2: **lo que el rol no puede ver no viaja,
ni su existencia** (un bloque, un grupo o un widget sin permiso se omite; vacío significa «no tiene»). Fechas y horas,
siempre hora argentina (días `YYYY-MM-DD`, fecha y hora con desfase `-03:00`). Contratos Zod en
`src/features/MobileApi/contracts/{trainings,dashboards,notifications,search}.ts`; las rutas validan la SALIDA contra ellos.

## Anuncio y `GET /me`

- `GET /capabilities` y `GET /me.modules` suman las entradas `hse.trainings`, `nucleo.dashboards`, `nucleo.notifications`
  y `nucleo.search` (`hse` depende de que el módulo HSE esté encendido; `nucleo` siempre lo está).
- `/me.permissions` suma (agregado compatible):
  - `hse = { trainings, sessions }`: `trainings` = `hse:capacitaciones:view`; `sessions` = además `hse:actas:view` (sesiones presenciales).
  - `dashboards = { available }`: el rol ve al menos un widget de los tableros (misma regla de la web, con los módulos encendidos).
  - `notifications = { available: true }`: los avisos son del usuario, sin permiso propio.
  - `search = { groups }`: grupos que puede buscar, de `employees | equipment | documents | trainings | daily-reports | modules`.
- Claves nuevas en `MOBILE_PERMISSION_KEYS` (insignia «Móvil» en el editor de roles): `hse:actas:view`,
  `dashboard:principal|empleados|vehiculos|rrhh:view`, `empleados:diagrams:view`, `equipos:equipos:view`,
  `operaciones:dailyreportstable:view` (las de los widgets que la app calcula).

## Capacitaciones (HSE)

Módulo `hse` encendido + `hse:capacitaciones:view` (403 si falta). Solo capacitaciones **publicadas** (borradores y
retiradas son de administración; fuera de la lista y 404 en el detalle). Un id de otra empresa es 404.

**Cobertura**: `{ approved, applies, expired, expiring, pending }` sobre las asignaciones vigentes (sin archivar).
`approved` = aprobada con la vigencia al día (una aprobación vencida NO cuenta como aprobada: criterio del detalle web;
la lista web la cuenta como aprobada); `expired` = aprobación vencida; `expiring` = vigente que vence en ≤ 30 días;
`pending` = pendiente, rindiendo o sin intentos. `applies` = todas las asignaciones vigentes.

**Estado de una persona** (`status`) con UNA sola clasificación para el legajo (`/employees/{id}.trainings`) y esta
pantalla: `valid` Vigente · `expiring` Por vencer (≤ 30 días, igual que los documentos; no es «este mes» calendario) ·
`expired` Vencida · `pending` Pendiente (`result` trae el estado guardado: `pending`, `in_progress`, `passed`, `failed`
«sin intentos» o `expired`).

### `GET /trainings`

| Parámetro | Valores | Notas |
| --- | --- | --- |
| `q` | texto ≤ 60 | Título o descripción |
| `status` | `valid` \| `expiring` \| `expired` \| `pending` | Estado agregado (abajo) |
| `sectorId`, `positionId` | uuid | Aplica a ese sector / puesto: destinatario «Todo el personal» o ese sector / puesto |
| `cursor`, `limit` | | `limit` 1–50 (30). Orden: lo que pide acción primero (vencida, pendiente, por vencer, al día, sin asignaciones), luego título |

Ítem: `{ id, title, kind: { code, label }, validityMonths, coverage, status, nextSession? }`. `status` (agregado, lo peor
manda): `expired` Con aprobaciones vencidas · `pending` Con pendientes · `expiring` Con aprobaciones por vencer ·
`valid` Al día · `none` Sin asignaciones. `nextSession` = `{ date, location } | null` (primera sesión programada desde
hoy, sin anuladas); **solo viaja con `hse:actas:view`**.
Respuesta: `{ items, nextCursor, total, totals }`; `total` y `totals` solo en la primera página. `totals = { coverage,
expired, expiring }` sobre lo que cumple `q`/sector/puesto (sin `status`): `coverage` = % de aprobados vigentes sobre las
personas a las que aplica (null si nadie), `expired`/`expiring` = aprobaciones (personas), no capacitaciones.

### `GET /trainings/{id}`

`{ id, title, description, kind, status, publishedAt, summary, audience, coverage, sessions?, content, exam, certificate }`.
- `summary` = `{ passingScore (% de puntos para aprobar), maxAttempts, timeLimitMinutes, shuffleQuestions, validityMonths (renovación; null = no vence) }`.
- `audience` = destinatarios `[{ kind: all|position|sector|employee, label }]`.
- `sessions` (solo con `hse:actas:view`; hasta 20, la más nueva primero): `{ id, number, date, status {draft Borrador · closed Cerrada · voided Anulada}, modality, location, durationMinutes, instructors [{ name, kind }], attendance { present, registered }, hasMinutes, upcoming }`. `hasMinutes` = hay acta en PDF (el archivo se ve en la web).
- `content` = `{ required, materials[] }`, **solo metadatos**: `{ id, title, kind: file|link, mediaType, fileName, fileSize, url, required, viewedBy }`. `viewedBy` = personas que lo marcaron leído. `url` viaja **solo en los enlaces externos** (la web los muestra tal cual). `mediaType` (`video|pdf|image|document|link|other`) se deduce de la extensión del archivo o del sitio del enlace (YouTube/Vimeo = video): la base solo distingue `file` y `link`.
- `exam` = `{ questions, totalPoints, results[] }` con `results` = `{ attempt, submitted, passed, averageScore }` por número de intento (solo intentos enviados). **No viajan preguntas, opciones ni respuestas correctas.**
- `certificate` = `{ issued, lastIssuedAt } | null` (constancias firmadas y no anuladas).

### `GET /trainings/{id}/people`

`q` (legajo, apellido o nombre), `status` (`valid|expiring|expired|pending`), `cursor`, `limit`. Orden: vencida, pendiente,
por vencer, vigente; dentro, apellido y nombre. Ítem: `{ id, employee { id, fileNumber, fullName, position, isActive }, status,
result, attempts { used, max }, score, lastAttemptAt, approvedAt, expiresAt, daysLeft }` (`daysLeft` negativo = vencida
hace N días; null si no vence o no está aprobada). `{ items, nextCursor, total }` (`total` solo en la primera página).

## Tableros

Módulo `nucleo` (siempre) y al menos un widget visible (403 si ninguno). Es la MISMA lógica de la web:
- **Qué tableros**: `loadUserBoards` (el cuerpo de `getUserBoards`): los propios (con su orden), los compartidos con la
  organización o con el usuario, y, si no guardó ninguno, los predefinidos activos (Resumen, Operación del día,
  Vencimientos) con los widgets que puede ver.
- **Qué widgets**: `visibleWidgetIdsFor` (la regla de la web: todas las claves de `requires`, algún grupo de
  `requiresAny`, secciones activas), alimentada con los permisos explícitos del usuario. La app además descarta los
  widgets cuyo módulo de datos esté apagado en la empresa. Un tablero compartido puede traer widgets que el rol no ve:
  no viajan.

### `GET /dashboards`

`{ items: [{ key, name, description, order, template, scope, ownerName, widgetCount }] }`. `key` = id del tablero (uuid, o
`tpl-<clave>` de un predefinido sin guardar): es lo que va en `/dashboards/{key}`. `scope`: `default` predefinido · `own`
propio · `shared` compartido (con `ownerName`). `widgetCount` = widgets que el usuario ve en él.

### `GET /dashboards/{key}`

`{ key, name, description, generatedAt, widgets[], unsupportedWidgets[] }`. 404 si el tablero no está en la lista del
usuario. Cada widget: `{ id, title, size, data }` o `{ id, title, size, error: { code: 'WIDGET_ERROR', message } }`
(**cada widget está aislado**: uno que falla no tira el tablero; se calculan en paralelo). `size` = `xs|sm|md|lg|xl|full`
del layout. `unsupportedWidgets` = `[{ id, title }]` de los widgets del tablero que el usuario ve y la app no calcula
(`cash-position` —dinero, nunca se expone—, `kpi-checklist-missing`, `equipment-fleet`, `operations-charts`,
`maintenance-charts`, `deviations-series`, `order-management`, `kpi-charts`, `kpi-indicators`).

Forma de `data` de cada widget (Zod: `WIDGET_DATA_SCHEMAS`). Mismas funciones de cálculo que la web:

| Widget | `data` |
| --- | --- |
| `kpi-employees` | `{ value }` empleados activos |
| `kpi-active-vehicles` | `{ value }` equipos activos |
| `kpi-operative-fleet` | `{ value, activeVehicles, outOfService }` |
| `kpi-today-services` | `{ date, value }` servicios de hoy (pendientes o ejecutados) |
| `kpi-operativity` | `{ percentage \| null, level ok\|warn\|danger\|neutral, operative, total }` (umbrales de la web: 75 / 50) |
| `services-today` | `{ date, total, byType [{ type, count, percentage }], byClient [{ client, total, monthly, additional, statuses [{ status, count }] }], moreClients }` (20 clientes con más servicios) |
| `hr-today` | `{ date, withDiagram, inOperation, available, cancelled, usage \| null, diagrams [{ id, name, color, count }] }` |
| `equipment-operation` | `{ date, active, inUse, cancelled, available, outOfService, fleet, operativity \| null, byType [{ type, available, outOfService, working, cancelled }] }` (12 tipos) |
| `document-compliance` | `{ employees?, vehicles? }` = `{ complete, expired, incomplete, total }` (cada fuente solo si el rol la ve) |
| `expiring-weeks` | `{ today, employees?, vehicles?, weeks [{ index, from, to, count, employees, vehicles }], remainder, overdue }` (4 semanas corridas; `remainder` = días 28 a 30) |
| `expiring-timeline` | `{ today, employees?, vehicles? }` = `{ overdue, byDay[31] }` (índice = días que faltan) |
| `expiring-employee-docs` / `expiring-vehicle-docs` | `{ total, overdue, items [{ id, type, validity, daysLeft, state { code, tone }, resource { id, identifier, name } }], truncated }` (20 más urgentes; `identifier` = legajo del empleado o dominio/interno del equipo; permanentes, tipos privados solo con `view_private`) |
| `attention-inbox` | `{ items [{ key, module, label, count, tone danger\|warn\|info }], checked, failed, partial: true }` — **parcial**, ver abajo |
| `hr-summary` | `{ date, previousHeadcount, hires, terminations, headcount, absent, absenteeism \| null }` o `null` sin medición |
| `hr-absenteeism-trend` | `{ range { from, to, label }, points [{ date, percentage }] }` (últimos 7 días, como el gráfico web) |
| `hr-absence-reasons` | `{ date, departments [{ department, total, reasons [{ name, count, color }] }] }` (solo con ausentes) |
| `hr-department-summary` | `{ date, items [{ sector, headcount, absent, percentage }] }` (sin el detalle por empleado) |
| `hr-daily-absence` | `{ range, items [{ date, headcount, hires, terminations, vacations, totalHeadcount, absent, percentage }] }` (mes en curso hasta hoy) |
| `hr-distribution` | `{ byPosition [{ position, gender, genderLabel, count }], byContract [{ contract, count }] }` |
| `hr-headcount-trend` | `{ range, points [{ date, headcount, hires, terminations }] }` (últimos 7 días) |
| `hr-employee-absence` | `{ date, total, items [{ employeeId, fileNumber, name, task, line, shift, reason, from, to, daysOut, notes }], truncated }` (50 primeros; legajo siempre) |

- **`attention-inbox` es parcial**: la app calcula los documentos de personal y de equipos **vencidos**. Los contadores de
  Compras, Almacenes, Tesorería, Mantenimiento y Comercial dependen de funciones atadas a la sesión web y quedan en la
  web (`partial: true` lo avisa).
- Los gráficos de tendencia usan el rango por defecto de la web (7 días; el mes en curso para la tabla diaria); la
  app no elige rango todavía.

## Avisos

Módulo `nucleo` (siempre). **Sí existe tabla de avisos**: es la bandeja de la campanita de la web
(`notification_deliveries`, una fila por destinatario con `read_at`), así que el feed es real y `unread` también. Solo se
ven los avisos del propio usuario en la empresa activa. La app **no marca como leído** (eso sigue siendo de la web).

### `GET /notifications`

`unread=1` (solo no leídos), `cursor`, `limit` (1–50, 20). Del más nuevo al más viejo. Ítem:
`{ id, kind, module, title, body, at, day, unread, target }`.
- `kind` = clave del evento (`documents.expiry_weekly`, `operations.daily_report_deviations`, `hse.expiry_weekly`, …); `module` = módulo del evento («Documentación», «Operaciones», …; null si el evento ya no está en el catálogo).
- `at` = fecha y hora argentina con desfase; `day` = día argentino `YYYY-MM-DD` para **agrupar por día**.
- `target`: `{ type: 'daily-report', id }` (avisos de desvíos del parte), `{ type: 'module', id: 'documents' | 'trainings' }` (vencimientos de documentos y de HSE) o `null` (Compras, Almacenes y documentos HSE no tienen pantalla en la app).
- Respuesta: `{ items, nextCursor, unreadCount }` (`unreadCount` solo en la primera página).

### `GET /notifications/count`

`{ unread }` — el mismo número que la campanita de la web (entregas `in_app` sin leer del usuario).

## Búsqueda global

### `GET /search?q=`

`q` de 2 a 60 caracteres (422 si no). Responde `{ q, groups, failed }`; cada grupo `{ type, total, items }` con **hasta 5
ítems** y su `total`. Un grupo para el que el rol no tiene permiso (o cuyo módulo está apagado) **no aparece**. Cada
grupo corre la misma consulta que la lista de su pantalla (`limit: 5`), sin el enriquecimiento que solo sirve a la lista
(resumen documental, chofer, mantenimiento):

| Grupo | Permiso / módulo | Busca en | Ítem |
| --- | --- | --- | --- |
| `employees` | `empleados` + lista de activos y/o bajas | nombre, legajo, CUIL, DNI | `{ id, fileNumber, fullName, position, sector, isActive }` |
| `equipment` | `equipos` + lista de vehículos, equipamiento y/o bajas | dominio, interno, serie, chasis, placa, marca, modelo | `{ id, kind, identifier, domain, internNumber, type, brand, model, isActive }` |
| `documents` | `documentacion` + alguna lista de documentos | tipo de documento y propietario (legajo, nombre, dominio) | `{ id, type, resource { kind, id, name, fileNumber }, status, validity, hasDetail }` |
| `trainings` | `hse` + `hse:capacitaciones:view` | título de capacitaciones publicadas | `{ id, title, kind }` |
| `daily-reports` | `operaciones` + `operaciones:detalle-parte-diario:view` | **fecha**: `2026-11-04`, `04/11/2026`, `4-11-26`, `4/11` (año en curso) | `{ id, date, status, rowCount }` |
| `modules` | siempre (según lo que pueda abrir) | nombre y sinónimos del destino de la app | `{ key, name }` |

`failed` lista los grupos permitidos que fallaron al calcularse; el resto de la respuesta es válido. Costo: los
documentos recalculan el cumplimiento de la empresa (como `/documents`); por eso el mínimo de 2 caracteres.

## Lo que NO se pudo o difiere (revisión 3)

- **Obligatoriedad de una capacitación** (campo y filtro «obligatoria»): no existe en la base (`hse_trainings` no tiene el
  dato; solo el material tiene `is_required`). No se derivó del tipo ni de los destinatarios. Se expone `kind`
  (inducción, refuerzo, específica, otra) y `audience`.
- **Cupos de las sesiones**: `hse_training_records` no tiene capacidad; se informa `attendance { present, registered }`.
- **Video / PDF firmado**: la web sirve el material por una ruta con cookie de sesión, sin enlace firmado móvil (mismo hueco
  que las certificaciones de equipamiento). Solo metadatos y la URL de los enlaces externos. Idem el PDF del acta.
- **«Vence este mes»**: la clasificación común usa 30 días (`expiring`, «Por vencer»), igual que los documentos y el legajo;
  no el mes calendario. «Sin aprobar» es `pending` («Pendiente»).
- **`attention-inbox`**: solo documentos vencidos (ver arriba). «Licencias por decidir» no existe: la base no tiene un estado
  de aprobación de licencias (las ausencias son novedades del diagrama, sin decisión).
- **Avisos derivados**: no hacen falta (hay tabla). «Partes con novedades» llega como aviso `operations.daily_report_deviations`
  cuando el job lo genera, y como tira de días en `/daily-reports/strip`.
- **Rango de los gráficos de tendencia** y filtros de puestos/tipos de los widgets: la app usa los valores por defecto de la web.
