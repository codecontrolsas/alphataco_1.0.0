# Arquitectura de Alphataco: instancias por cliente y app mobile

> **Actualización 2026-10-21:** el almacenamiento S3 pasó de MinIO a **RustFS** (el compose ya no tiene `minio` ni `minio-init`: hay un servicio `storage`, y los buckets los crea `scripts/ensure-buckets.ts`). Donde este documento dice MinIO, leer RustFS. Ver `LOOP-ESTADO.md` (T5).

Oct 20, 2026 · Propuesta para decidir (alternativa a "App mobile y backend de Alphataco")

## Resumen

**Se propone mantener Alphataco como un solo proyecto por cliente (un repo y una VPS por cliente), ordenar la lógica en casos de uso por módulo que usen todos los canales (web, app, API externa, jobs), y agregar la app mobile como un conjunto de piezas incluidas por defecto que se pueden apagar por cliente.** La API móvil corre como un proceso aparte, pero de la misma imagen y del mismo repo. No se propone un backend en otro repo ni en servicios separados.

El diagnóstico de la propuesta original es correcto y se adopta casi completo: las server actions no son una API, faltan permisos y reglas de estado en el servidor, las escrituras no son idempotentes y no hay control de concurrencia. Lo que cambia es **la forma de llevarlo a cabo**, por una razón que la propuesta original no contempla: el modelo de negocio de un clon por cliente, donde cada servicio extra se multiplica por N instancias.

Este documento agrega algo que la propuesta original no cubre: **cómo se crea, despliega, mantiene y prueba cada instancia**, y cómo se lleva un módulo de una instancia a otra. Eso es lo que decide si el sistema es fácil de sostener con N clientes.

Lo que hay que decidir en equipo:
1. Si adoptamos esta dirección (capa de casos de uso + API móvil como proceso aparte de la misma imagen + fábrica de instancias).
2. Si el piloto es el flujo de partes diarios (el mismo de la propuesta original).

Hay un diagrama de arquitectura de referencia: https://claude.ai/artifact/S5oA2oYstpdsQYhjpTvA6N (privado; hay que compartirlo desde su menú).

## Contexto y requisitos

**Modelo de negocio (firme):**
- Se vende a muchas empresas. Por cada cliente se clona el base: **repo propio y VPS propia** (N repos, N VPS, N bases de datos, N buckets).
- Cada clon puede cambiar **cualquier cosa** (flujos, validaciones, permisos, módulos nuevos o eliminados). La divergencia entre clones es aceptada: un arreglo del base se adapta a mano según cuánto haya divergido ese clon.
- Cada clon arranca con los mismos tests del base y los adapta a su proyecto.
- Se necesita poder **dar de alta una instancia nueva rápido**, desplegar y mantener con poco esfuerzo, y **llevar un módulo** de una instancia al base o a otra.

**App mobile:**
- Va incluida por defecto en el paquete y se puede **apagar para un cliente** (para abaratar la oferta).
- **Offline es necesario** y **push es indispensable** (supervisores que crean y editan líneas del parte diario, flujo QR de mantenimiento, aprobaciones, pañol, fotos).
- Una sola app genérica en las tiendas que se conecta al servidor de cada empresa (código de empresa o QR). La marca blanca queda como opción.

**Preferencias del equipo:** código fuerte, modular y fácil de cambiar, aunque requiera más trabajo inicial.

## Estado actual del sistema (verificado en el repo, rama `main`)

| Aspecto | Estado |
|---|---|
| Tamaño | 24 módulos en `src/features/`, 215 modelos Prisma, 85 migraciones, 1.184 funciones exportadas en 328 archivos `'use server'` |
| Lógica de negocio | Dentro de server actions, mezclada con permisos, Prisma y `revalidatePath` |
| API HTTP | Solo `/api/external/v1/*` (lectura, credencial Basic), `/api/files`, `/api/auth`, jobs y health |
| Auth | Better Auth con los plugins `anonymous` y `nextCookies`. No hay `bearer` ni `expo`. La empresa activa sale de una cookie y de `next/headers` |
| Aislamiento entre empresas | `withCompany()` en cada consulta (el propio código lo llama "la única defensa"). **No hay políticas RLS en las migraciones** |
| Permisos | `modulo:tab:accion`, aplicados en la UI y en muchas actions; **no en las mutaciones del detalle del parte diario** (ver hallazgos) |
| Servicios del compose | `postgres`, `minio`, `minio-init`, `migrate`, `app`, `cron`, `mailpit` (dev), `caddy` (un único `reverse_proxy app:3000`) |
| CI/CD | `ci.yml`, `deploy.yml`, `_build-image.yml`, `_deploy.yml` (con `workflow_call`), readiness por sha en `/api/health`, rollback manual |
| Tests | Vitest, pgTAP y suites de integración contra Postgres en CI. **No hay e2e** |
| Mobile, outbox, push, sync, backups, alta de instancia | **No existen** |

