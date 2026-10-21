# App mobile y backend de Alphataco: propuesta para decidir

Oct 20, 2026 · @fabricio

## Resumen

**La recomendación es dejar de usar las server actions como backend y construir un backend propio: un monolito modular dentro del mismo repositorio.** Una capa `domain` única concentra la lógica, los permisos y la empresa. La usan la web, una app nativa con Expo, la API externa, los procesos en segundo plano y la IA.

Lo que hay que decidir en equipo es si se adopta esta dirección, y en ese caso si arrancamos por el piloto de partes diarios descripto en este informe.

Por qué ahora: alphataco todavía no tiene clientes. El costo de cambiar la base es el más bajo que va a tener, y cada módulo que se suma sobre server actions agranda la migración posterior. Hoy son unas 1.190 funciones en 329 archivos.

El caso de uso piloto está documentado en el repo, en `docs/plans/2026-10-20-backend-propio-piloto-partes-diarios.md`.

## Contexto

Queremos una app mobile para el trabajo de campo: supervisores, operarios de taller, pañol y aprobaciones. Tres requisitos ya están confirmados:

| Requisito | Confirmado | Consecuencia |
| --- | --- | --- |
| Supervisor de Operaciones en la app | Crea líneas del parte diario, asigna recursos a una existente y cambia su estado | El parte diario deja de ser solo de escritorio |
| Offline | Obligatorio | Hace falta base local en el dispositivo, cola de cambios e idempotencia. Descarta la PWA como solución final |
| Push | Indispensable: "no tiene sentido la app sin el push" | Hace falta registro de dispositivos, eventos de dominio y un worker de envío |

Además, el sistema va a seguir sumando módulos y se espera integrar IA. La pregunta no es cómo hacer la app con el menor esfuerzo, sino qué base da el mejor resultado a futuro.

## Estado actual del sistema

Hoy alphataco es un monolito Next 16 que funciona bien para la web, pero no tiene ningún punto de entrada que una app nativa pueda usar para escribir. Datos relevados del repo el 20/10/2026, en la rama `feat/estructura-organigrama`:

| Aspecto | Estado | Impacto en mobile |
| --- | --- | --- |
| Tamaño | 24 módulos en `src/features/`, 215 modelos Prisma, 85 migraciones | Toda la lógica en un solo lugar: ayuda a migrar |
| Capa de negocio | \~1.190 server actions en 329 archivos. Hay carpetas `lib/` con lógica pura, pero permisos, Prisma y `revalidatePath` (57 archivos) están mezclados en las actions | Bloqueo principal: las server actions no son una API |
| API HTTP | Solo `/api/external/v1/*` (6 recursos de solo lectura, credencial Basic por empresa), `/api/files`, `/api/auth`, jobs y health | No hay API de escritura |
| Autenticación | Better Auth con sesión por cookie de 7 días y plugin `anonymous`. Claims de empresa en la sesión, del lado del servidor | Bien resuelto. Better Auth trae `bearer()` y `@better-auth/expo`, así que se agrega sin rediseñar |
| Permisos | `role_permissions` por tab + acción (`modulo:tab:accion`) | Atados a pantallas, no al dominio |
| Archivos | MinIO privado. Subida por server action con `FormData` (tope 10 MB), lectura por `/api/files` con cookie | Insuficiente para fotos tomadas offline |
| Notificaciones | Solo email (`nodemailer`) | No hay push |
| Offline / PWA | Nada: ni manifest ni service worker | Hay que construirlo |
| Responsive | Verificado a 390 px en Empleados, Configuración, Dashboard y el shell. Mantenimiento, Equipos, Documentación y Operaciones están pendientes de navegador | Sirve como referencia de UX, no como app |

Ya existen tres "mini apps de campo", cada una con su login propio: `/maintenance` (QR del equipo con CUIL: checklist, solicitud, gomería), `/operator` (panel del taller por sector) y `/clothing` (entrega de indumentaria con firma). Son el núcleo natural de la app.

## Qué va en la app y qué queda en desktop

Va a la app lo que se hace en el lugar (frente al equipo, en el taller, en el pañol, en la locación), lo que es aprobar o rechazar y la consulta rápida. Queda en desktop la configuración, las tablas anchas, los ABM y las conciliaciones.

