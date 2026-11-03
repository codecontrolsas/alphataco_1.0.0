# API móvil v1 — Equipos y Documentación (solo lectura)

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