**Hallazgos del parte diario (confirmados en `detail/mutations.server.ts`):**
1. El archivo es `'use server'`, solo controla la empresa y no usa `checkPermissionServer`. Las reglas de estado ("no editar si está en certificación", "crear solo si el parte está abierto o es de hoy") están en `detail/lib/row-permissions.ts`, es decir, en la UI. `bulkUpdateRowStatus` se llama directo desde un hook cliente.
2. La edición de recursos hace `deleteMany` y luego `createMany` de las tres relaciones.
3. No hay idempotencia ni versión de fila.
4. `createRowRelations` (recibe una transacción) está exportada desde un archivo `'use server'`, por lo que queda expuesta como endpoint.

El hallazgo 1 es un problema de seguridad hoy, con o sin app. Otras actions de Operaciones sí validan permisos, así que el patrón no es general: hace falta una auditoría de los 328 archivos, no está hecha.

**Problemas del despliegue actual que afectan el alta de una instancia (verificados leyendo código):**
- El seed (`RUN_SEED=true`) importa `permission-catalog.ts` y `prisma-pg-config.ts`, que el Dockerfile no copia al runner. Probablemente falla en la imagen de producción (no se ejecutó la imagen).
- Nadie crea los buckets de MinIO en producción (solo el compose local y los scripts de demo).
- `deploy.yml` tiene la imagen y el registro escritos a mano, y `NEXT_PUBLIC_*` son argumentos de build: hace falta una imagen por cliente.
- El primer admin se crea con un bloque SQL pegado a mano.
- Los IDs de permisos se fijan a mano en `permissions-map.ts`; dos clones que agreguen un módulo cada uno pueden chocar.
- Los jobs corren como Schedules cargados a mano en Dokploy.

## Qué se adopta de la propuesta original

- La capa de casos de uso con el orden fijo: autorizar → validar empresa → validar reglas de estado → escribir en transacción con el actor → emitir evento.
- El contrato de comandos: `commandId` (idempotencia), `capturedAt` y `baseVersion` (concurrencia), con códigos de error estables (`ROW_IN_CERTIFICATION`, `REPORT_CLOSED`, `RESOURCE_INACTIVE`, `VERSION_CONFLICT`).
- Altas y bajas explícitas (`add` / `remove`) al asignar recursos.
- Estado inicial decidido por el servidor; tabla de transiciones válidas en un solo lugar.
- Regla de offline: el servidor siempre manda; los rechazos llegan por push con el motivo.
- Piloto en partes diarios (CU-1, CU-2, CU-3) y su tabla de conflictos como punto de partida.
- Outbox transaccional y worker para el push.
- La tabla de qué va en la app y qué queda en desktop.
- No microservicios; la web no consume la API por HTTP; no sacar los triggers de Postgres.
- Evaluar PowerSync o ElectricSQL antes de escribir un motor de sincronización propio.

## Qué se propone distinto y por qué

| Tema | Propuesta original | Esta propuesta | Razón |
|---|---|---|---|
| Backend | `apps/api` y `apps/worker` como servicios de un monorepo | Misma base de código y misma imagen; la API móvil corre como **otro proceso** del mismo despliegue | Con un repo y una VPS por cliente, cada servicio extra se multiplica por N. El aislamiento de runtime se obtiene sin duplicar repos |
| Alcance | Migrar las ~1.190 actions a `domain` | Extraer casos de uso solo de los flujos que consume la app y de los módulos nuevos; la web llama a esos casos de uso desde actions finas | La web ya funciona; migrar todo por adelantado no aporta a la app y es el mayor costo |
| Permisos | Migrar a "capacidades" | Mantener `modulo:tab:accion` con un mapeo | Cada cliente puede cambiar permisos; migrar el modelo no es necesario para la app |
| Estructura del repo | Monorepo con `packages/domain` | Casos de uso dentro de cada módulo; el código móvil en un repo propio | Un solo paquete de dominio acopla los módulos entre sí y complica llevar un módulo a otra instancia |
| Web sin Prisma | Garantía estructural | Regla de lint por módulo ya migrado | Imponerla sobre 1.184 funciones es costoso y no se necesita para la app |
| IA / MCP | Etapa del plan | Fuera del alcance de esta decisión | Especulativa; no condiciona nada hoy |
| Operación de instancias | No cubierta | Fábrica de instancias, workflows reutilizables, ficha por cliente, backups, rollback, módulos portables | Es lo que hace sostenible el modelo con N clientes |