| Módulo | App | Solo desktop |
| --- | --- | --- |
| Operaciones | Crear líneas del parte, asignar recursos a una existente, cambiar el estado de la línea (confirmado) | Planificador (preparte), cabecera, clonado, remitos, edición masiva |
| Mantenimiento | Flujo QR (checklist, solicitud, gomería), panel del operario, nuevo pedido, bandeja de aprobaciones y supervisión | Gestión y planificación de órdenes, catálogos y plantillas de cubiertas, tipos de reparación |
| Formularios | Responder formularios y checklists, incluido el QR anónimo | Armado de formularios, respuestas en tabla |
| Indumentaria | Entrega con firma | Catálogo y configuración |
| Almacenes | Crear pedido de materiales, entregar pedido en el pañol, consultar stock | Movimientos, préstamos, depósitos, configuración |
| Compras | Crear solicitud, aprobar solicitud, OC, factura y orden de pago (detalle en solo lectura), confirmar recepción | Cotizaciones, comparativas, carga de facturas, retenciones, proveedores |
| Documentación | Ver el estado documental de un recurso, subir la foto de un documento | Carga masiva multirecurso, tipos de documento, tablas |
| Empleados | Ficha de consulta: legajo, estado documental, contacto, afectaciones | Alta, edición, bajas, diagramas, selección |
| Equipos | Ficha de consulta, estado documental, historial de mantenimiento | Alta, edición, bajas, otros equipos |
| Dashboard | Resumen y vencimientos, en solo lectura | Análisis, gráficos, dashboard personalizable |
| Ayuda | Crear ticket, leer el manual | — |
| Tesorería | Como mucho, consultar saldos | Todo lo demás |
| Comercial, Selección, Configuración, usuarios y permisos | — | Todo |

## Opciones evaluadas

Con offline y push como requisito, solo la opción C los cubre sin hacer trampas. La A y la B sirven para la web de hoy, pero no para más de un cliente.

|  | A. Seguir como estamos | B. PWA sobre el Next actual | C. Backend propio + app Expo |
| --- | --- | --- | --- |
| Offline | No | Limitado: en iOS no hay sincronización en segundo plano y el almacenamiento local se puede borrar | Sí, con base local en el dispositivo y cola de comandos |
| Push | No | Solo con la PWA instalada en iOS | Sí (Expo / FCM / APNs) |
| Versiones viejas en los celulares | Se rompen: el ID de cada server action cambia en cada build | Igual que A | API versionada (`/v1`) |
| IA y terceros | Hay que reescribir la lógica para cada canal | Igual que A | Herramientas finas sobre los mismos casos de uso, con OpenAPI |
| Reglas de negocio | Repartidas entre UI, actions y SQL | Igual que A | Una sola capa, con la autorización adentro |
| Esfuerzo inicial | Ninguno | Bajo | Alto, pero se hace por módulo |
| Costo de cada módulo nuevo | Crece con cada canal | Crece con cada canal | Se escribe una vez |

Que el backend corra en otro proceso es secundario. Lo que define la opción C es que existe **una sola capa de aplicación y todo canal pasa por ella**.

## Caso piloto: líneas del parte diario

El piloto es el primer flujo que pide la app y reúne todo lo difícil en un solo lugar: escritura offline, reglas repartidas, relaciones M:M, historial por triggers y un permiso granular. Si el patrón funciona acá, funciona en el resto. El detalle completo está en `docs/plans/2026-10-20-backend-propio-piloto-partes-diarios.md`.

**Actor:** Supervisor de Operaciones, en campo, con o sin señal.

| ID | Caso de uso | Capacidad nueva | Permiso actual equivalente |
| --- | --- | --- | --- |
| CU-1 | Crear una línea en el parte del día | `daily_report.row.create` | `operaciones:detalle-parte-diario:create` |
| CU-2 | Asignar o quitar recursos de una línea | `daily_report.row.assign_resources` | `operaciones:detalle-parte-diario:assign_resources` |
| CU-3 | Cambiar el estado de una línea | `daily_report.row.change_status` | `operaciones:detalle-parte-diario:update` |

Quedan fuera del piloto, y siguen en la web: eliminar y clonar líneas, la cabecera del parte, remitos, certificación, la carga desde Comercial y el planificador.

### Cómo funciona cada caso de uso

Todo caso de uso recibe `(actor, comando)` y sigue siempre el mismo orden: autorizar, validar empresa, validar reglas de estado, escribir en una transacción con el actor y emitir un evento. Las server actions de la web y los endpoints de la API solo arman el actor y llaman al caso de uso.