## Arquitectura propuesta

### Por capas (dentro de cada repo)

```
CANALES (adaptadores finos)
  Web: server actions (en proceso) · API móvil /api/mobile/v1 · API externa · worker/jobs · (IA)
        │  arman el usuario (cookie, token o servicio) y llaman al caso de uso
        ▼
APLICACIÓN: casos de uso por módulo
  autorización (permiso + empresa) · validación Zod · idempotencia (commandId)
  versión esperada (baseVersion) · transacción con actor · evento (outbox)
        │  el contexto {actorId, companyId, permisos} se pasa de forma EXPLÍCITA
        ▼
MÓDULOS: dominio y políticas (transiciones, validaciones; el cliente puede sobrescribirlas)
        ▼
INFRAESTRUCTURA: Prisma/PostgreSQL · MinIO · Better Auth · motor de sync (opcional)
```

Dos puntos de diseño importantes:
- **Contexto explícito.** Hoy el usuario sale de `next/headers` y la empresa de una cookie. "Casos de uso sin `next/*`" implica cambiar la firma de cada flujo que se extraiga a `(ctx, comando) → resultado`. Aplica a cualquier opción de canal.
- **Aislamiento entre empresas.** Hoy lo da `withCompany()`. Se recomienda sumar políticas RLS como segunda barrera. Es requisito si el motor de sincronización lee la base, porque sus reglas de sincronización son una segunda implementación de la autorización.

### Por instancia (una VPS por cliente)

```
Usuarios web ──┐                      ┌── app (Next)        web + server actions
               ├─► caddy ─ rutas ────►├── api (misma imagen) /api/mobile/v1 (proceso aparte)
App móvil ─────┘   /*, /api/mobile/*,  ├── worker             jobs (hoy cron), outbox y push
                   /sync/*, s3.dominio  ├── sync (opcional)    lee el WAL (slot lógico)
                                        └── migrate            una vez por deploy
                    app, api, worker, sync ─► PostgreSQL  y  MinIO (URLs prefirmadas)
```

Servicios que existen hoy: `caddy`, `app`, `cron` (pasa a ser `worker`), `migrate`, `postgres`, `minio`, `minio-init`. A construir: `api`, outbox y push, `sync`.

### La API móvil: ¿dentro del proyecto web?

Tener la API en el mismo código es una ventaja (los casos de uso se comparten). Tenerla **en el mismo proceso** que la web tiene un riesgo de runtime real: ráfagas de reintentos al volver la señal, exportaciones pesadas (PDF y Excel) que bloquean el event loop, y reinicios que caen ambos canales a la vez. Redesplegar la web por un cambio de la app no es el problema: casi todo cambio móvil toca dominio o esquema compartido con la web, y los deploys ya son por cliente.

Solución propuesta: **la misma imagen corriendo dos veces** (`app` y `api`), con Caddy enrutando `/api/mobile/*` al segundo contenedor. Cuesta una línea de Caddyfile y un servicio más en el compose. Versiones en lockstep (un tag para todo), procesos independientes. Si más adelante aparece una razón para un entrypoint propio (conexiones largas de sincronización, un upgrade de Next que moleste), se pasa a un segundo entrypoint (Hono o Fastify) que importa los mismos casos de uso.

### La app móvil

- **Repo móvil único** (Expo). Una app genérica en App Store y Google Play que se conecta al servidor de cada empresa con un código o un QR. La marca blanca es un fork del repo con una build propia, solo para quien la pida.
- **Contratos:** el servidor publica OpenAPI (generado desde los esquemas Zod) y el repo móvil genera su cliente tipado, con una prueba de contrato en CI.
- **`/api/mobile/v1` congelado.** Solo cambios compatibles. Lo propio de un cliente va en otra ruta o por configuración del servidor, para no romper la app genérica. Un endpoint `/capabilities` informa versión de API y módulos habilitados.
- **Auth:** Better Auth con `@better-auth/expo` o `bearer()` (hoy no está probado). La empresa activa y los permisos salen del servidor.
- **Archivos:** URLs prefirmadas de MinIO; la app sube directo (resuelve el tope de 10 MB y las fotos offline).
- **Offline:** base local en el dispositivo, cola de comandos en orden, el servidor manda. Aplicar a los flujos de campo (partes diarios, checklists, QR de mantenimiento).
- **Lectura offline, dos caminos a decidir con una prueba de concepto:** (i) delta propio con una tabla `change_log` alimentada por los triggers que ya existen, o (ii) PowerSync / ElectricSQL. Estos últimos requieren replicación lógica en Postgres, y un slot de replicación detenido retiene WAL hasta llenar el disco: hay que fijar `max_slot_wal_keep_size` y alertas.
- **Push:** registro de dispositivos, outbox y worker que envía por Expo Push. Un proyecto de Expo para N VPS implica poner el token en cada una o mantener un relay central (a decidir).
- **`capturedAt`** viene del reloj del dispositivo: se acota con la hora de recepción del servidor.
- **App apagada para un cliente:** `instance.yml` con `mobile.enabled: false` no levanta `api`, outbox/push ni `sync`. Las tablas de outbox y sync existen igual (migraciones comunes) y quedan vacías.

## Operación de instancias

### Alta de un cliente nuevo: `scripts/instance/new.sh <slug>`

| Paso | Cómo | Tiempo | Hoy |
|---|---|---|---|
| Repo | Copia del base con su historia (`clone --bare` + `push --mirror`), `upstream` e `instance.yml` | 2 min | a construir |
| Secretos | Generados con `openssl` y cargados con `gh secret set` | 1 min | a construir |
| VPS | Contratar, instalar Dokploy o sumarla como servidor remoto | 15-30 min | manual |
| DNS | Registro A hacia la IP; TLS automático | 5 min + propagación | manual |
| Dokploy | Proyecto, postgres, minio, app o compose, variables, dominio y webhook, por API | 2 min | a construir |
| Primer deploy | Build, migraciones, seed y buckets | ~10 min | existe, con 2 bugs |
| Primer admin | `bootstrap-admin.ts` devuelve el link para definir contraseña | 1 min | a construir |
| Jobs y backups | Schedules y `pg_dump` + copia del bucket fuera de la VPS | 2 min | a construir |
| App móvil | Si está activa, registrar la instancia para la app (código/QR → URL) | 2 min | a construir |
| Verificación | `/api/health` con el sha esperado y login | 2 min | existe |

Total: cerca de una hora, la mayor parte esperando VPS, DNS y el build.

### Decisiones de diseño

- **Copia con historia común, no repo plantilla.** Un template de GitHub pierde la historia y rompe `cherry-pick` y `merge-base`, que son lo que sirve para llevar fixes.
- **Workflows de build y deploy alojados en el base**, fijados a una versión (`@v1`), con un archivo mínimo en cada clon. Ya son `workflow_call`. Hay que verificar el acceso entre repos de la cuenta.
- **Registro de imágenes por instancia** (por ejemplo GHCR) en lugar del registro central, que sería un punto único de falla para todas las VPS.
- **Un servicio Compose en Dokploy** con un perfil `mobile`, en vez de servicios sueltos: lo que corre queda declarado en git.
- **Ficha `instance.yml` por clon** (dominio, imagen, módulos activos, móvil, backups, servidor de Dokploy). Los secretos no van en la ficha.
- **Rollback** como workflow que recibe el sha a restaurar (la readiness por sha ya existe). Requiere migraciones solo aditivas.
- **Migraciones:** el servicio `migrate` corre antes de `app`, `api` y `worker`. Las del cliente usan timestamps normales y conviven con las del base. Nunca se edita una migración ya aplicada.
- **Backups:** `pg_dump` diario y copia del bucket a un destino externo, con un `restore.sh` probado una vez por instancia.
- **Monitoreo mínimo:** salud y sha por instancia, jobs con error, disco y fecha del último backup.

### Tests