- **CU-1 Crear:** el dispositivo genera el id de la línea. El estado inicial no lo manda el cliente: lo decide la conciliación SQL que ya existe (`pendiente` o `sin_recursos_asignados`).
- **CU-2 Recursos:** el comando lleva altas y bajas explícitas (`add` / `remove`). La ausencia de un id no significa nada. Devuelve cuántos se agregaron y cuántos se quitaron.
- **CU-3 Estado:** transiciones explícitas: `ejecutado`, `cancelado` con motivo obligatorio, `reprogramado` con fecha (clona la línea), completar turno diurno o nocturno, reabrir. Las transiciones válidas viven en una sola tabla dentro de `domain`.

### Contrato HTTP (v1)

| Endpoint | Caso de uso | Respuestas |
| --- | --- | --- |
| `POST /v1/daily-report-rows` | CU-1 | `201` creada · `200` comando ya procesado · `422` regla violada |
| `POST /v1/daily-report-rows/{id}/resources` | CU-2 | `200` · `409` conflicto de versión · `422` regla violada |
| `POST /v1/daily-report-rows/{id}/status` | CU-3 | `200` · `409` conflicto de versión · `422` transición no permitida |
| `GET /v1/sync/daily-reports?since=<cursor>` | Bajada | Cambios del perímetro del supervisor (o lo resuelve el motor de sincronización) |

Cada comando lleva `commandId` (idempotencia), `capturedAt` (hora en que lo hizo el usuario) y, en CU-2 y CU-3, `baseVersion` (la versión de la línea que estaba viendo). Los errores tienen códigos estables (`ROW_IN_CERTIFICATION`, `REPORT_CLOSED`, `RESOURCE_INACTIVE`, `VERSION_CONFLICT`) para que la app muestre un mensaje preciso y la IA pueda razonar sobre ellos.

### Offline y conflictos

La acción se aplica en la base local y se encola. Al volver la señal, la cola se envía en orden y la respuesta del servidor reemplaza el estado local: **el servidor siempre manda**. Si el servidor rechaza un cambio, la línea queda marcada en conflicto y llega un push con el motivo.

| Situación | Regla propuesta |
| --- | --- |
| Línea creada hoy offline y sincronizada mañana, con el parte ya cerrado | Se acepta si `capturedAt` es del día del parte y el atraso es menor que N horas (N a definir) |
| Recursos asignados a una línea que en la oficina pasaron a `en_certificacion` | Se rechaza y llega un push |
| Dos dispositivos cambian recursos de la misma línea | Se combinan, porque son altas y bajas, no conjuntos completos |
| Cambio de estado con `baseVersion` vieja | Se rechaza (`409`): la app muestra el estado actual y el supervisor decide |
| Completar turno repetido | Idempotente: no es conflicto |
| Recurso dado de baja entre la captura y la sincronización | Se rechaza ese recurso. Aplicación parcial o todo o nada: a definir |

El push indispensable para que el offline sea usable es el de rechazo de sincronización (`daily_report.row.sync_rejected`). Los avisos de línea creada o cancelada dependen de a quién le sirven, y eso se define con el negocio.

## Hallazgos del código actual

Relevando partes diarios aparecieron cuatro problemas que hoy no se notan porque hay un solo cliente, la web. Con la app pasan a ser bloqueantes, y el piloto los corrige:

1. **Las mutaciones del detalle no verifican permisos ni reglas de estado en el servidor.** `createDailyReportRowPrisma`, `updateDailyReportRowPrisma`, `deleteDailyReportRowPrisma` y `bulkUpdateRowStatus` solo controlan la empresa. Las reglas "no editar si está en certificación", "crear solo si el parte está abierto o es de hoy" y los permisos `create` / `update` / `assign_resources` se aplican escondiendo botones (`detail/lib/row-permissions.ts`). Una server action se puede invocar sin pasar por la pantalla.
2. **Asignar recursos reescribe todo.** La edición borra todas las relaciones y las vuelve a crear, lo cual viola la regla del proyecto sobre M:M. Como el historial se escribe por trigger, agregar un recurso a una línea que ya tiene 10 registra 10 bajas y 11 altas. Offline es inviable: dos dispositivos se pisan el conjunto completo.
3. **Las escrituras no son idempotentes.** Un reintento de red crea dos líneas.
4. **No hay control de concurrencia.** No existe una versión de la línea: gana el último que escribe, sin aviso.

El primer punto probablemente se repite en otros módulos. Conviene auditarlo aunque no se adopte la propuesta.

## Plan por etapas

Cada etapa deja algo que funciona y la siguiente se apoya en ella. No hay fechas: se estiman después de cerrar el piloto.