Cada clon hereda la suite actual (Vitest, pgTAP, integración contra Postgres) y la corre en su CI sin infraestructura propia. Se agrega un `test:all` que encadene las suites, y una carpeta `e2e/` con Playwright organizada por módulo (para que viaje con el módulo), que corre contra el compose completo. Cada clon adapta los tests a su divergencia. Los tests se escriben una vez validado el funcionamiento de cada pieza.

### Llevar un módulo de una instancia al base o a otra

El módulo viaja como una carpeta autocontenida con un manifiesto (`module.ts`) que declara permisos, navegación, buckets y jobs.

- **Esquema Prisma en varios archivos** (uno por módulo). A verificar con Prisma 7 y el `COPY prisma` del Dockerfile.
- **Agregadores centrales** (permisos, navegación, buckets) que leen una lista `src/modules.ts`, lo único que se toca al sumar un módulo.
- **IDs de permisos deterministas** (UUIDv5 de `módulo:tab`) para que dos clones no choquen. Los módulos existentes conservan sus IDs.
- **Migraciones del módulo** con el mismo nombre y contenido en cualquier instancia, para que el checksum coincida.
- **Script `module.sh export|import <Modulo>`:** arma un parche con la carpeta del módulo, su ruta, su esquema, sus migraciones, sus e2e y su demo, y lo aplica con `git apply --3way`. `git subtree` no sirve porque el módulo toca rutas fuera de su carpeta.
- **Fricción que queda:** si el módulo modificó código compartido (`src/shared`, `components/ui`), el import lo avisa y se integra a mano.

### Reglas de propiedad del código y de la base de datos

- Zonas del repo con dueño explícito: `core/` (base), `custom/` (cliente), `contracts/` (API móvil v1, no se edita en el cliente).
- **Funciones y triggers SQL:** hay ~105 en la migración inicial. Un `CREATE OR REPLACE FUNCTION` del base puede pisar una personalización del cliente sin conflicto de git. Hace falta una regla de propiedad antes del primer clon.
- **Tablas del núcleo:** lo que agregue el cliente va en tablas laterales o en una columna JSONB, no en `ALTER` de tablas del base, salvo excepción registrada.
- Las actualizaciones del base se llevan con `git fetch upstream --tags` y `merge` o `cherry-pick`. Un bot que abra el PR de cada tag nuevo en los clones es una comodidad opcional, no un requisito.

## Piloto: líneas del parte diario

Se mantiene el piloto original (CU-1 crear línea, CU-2 asignar o quitar recursos, CU-3 cambiar estado), con estas condiciones:
- Los casos de uso reciben el contexto de forma explícita.
- La server action del detalle pasa a ser un adaptador fino.
- Se corrigen los cuatro hallazgos: permisos y reglas de estado en el servidor, altas y bajas explícitas, `commandId` con una tabla `processed_commands` (resultado guardado dentro de la misma transacción) y `baseVersion`.
- `createRowRelations` deja de exportarse desde un archivo `'use server'`.

**Criterios de cierre del piloto:**
- La web y la app usan los mismos tres casos de uso.
- Ninguna regla queda solo en la UI.
- Agregar un recurso genera un solo registro de historial.
- Un comando enviado dos veces produce un solo efecto.
- En modo avión se puede crear una línea, asignar recursos y completar el turno; al volver la señal todo se sincroniza y un conflicto forzado llega como push con el motivo.
- Los casos de uso no importan nada de `next/*`.

## Plan por etapas

No hay fechas: se estiman al cerrar el piloto.

1. **Seguridad:** permisos y reglas de estado en las mutaciones del parte diario y auditoría de los 328 archivos `'use server'`. Independiente de esta decisión.
2. **Arreglos de la plantilla de instancia:** copiar al runner los archivos que importa el seed, crear los buckets de forma idempotente, `bootstrap-admin.ts`.
3. **Fábrica de instancias:** `instance.yml`, parametrizar `deploy.yml`, workflows reutilizables, `rollback.yml`, backups con `restore.sh`, `new.sh`, monitoreo.
4. **Organización del base antes del primer clon:** contexto explícito, zonas `core/custom/contracts`, esquema Prisma multiarchivo, manifiesto de módulo y `module.sh`, IDs deterministas, regla de propiedad de SQL, `test:all` y e2e base.
5. **Piloto de partes diarios** como casos de uso.
6. **Proceso `api`** (misma imagen), Better Auth con token, contratos OpenAPI, `processed_commands`, `/capabilities`.
7. **Worker** (absorbe el cron) con outbox y push.
8. **App Expo online** (login, lista de partes del día, cambio de estado, foto).
9. **Prueba de concepto de sincronización** (delta propio frente a PowerSync / ElectricSQL), con protección de WAL.
10. **Offline** y el resto de los flujos de campo, uno por uno.

## Riesgos y cuándo cambiaríamos de opinión

| Riesgo | Mitigación |
|---|---|
| El offline es la pieza con más incertidumbre | Prueba de concepto antes de comprometer el motor; empezar online |
| Un slot de replicación detenido llena el disco y tira la web | `max_slot_wal_keep_size` y alertas de disco |
| Un `CREATE OR REPLACE FUNCTION` del base pisa una personalización | Regla de propiedad de funciones y triggers antes del primer clon |
| La app genérica se rompe contra servidores personalizados | `/api/mobile/v1` congelado, `/capabilities` y cambios solo compatibles |
| El aislamiento entre empresas depende de que cada consulta use `withCompany()` | Casos de uso con el contexto explícito; sumar RLS como segunda barrera |
| Migraciones con fecha futura en el repo (hay `20261024…` y hoy es 20/10/2026) | Revisar cómo se ordenan al agregar migraciones por cliente |

**Separaríamos el backend en un servicio propio si:** la API móvil necesita escalar sola dentro de una instancia; hay integraciones de terceros que consumen la API; un equipo móvil o de backend distinto necesita desplegar sin tocar la web; o se mide que el servidor de Next limita la API. Hoy ninguna se cumple, y el costo de pasar a un entrypoint propio es bajo si los casos de uso no dependen de Next.

## Decisiones para la reunión

Las dos primeras definen la dirección. El resto se puede cerrar durante el piloto.

- [ ] 1. ¿Adoptamos esta dirección (casos de uso por módulo, API móvil como proceso aparte de la misma imagen, fábrica de instancias)?
- [ ] 2. ¿El piloto es partes diarios (CU-1, CU-2, CU-3)?
- [ ] 3. ¿Los endpoints de la app van en un proceso aparte desde el inicio (recomendado) o dentro del Next?
- [ ] 4. Perímetro del supervisor en el dispositivo: ¿por cliente, por sector, por diagrama o todo el parte?
- [ ] 5. Tolerancia N (en horas) para crear líneas en un parte que cerró mientras el dispositivo estaba offline.
- [ ] 6. ¿Las reglas que hoy solo aplica la UI se endurecen en el servidor también para la web desde el piloto? (Recomendado: sí.)
- [ ] 7. Recursos inválidos dentro de un comando: ¿parcial o todo o nada?
- [ ] 8. Tabla de transiciones de estado: validarla con Operaciones.
- [ ] 9. Lectura offline: delta propio, PowerSync o ElectricSQL (decidir con la prueba de concepto).
- [ ] 10. Destinatarios de los push de línea creada y línea cancelada.
- [ ] 11. Token de Expo en cada VPS o relay central de push.
- [ ] 12. Dónde se alojan los workflows reutilizables y el registro de imágenes (acceso entre repos y cuota).
- [ ] 13. ¿Se agregan políticas RLS como segunda barrera de aislamiento?

## Lo que no se verificó

- Que Prisma 7 acepte el esquema en varios archivos con el `COPY prisma` del Dockerfile.
- Que la versión de Dokploy instalada soporte servidores remotos y backups nativos.
- Que un workflow del base pueda llamarse desde otro repo de la cuenta de GitHub, y la cuota del registro de imágenes alternativo.
- Que el seed falle en la imagen de producción: se concluyó leyendo el Dockerfile y los imports, sin ejecutar la imagen.
- Que Better Auth soporte el login por token con los plugins indicados en este proyecto.
- El documento del piloto de la propuesta original (`docs/plans/2026-10-20-backend-propio-piloto-partes-diarios.md`) no está en `main` y no se revisó.
- Cuántos de los 328 archivos `'use server'` carecen de permisos o perímetro: una búsqueda simple hecha en la revisión externa marcó unos 94 candidatos (no la reproducimos). Son puntos a auditar, no vulnerabilidades confirmadas.
- Parte del diseño surgió de una revisión independiente de la propuesta original. Lo verificado en el repo se marca como tal; el resto es criterio de diseño que conviene contrastar con la prueba de concepto.