1. **Base:** monorepo, `packages/domain` con el contexto de actor y el modelo de capacidades. Piloto completo con partes diarios (CU-1, CU-2, CU-3); las server actions del detalle quedan como adaptadores sin lógica.
2. **API:** `apps/api` con Better Auth bearer / Expo, contratos versionados con zod y OpenAPI, idempotencia. La API externa actual se muda ahí.
3. **Eventos y push:** tabla outbox, `apps/worker`, registro de dispositivos. Los jobs que hoy dispara el cron pasan al worker.
4. **Sincronización y app:** motor de sincronización y app Expo con los flujos de campo: partes diarios, QR de mantenimiento, panel del operario, indumentaria, pañol, aprobaciones y fotos de documentos.
5. **Resto de los módulos:** se migran a `domain` de a uno, dentro del loop de rediseño, que ya reescribe pantalla y actions módulo por módulo.
6. **IA:** servidor MCP y procesos de IA (por ejemplo OCR de documentos) sobre los mismos casos de uso y con los permisos del actor.

**Criterios para dar por cerrado el piloto:**

- La web y la app usan los mismos tres casos de uso.
- Ninguna regla queda solo en la UI. Cada regla tiene un test contra el caso de uso.
- Agregar un recurso a una línea genera un solo registro de historial de relaciones.
- Un comando enviado dos veces produce un solo efecto.
- En modo avión se puede crear una línea, asignar recursos y completar el turno. Al volver la señal todo se sincroniza, y un conflicto forzado llega como push con el motivo.
- `apps/web` no depende de Prisma.

## Riesgos y lo que no haríamos

El mayor riesgo no es técnico: es quedar a mitad de camino, con la mitad de los módulos en `domain` y la otra mitad en server actions. Por eso la migración va módulo completo por módulo completo.

| Riesgo | Mitigación |
| --- | --- |
| Dos caminos de entrada (actions y API) que divergen | La autorización y las reglas viven dentro del caso de uso. `apps/web` sin Prisma lo garantiza la estructura de dependencias |
| Migrar permisos de tabs a capacidades rompe accesos existentes | Mapeo uno a uno desde las claves actuales, con migración de `role_permissions`. Se hace antes de tener clientes |
| Endurecer en el servidor reglas que hoy solo aplica la UI cambia el comportamiento | Solo afecta a quien saltea la pantalla. Se decide explícitamente (decisión 5) |
| El motor de sincronización agrega una pieza para operar | Evaluar opciones que corran en el compose propio (PowerSync, ElectricSQL) antes de escribir uno |
| Se frena el rediseño en curso | La migración a `domain` entra en la misma pasada del loop de rediseño de cada módulo |

**Lo que no haríamos:**

- **Microservicios.** Un backend modular, una base y un deploy de API alcanzan de sobra. Partirlo agrega red y transacciones distribuidas sin beneficio a esta escala.
- **Que la web consuma la API por HTTP "por pureza".** Duplica la latencia y no suma seguridad si la autorización está en `domain`. La web llama a `domain` en el mismo proceso.
- **Sacar los triggers de Postgres.** Sirven para cualquier cliente que escriba. Lo que se evita son escritores que no pasen por `domain`.
- **Escribir directo en la base desde el motor de sincronización.** La subida siempre pasa por los casos de uso.

## Decisiones para la reunión

Las dos primeras definen la dirección. Las demás se pueden cerrar durante el piloto.

- [ ] 1\. ¿Adoptamos la opción C (backend propio + app Expo) como dirección?
- [ ] 2\. ¿El piloto es partes diarios (CU-1, CU-2, CU-3)?
- [ ] 3\. Perímetro del supervisor en el dispositivo: ¿por cliente, por sector, por diagrama o todo el parte de la empresa?
- [ ] 4\. Tolerancia N (en horas) para crear líneas en un parte que cerró mientras el dispositivo estaba offline.
- [ ] 5\. ¿Las reglas que hoy solo aplica la UI se endurecen en el servidor también para la web desde el piloto? (Recomendado: sí.)
- [ ] 6\. Recursos inválidos dentro de un comando: ¿aplicación parcial o todo o nada?
- [ ] 7\. Tabla de transiciones de estado: validarla con Operaciones (hoy la edición masiva acepta cualquier estado).
- [ ] 8\. Motor de sincronización: propio, PowerSync o ElectricSQL.
- [ ] 9\. Destinatarios de los push de línea creada y línea cancelada.
