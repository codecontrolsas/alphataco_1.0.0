# Blueprint F2 · Sala de control: recursos de la VPS, latido y estado interno de Alphataco

Diseño de implementación · 2026-10-22 · solo diseño: no se tocó código, base de datos ni despliegues (en la VPS solo hubo lecturas).

**Base de la evidencia:**

- TaskApp: F1 **implementada y sin commitear** en `feat/sala-control-alphataco` de `taskApp-backend` (base `c024073`) y `taskApp-frontend` (base `27436ce`). Las líneas que se citan son las del working tree.
- Alphataco: `origin/main` = **`827c6444`** (#74). La propuesta citaba `ad81b21f` (#73). El worktree está en `refactor/calidad-codigo`, así que todo se citó con `git show origin/main:<ruta>`, sin hacer checkout.
- VPS `31.97.42.82`: relevamiento por SSH de solo lectura (§0.2).
- `BLUEPRINT-F1-SALA-DE-CONTROL.md` (en adelante «F1») y `PROPUESTA-SALA-DE-CONTROL.md` («la propuesta»).
- **`alphataco-arq` no tiene índice de CodeGraph** (no existe `.codegraph/`), así que se leyó directo con `git show` y `git grep`.

Convención: **[verificado]** quiere decir leído en el código o medido; **[supuesto]** quiere decir sin comprobar, y se resuelve en el paso indicado (§12).

**Este blueprint manda sobre la propuesta en lo que difieren**, y respeta las decisiones del usuario:

- **Sin notificaciones.** Todo, incluidas las alertas de recursos y de «dejó de reportar», se ve **solo** en la vista `/alphataco`.
- **El vigilante vive en `31.97.42.82`**, no en `vps-yordan`. El punto ciego de F1 §4.7 se acepta por escrito (§13).
- **Arquitectura limpia, sin sobreingeniería.** Se reutilizan el motor de incidentes, el anti-ruido, el historial y la vista de F1. No se duplica nada.

---

## 0. Punto de partida

### 0.1 Lo que F1 ya resuelve y F2 reutiliza [verificado]

| Pieza de F1                                                                                                               | Dónde                                                                   | Cómo la usa F2                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Máquina de estados anti-ruido `Transition` (ok/fail/unknown, umbrales, gracia)                                            | `internal/service/alphataco_evaluator.go:244-275`                       | **Sin cambios.** Los chequeos de recursos y el latido pasan por la misma función                                |
| `ApplyCheckOutcome`: estado vivo, resultado e incidente en **una** transacción, con `ON CONFLICT` sobre el índice parcial | `internal/repository/alphataco.go:120-196`                              | Se reutiliza. Solo cambian los ids opcionales (host o servicio), el valor medido y la severidad que sube (§3.3) |
| `alphataco_checks` (definición y estado vivo) y `alphataco_check_results` (historial, 7 días)                             | `db/migrations/067_alphataco_monitoring.sql:68-122`                     | Los chequeos de host son **filas de la misma tabla**, con dueño host (§2)                                       |
| `alphataco_incidents`, con un incidente abierto por `check_id`                                                            | `067:126-154`                                                           | Mismo índice `uq_alphataco_incident_open_check`, así que la deduplicación sigue garantizada por la base         |
| Monitor con ticker de 15 s, claim por `next_check_at` y `recover()`                                                       | `internal/service/alphataco_monitor.go:77-158`                          | Se suman dos pasos a la pasada: el latido de hosts y el estado admin (§7 y §9)                                  |
| Sonda `container` vía Dokploy, con circuito                                                                               | `alphataco_monitor.go:317-419`, `dokploy_client.go`                     | Pasa a ser el **respaldo**: si hay agente con dato fresco, manda el agente (§9.2)                               |
| Purga horaria con `pg_try_advisory_xact_lock`                                                                             | `repository/alphataco.go:264-305`                                       | Se le suma el _rollup_ horario y la purga de muestras (§6)                                                      |
| Vista con pestañas, `CheckRow`, `IncidentsTable`, `MonitorBanner` y un único mapa de estados                              | `taskApp-frontend/src/pages/alphataco/*`, `src/lib/alphataco-status.ts` | Se extienden. No se crean mapas paralelos                                                                       |

### 0.2 Relevamiento de la VPS (2026-10-22, solo lectura) [verificado]

| Dato                         | Valor                                                                                                                             | Consecuencia para el diseño                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CPU y RAM                    | 2 vCPU · 7940 MB · `MemAvailable` 2836 MB (36 %)                                                                                  | El agente tiene que costar casi cero                                                                                                   |
| **Swap**                     | **3673 de 4095 MB usados (90 %)**                                                                                                 | **No se alerta por porcentaje de swap**: quedaría una alerta abierta desde el primer día. La presión real se mide con PSI (§5.2)       |
| PSI                          | `/proc/pressure/{cpu,memory,io}` existe. `memory full avg10=0.15`                                                                 | Hay señal de presión real, independiente del swap                                                                                      |
| cgroups                      | v2 (`cgroup2fs`)                                                                                                                  | Memoria y CPU por contenedor salen de archivos, sin `docker stats`                                                                     |
| Disco `/`                    | 71 % (`/dev/sda1`, 96 GB)                                                                                                         | Los umbrales de disco se pueden probar bajándolos a 40 %                                                                               |
| Carga                        | `0.93 0.52 0.49`                                                                                                                  | —                                                                                                                                      |
| Docker                       | 28.5.1, API 1.51, **swarm activo** · 73 contenedores, 70 corriendo                                                                | Hace falta API ≥ 1.41 (`/services?status=true`)                                                                                        |
| `RestartCount`               | **0 en los 70**                                                                                                                   | En swarm, un bucle **no** sube `RestartCount`: se crean tareas nuevas. Se detecta por eventos `die` o por tareas nuevas (§5.3)         |
| Historial de tareas de swarm | `TaskHistoryRetentionLimit = 5`. `docker ps -a` muestra tareas `exited` viejas por cada servicio                                  | **Nunca** contar los `exited` como caída                                                                                               |
| Monitoreo nativo             | ningún contenedor `monitor`, `exporter` ni `cadvisor`                                                                             | Confirma que el de Dokploy está apagado (propuesta §2.5)                                                                               |
| `systemd`                    | 255. El usuario `yordan` está en `sudo` y en `docker`                                                                             | Se puede instalar un servicio (con aprobación)                                                                                         |
| Servicios de Alphataco       | `alphataco-app-vta1g3` 1/1, `app-input-wireless-hard-drive-feyykf` 1/1, `alphataco-db-geds8x` 1/1, `alphataco-landing-p4ia47` 1/1 | El `appName` de Dokploy **es** el nombre del servicio de swarm, así que el agente y el seed de F1 se cruzan sin tabla de equivalencias |
| Dominio público de TaskApp   | `apitaskapp.codecontrol.com.ar` (`/etc/dokploy/traefik/dynamic/taskapp-backend-iiasgd.yml`)                                       | Es el destino del agente                                                                                                               |

### 0.3 Numeración de migraciones [verificado]

- `origin/main` de `taskApp-backend` termina en `065_create_booking_pages.sql`, y F1 agrega 066 y 067 (sin commitear).
- **F2 usa `068_alphataco_hosts_and_status.sql`.**
- La propuesta reservaba 068 para F3 (`alphataco_module_changes`): **F3 pasa a 069.**
- Antes de implementar, volver a listar `db/migrations/` en `origin/main` por si alguien tomó 068.

### 0.4 Convenciones

Son las de F1 §0 y no se repiten:

- capas planas `model` / `repository` / `service` / `handler`;
- cableado en `main.go`;
- identificadores en inglés y comentarios en español;
- verificación con `go build ./... && go vet ./cmd/... ./internal/... ./db/...` (no `go vet ./...`, que ya falla en `main` por `integration_test.go:70`), `pnpm lint && pnpm build` en el frontend y `npm run check-types` en Alphataco (**nunca** `npm run lint`: `.claude/rules/no-format-commands.md`);
- **sin tests nuevos**.

---

## 1. Decisiones principales (resumen)

| #   | Decisión                                                                                                                                                                                             | Por qué (detalle en §13)                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Agente propio: binario Go estático, solo con la biblioteca estándar, corriendo como servicio `systemd`** (no contenedor, no script)                                                                | Sobrevive a que Docker o el swarm se cuelguen, que es justo cuando más hace falta. Cuesta unos 10 MB de RSS. Guarda estado entre muestras (delta de CPU, búfer ante cortes, stream de eventos). No queda bajo el control de Dokploy                             |
| D2  | **Se descarta el monitoreo nativo de Dokploy**                                                                                                                                                       | Está apagado, `getServerHealth` no trae CPU en uso, activarlo es una **escritura** con la key de administrador total y los datos quedarían en Dokploy, no en TaskApp                                                                                            |
| D3  | **Empuje (push) por HTTPS con un token por servidor**, guardado como SHA-256, con rotación por solapamiento y revocación                                                                             | El agente no abre puertos. El latido sale gratis («dejó de reportar»). TaskApp no necesita ninguna llave de la VPS                                                                                                                                              |
| D4  | **Los chequeos de host son filas de `alphataco_checks` con dueño host** (`host_id`, `service_id` pasa a admitir NULL, con un CHECK de «exactamente uno»)                                             | Reutiliza `Transition`, `ApplyCheckOutcome`, el historial, `CheckRow` y el índice único por `check_id`. Si se guardaran con `check_id NULL`, dos hosts con el disco lleno compartirían un solo incidente (`uq_alphataco_incident_open_kind` es solo por `kind`) |
| D5  | **Las alertas por servicio de Alphataco** (contenedor caído o unhealthy, bucle de reinicio) **siguen siendo chequeos de servicio**. Si hay agente, el dato sale del agente; si no, de Dokploy        | Un solo chequeo `container` con dos fuentes. Es la liveness real de `alphataco-api` (propuesta §2.5), sin depender de la key de Dokploy                                                                                                                         |
| D6  | **Las muestras de recursos se evalúan al ingresar; el latido, en el tick del monitor**                                                                                                               | Una muestra es un paso de la máquina de estados, así que «sostenido N minutos» es literalmente «N muestras seguidas». La ausencia de muestras solo se puede ver desde el reloj de TaskApp                                                                       |
| D7  | **`GET /api/admin/v1/status` en Alphataco**, de solo lectura, con `ADMIN_STATUS_TOKEN` y `prismaSystem`, sin PII. TaskApp lo consulta **una vez cada 5 minutos** como un chequeo más                 | Los jobs corren una vez por día: no hace falta consultarlo más seguido. Además protege la base de la instancia                                                                                                                                                  |
| D8  | **El token saliente (`ADMIN_STATUS_TOKEN`) se guarda cifrado con AES-256-GCM** en `alphataco_secrets`, el diseño que F1 §7.2 dejó para F2. **El token entrante del agente se guarda solo como hash** | TaskApp necesita **mandar** el primero, así que tiene que poder descifrarlo. El segundo solo lo **verifica**, y para eso alcanza con el hash                                                                                                                    |

---

## 2. Modelo: cómo encaja F2 en las tablas de F1

```
alphataco_hosts ──< alphataco_host_tokens          (tokens del agente: hash, prefijo, vencimiento, revocación)
      │  ├──< alphataco_host_samples              (1/min, 7 días)    ──► rollup ──► alphataco_host_samples_hourly (180 días)
      │  ├──1 alphataco_host_snapshots            (último estado de contenedores y montajes, se pisa)
      │  └──< alphataco_checks  (host_id)          host_heartbeat · host_cpu · host_memory · host_disk · host_disk_trend · host_restart_loop
      │
alphataco_instances.host_id ─┘   (en qué servidor corre la instancia; NULL = sin agente)
      ├──< alphataco_services ──< alphataco_checks (service_id)   F1 + admin_status · jobs · migrations · restart_loop
      ├──< alphataco_secrets                       (admin_status_token cifrado)
      └── admin_status (jsonb) + admin_status_at   (último payload de /api/admin/v1/status, para la vista)

alphataco_incidents: check_id (siempre, salvo dokploy_unreachable) + instance_id | host_id
```

- **Un host puede tener varias instancias.** En la VPS de Dokploy hoy hay una sola (`demo`), y cada cliente tendrá su VPS (`PROPUESTA-ACEPTADA.md:9,24`).
- **Los chequeos de recursos son del host**, no de la instancia: un disco lleno se ve igual desde todas las instancias del host y abre **un** incidente.

---

## 3. Archivos a crear o modificar

### 3.1 TaskApp backend (`taskapp/taskApp-backend`)

| Archivo                                            | Acción    | Responsabilidad                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `db/migrations/068_alphataco_hosts_and_status.sql` | crear     | §4 completa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `internal/model/alphataco_agent.go`                | crear     | **Contrato del agente** (`AgentReport`, `AgentSample`, `AgentUnit`, `AgentMount`, `AgentReportResponse`). Solo structs con etiquetas JSON y `const AgentProtocolVersion = 1`. **Lo importan el servidor y el agente**: el contrato vive en un único lugar                                                                                                                                                                                                                                                           |
| `internal/model/alphataco_host.go`                 | crear     | Entidades y DTOs de host (`AlphatacoHostSummary`, `AlphatacoHostDetail`, `AlphatacoHostToken`, `AlphatacoSamplePoint`, `IssuedToken`) y constantes de los tipos de chequeo nuevos                                                                                                                                                                                                                                                                                                                                   |
| `internal/model/alphataco.go`                      | modificar | Constantes de los tipos nuevos de chequeo e incidente. `AlphatacoInstanceSummary` suma `Host *AlphatacoHostRef`. `AlphatacoInstanceDetail` suma `HasAdminStatusToken`, `AdminStatus json.RawMessage` y `AdminStatusAt`. `AlphatacoIncident` suma `HostID` y `HostSlug`. `AlphatacoOverview` suma `Hosts []AlphatacoHostSummary`. `AlphatacoCheck` suma `Params json.RawMessage` y `LastValue *float64`. `AlphatacoCheckResult` suma `Value`. `AlphatacoCheckWithService` suma `Params`, `HostID` e `InstanceHostID` |
| `internal/repository/alphataco.go`                 | modificar | `ApplyOutcomeInput` pasa a `ServiceID`, `InstanceID` y `HostID *int64` y suma `Value *float64` y `RaiseSeverityTo string` (§3.3). `CloseIncidentsOfDisabledChecks` cubre también los chequeos de host. `summaries`, `ListIncidents` e `InstanceDetail` suman el host. `PurgeOldData` suma muestras y _rollup_. `SetMonitoringEnabled` pasa a `PatchInstance` (también `host_id`)                                                                                                                                    |
| `internal/repository/alphataco_hosts.go`           | crear     | `AlphatacoHostRepository` (implementada por el mismo `alphatacoRepo`): tokens, ingreso, snapshot, claim del latido, series y ABM mínimo de hosts (§3.4)                                                                                                                                                                                                                                                                                                                                                             |
| `internal/repository/alphataco_secrets.go`         | crear     | `PutSecret` y `GetSecret` (bytes cifrados), `DeleteSecret` y `HasSecret`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `internal/service/secretbox.go`                    | crear     | AES-256-GCM con la biblioteca estándar. Claves `ALPHATACO_SECRETS_KEY_V{n}` (32 bytes en base64), _nonce_ aleatorio de 12 bytes y AAD = `instance:{id}                                                                                                                                                                                                                                                                                                                                                              | {name}`. Sin claves, `Configured() = false` |
| `internal/service/alphataco_host_eval.go`          | crear     | **Lógica pura** de recursos: `EvaluateHostCheck(check, HostEvalInput) Outcome`, `EvalHeartbeat(...)`, `gauge(v, open, clear, hasOpen)`, `DiskTrend` y `ParseCheckParams`. Sin E/S, como el evaluador de F1                                                                                                                                                                                                                                                                                                          |
| `internal/service/alphataco_evaluator.go`          | modificar | `ContainerProbe` suma `Source` (`agent` o `dokploy`), `Unhealthy`, `Desired` y `Restarts15m`. `evalContainer` exige al menos una réplica **sana**. Nuevo `evalRestartLoop`. Nuevos `evalAdminStatus`, `evalJobs` y `evalMigrations`. `InstanceSnapshot` suma `Admin *AdminStatusProbe`. `IncidentSummary` cubre los tipos nuevos. Un `Outcome` con `Result == ""` quiere decir «esta pasada no se evalúa» (para el chequeo cada 5 min)                                                                              |
| `internal/service/alphataco_monitor.go`            | modificar | (1) Sonda `admin_status` cada 5 min. (2) Contenedores: primero el snapshot del agente, y Dokploy como respaldo. (3) Paso `runHeartbeats`, con claim de hosts y gracia de arranque. Pasa a recibir `AdminStatusProber`, `SecretReader` y `HostRepository`                                                                                                                                                                                                                                                            |
| `internal/service/alphataco_probes.go`             | modificar | `HTTPProber.AdminStatus(ctx, appURL, token) AdminStatusProbe`: mismo cliente, 64 KiB, sin redirecciones; 401 y 404 se distinguen. **El token nunca aparece en un error**                                                                                                                                                                                                                                                                                                                                            |
| `internal/service/alphataco_ingest.go`             | crear     | `AlphatacoIngestService.Report(host, report, receivedAt)`: valida, guarda las muestras (idempotente), actualiza el snapshot y evalúa la muestra más nueva si está fresca (§7.1)                                                                                                                                                                                                                                                                                                                                     |
| `internal/service/alphataco_hosts.go`              | crear     | Consultas y ABM mínimo de hosts, emisión y revocación de tokens (`crypto/rand`) y chequeos por defecto de un host nuevo (`defaultHostChecks()`)                                                                                                                                                                                                                                                                                                                                                                     |
| `internal/service/alphataco.go`                    | modificar | `Overview` suma hosts. `SetAdminStatusToken` y `DeleteAdminStatusToken`. `PatchCheck` (enabled y params, validados por tipo)                                                                                                                                                                                                                                                                                                                                                                                        |
| `internal/middleware/agent_token.go`               | crear     | `AgentTokenAuth(repo)`: Bearer → SHA-256 → host. **No loguea el token** (a diferencia de `apikey.go:29,34`, que lo hace; eso queda fuera de alcance y se reporta en §13.3). Pone `host` en el contexto. 401 sin detalle                                                                                                                                                                                                                                                                                             |
| `internal/handler/alphataco_agent.go`              | crear     | `POST /api/agent/v1/reports`: `MaxBytesReader`, gzip con tope de descompresión y validación                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `internal/handler/alphataco.go`                    | modificar | Los endpoints de hosts, tokens, chequeos, secretos y filtros nuevos (§8.2)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cmd/server/main.go`                               | modificar | Construir el repo de hosts, `secretbox`, el servicio de ingreso y el monitor con las dependencias nuevas. Registrar `r.Route("/api/agent/v1", …)` **fuera** de `/api/alphataco` (cerca de `:647`, junto a `/api/public/v1`). Sumar las rutas al grupo existente (`:598-607`)                                                                                                                                                                                                                                        |
| `.env.example`                                     | modificar | `ALPHATACO_SECRETS_KEY_V1=` (sin valor) y comentario de cómo generarla: `openssl rand -base64 32`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `db/seeds/alphataco_demo.sql`                      | modificar | Suma los chequeos `admin_status`, `jobs`, `migrations` y `restart_loop` de la demo. El host **no** va en el seed: se crea por API para obtener el token (§12, paso 11)                                                                                                                                                                                                                                                                                                                                              |
| `cmd/alphataco-agent/main.go`                      | crear     | Arranque: config del entorno, bucle, señales y log mínimo a stderr (journald)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `internal/agent/collector_host.go`                 | crear     | `/proc/stat` (delta), `/proc/loadavg`, `/proc/meminfo`, `/proc/pressure/*`, `/proc/uptime` y `statfs`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `internal/agent/collector_docker.go`               | crear     | Cliente HTTP sobre el socket unix, **con una lista blanca de tres GET** (`/containers/json`, `/services`, `/events`). Agrega por unidad (§5.3)                                                                                                                                                                                                                                                                                                                                                                      |
| `internal/agent/cgroup.go`                         | crear     | `memory.current` y `cpu.stat` por contenedor (cgroup v2). Si el archivo no existe → `null`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `internal/agent/sender.go`                         | crear     | POST con gzip, búfer en anillo, reintento y respuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `deploy/alphataco-agent/alphataco-agent.service`   | crear     | Unidad `systemd` endurecida (§5.6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `deploy/alphataco-agent/install.sh`                | crear     | Instalación idempotente: lee el token de **stdin**, nunca de un argumento. Lo usa el procedimiento manual y, más adelante, el alta remota (§5.7). **No se ejecuta en F2**                                                                                                                                                                                                                                                                                                                                           |

**El `Dockerfile` no cambia:** compila solo `./cmd/server` (`Dockerfile:7`, `go build -o server ./cmd/server`) y el runtime copia solo ese binario. El agente nunca entra en la imagen de TaskApp [verificado].

### 3.2 TaskApp frontend (`taskapp/taskApp-frontend`)

| Archivo                                                 | Acción    | Responsabilidad                                                                                                                                                                                          |
| ------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/alphataco.ts`                                | modificar | Tipos nuevos que espejan §8. `AlphatacoCheckType` y `AlphatacoIncidentKind` suman los tipos nuevos (**no** se crea una unión aparte)                                                                     |
| `src/api/alphataco.ts`                                  | modificar | `hosts()`, `host(id)`, `hostSamples(id, range)`, `createHost`, `patchHost`, `issueToken`, `revokeToken`, `patchCheck`, `setAdminStatusToken`, `deleteAdminStatusToken`. `incidents` suma `hostId`        |
| `src/hooks/use-alphataco.ts`                            | modificar | `useAlphatacoHost`, `useHostSamples` (solo con la pestaña de gráficos visible), las mutaciones, y todas las `queryKey` bajo `["alphataco", …]`                                                           |
| `src/lib/alphataco-status.ts`                           | modificar | `CHECK_TYPE_LABEL` suma los tipos nuevos. Nuevo `formatBytes` y `formatPct`. **Es el mismo mapa**, solo se extiende                                                                                      |
| `src/pages/alphataco/index.tsx`                         | modificar | Pestaña nueva «Servidores», entre «Instancias» e «Incidentes»                                                                                                                                            |
| `src/pages/alphataco/host-detail.tsx`                   | crear     | `AlphatacoHostPage` (`/alphataco/servidores/:id`)                                                                                                                                                        |
| `src/pages/alphataco/components/host-card.tsx`          | crear     | Tarjeta de servidor: medidores en texto más barra y latido                                                                                                                                               |
| `src/pages/alphataco/components/resource-meter.tsx`     | crear     | Barra accesible (`role="meter"`, con `aria-valuenow`, `aria-valuemin`, `aria-valuemax` y el valor en texto)                                                                                              |
| `src/pages/alphataco/components/host-charts.tsx`        | crear     | Gráficos con **`recharts`** (ya instalado, `^2.15.4`, y usado en `src/components/dashboard/*-chart.tsx`). El archivo vive dentro del chunk diferido de la página, así que no suma nada al bundle inicial |
| `src/pages/alphataco/components/containers-table.tsx`   | crear     | Tabla de unidades (contenedores agregados)                                                                                                                                                               |
| `src/pages/alphataco/components/agent-tokens.tsx`       | crear     | Lista de tokens y diálogo «Generar token» que lo muestra **una sola vez**                                                                                                                                |
| `src/pages/alphataco/components/admin-status-panel.tsx` | crear     | Panel del detalle de instancia: versión, migraciones, módulos (solo lectura), conteos y jobs                                                                                                             |
| `src/pages/alphataco/components/threshold-dialog.tsx`   | crear     | Editar `params` y `enabled` de un chequeo de recursos (`AlertDialog` / `Dialog`; nunca `window.confirm`)                                                                                                 |
| `src/pages/alphataco/instance-detail.tsx`               | modificar | Enlace al servidor, `AdminStatusPanel` y el campo del token (solo escritura)                                                                                                                             |
| `src/pages/alphataco/components/incidents-table.tsx`    | modificar | Columna «Instancia / servidor» (`instance_slug ?? host_slug`)                                                                                                                                            |
| `src/pages/alphataco/components/check-row.tsx`          | modificar | Muestra `last_value` con su unidad y el botón «Umbrales» en los tipos que lo admiten. El historial suma la columna `value`                                                                               |
| `src/pages/alphataco/components/monitor-banner.tsx`     | modificar | Caso nuevo: «N servidores sin agente o sin reportar»                                                                                                                                                     |
| `src/App.tsx`                                           | modificar | Ruta diferida `/alphataco/servidores/:id` dentro del mismo `CapabilityRoute` (`:137-142`)                                                                                                                |

### 3.3 Cambios puntuales de F1 (detalle)

- **`ApplyOutcomeInput`:**
  - `ServiceID`, `InstanceID` y `HostID` pasan a `*int64`. El `INSERT` del incidente escribe los tres. En un chequeo de host, `instance_id` y `service_id` van NULL y `host_id` va con valor.
  - `Value *float64` se guarda en `alphataco_checks.last_value` y en `alphataco_check_results.value`.
  - `RaiseSeverityTo string`: en `IncidentTouch` y `IncidentOpen`, `severity = CASE WHEN $sev = 'critical' THEN 'critical' ELSE severity END`. Sirve para que el disco pase de alta a crítica (85 → 92 %) **sin abrir un segundo incidente**.
- **`CloseIncidentsOfDisabledChecks`:** hoy hace JOIN con `alphataco_services` (`repository/alphataco.go:222-233`), así que un chequeo de host nunca entraría. Se suma una segunda sentencia: cerrar los incidentes de chequeos con `host_id` cuyo chequeo o host está deshabilitado.
- **`summaries`:** la consulta de incidentes (`:396-427`) ignora los que tienen `instance_id NULL` (salvo Dokploy). Ahora:
  - suma a cada instancia los incidentes abiertos de **su host**;
  - el overview suma `hosts[]` con su propio `open_incidents`.
- **`ListIncidents`** (`:540-577`): `LEFT JOIN alphataco_hosts h ON h.id = i.host_id`, devuelve `host_slug` y acepta el filtro `host_id`.
- **`ListEnabledChecks`** (`:92-118`) no cambia: el `JOIN alphataco_services` ya deja afuera los chequeos de host. Solo suma `c.params` y `n.host_id` al `SELECT`.

### 3.4 `AlphatacoHostRepository`

```go
type AlphatacoHostRepository interface {
    // Agente
    HostByTokenHash(hash []byte, now time.Time) (*model.AgentHost, error)   // nil si no existe, está revocado, vencido o el host está deshabilitado
    TouchToken(tokenID int64, ip string, now time.Time) error                 // con throttle: solo si last_used_at < now-5min
    StoreReport(hostID int64, samples []model.AgentSample, snap *model.AgentSnapshot, facts model.AgentFacts, receivedAt time.Time) (stored int, err error)
    ClaimEvaluation(hostID int64, sampledAt time.Time) (bool, error)          // UPDATE … SET last_evaluated_at WHERE < $2 RETURNING
    ListEnabledHostChecks(hostID int64) ([]model.AlphatacoCheckWithService, error)
    DiskSeries(hostID int64, since time.Time) (slopeBytesPerSec *float64, points int, err error) // regr_slope en SQL
    // Monitor (latido)
    ClaimDueHosts() ([]model.AlphatacoHostBeat, error)                        // mismo patrón que ClaimDueInstances
    SnapshotForInstance(instanceID int64) (*model.AgentSnapshot, time.Time, error)
    // Vista y ABM
    ListHosts() ([]model.AlphatacoHostSummary, error)
    HostDetail(id int64) (*model.AlphatacoHostDetail, error)
    Samples(id int64, from time.Time, bucket time.Duration, hourly bool) ([]model.AlphatacoSamplePoint, error)
    CreateHost(in model.CreateHostInput, checks []model.HostCheckSpec, tokenHash []byte, prefix string, actor int64) (*model.AlphatacoHostSummary, int64, error) // una transacción
    PatchHost(id int64, in model.PatchHostInput) (*model.AlphatacoHostSummary, error)
    IssueToken(hostID int64, hash []byte, prefix, note string, actor int64, expireOthersAt time.Time) (int64, error) // una transacción
    RevokeToken(hostID, tokenID int64) (bool, error)
}
```

---

## 4. Migración `068_alphataco_hosts_and_status.sql` (completa)

Todo es aditivo o **relaja** una restricción:

- `DROP NOT NULL`;
- CHECKs más amplios, que aceptan todo lo que ya aceptaban;
- columnas nuevas con default.

No se pierde ni se reescribe ningún dato. Es reaplicable, como exige el runner, que no abre transacción por archivo (F1 §0, `db/postgres.go:164`). Los CHECK sin nombre de 067 se buscan por su definición y no por un nombre adivinado. Igual se verifica con `\d` en el paso 1.

```sql
-- Sala de control de Alphataco (F2): servidores (hosts) con un agente de empuje,
-- muestras de recursos con retención acotada, chequeos de recursos y latido
-- integrados al motor de incidentes de F1, y estado interno de cada instancia
-- (GET /api/admin/v1/status de Alphataco) con su token guardado cifrado.
--
-- Todo es aditivo o relaja restricciones de 067 (DROP NOT NULL, CHECK más
-- amplios): no se reescribe ni se pierde ningún dato. Reaplicable: el runner no
-- abre transacción por archivo.

-- ---------------------------------------------------------------------------
-- Servidores
-- ---------------------------------------------------------------------------

-- Un servidor (VPS) donde corre un agente. Puede alojar varias instancias.
CREATE TABLE IF NOT EXISTS alphataco_hosts (
    id                  BIGSERIAL   PRIMARY KEY,
    slug                TEXT        NOT NULL UNIQUE
                                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    name                TEXT        NOT NULL,
    provider            TEXT        NOT NULL DEFAULT '',   -- "Hostinger", informativo
    address             TEXT        NOT NULL DEFAULT '',   -- IP o nombre, informativo
    monitoring_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Cada cuánto reporta el agente. El latido se calcula a partir de esto.
    report_interval_s   INT         NOT NULL DEFAULT 60
                                    CHECK (report_interval_s BETWEEN 15 AND 600),
    -- Claim del latido en el monitor (mismo patrón que alphataco_instances).
    next_check_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Horas del RELOJ DE TASKAPP (recepción): el latido no depende del reloj del agente.
    first_report_at     TIMESTAMPTZ,
    last_report_at      TIMESTAMPTZ,
    -- Hora (reloj del agente) de la muestra más nueva recibida y de la última evaluada.
    last_sample_at      TIMESTAMPTZ,
    last_evaluated_at   TIMESTAMPTZ,
    -- recepción - muestra de la última muestra fresca; la vista avisa si |skew| > 120 s.
    clock_skew_s        INT,
    -- Datos que informa el agente (se pisan en cada reporte).
    agent_version       TEXT,
    hostname            TEXT,
    kernel              TEXT,
    cpu_count           INT,
    mem_total_mb        INT,
    docker_version      TEXT,
    notes               TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tokens del agente. Solo el SHA-256: el valor se muestra una vez al emitirlo.
-- Rotación por solapamiento: al emitir uno nuevo, los anteriores reciben
-- expires_at (24 h por defecto) en vez de morir en el acto, para que el agente
-- se pueda reconfigurar sin perder reportes. Revocación inmediata con revoked_at.
CREATE TABLE IF NOT EXISTS alphataco_host_tokens (
    id            BIGSERIAL   PRIMARY KEY,
    host_id       BIGINT      NOT NULL REFERENCES alphataco_hosts(id) ON DELETE CASCADE,
    token_hash    BYTEA       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    -- Primeros caracteres del token ("ata1_k3Jd9…"): para reconocerlo en la vista sin exponerlo.
    token_prefix  TEXT        NOT NULL,
    note          TEXT        NOT NULL DEFAULT '',
    created_by    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ,                 -- NULL = no vence
    last_used_at  TIMESTAMPTZ,
    last_used_ip  TEXT,
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alphataco_host_tokens_host
    ON alphataco_host_tokens (host_id) WHERE revoked_at IS NULL;

-- Muestras de 1 minuto. Retención 7 días (purga horaria). La PK hace idempotente
-- el reenvío del búfer del agente tras un corte de red.
CREATE TABLE IF NOT EXISTS alphataco_host_samples (
    host_id               BIGINT      NOT NULL REFERENCES alphataco_hosts(id) ON DELETE CASCADE,
    sampled_at            TIMESTAMPTZ NOT NULL,          -- reloj del agente
    received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cpu_pct               REAL,      -- % de CPU ocupada, promedio del intervalo (delta de /proc/stat)
    load1                 REAL,
    load5                 REAL,
    load15                REAL,
    mem_avail_pct         REAL,      -- MemAvailable / MemTotal
    swap_used_pct         REAL,      -- informativo: NO dispara alertas (ver blueprint F2 §5.2)
    psi_cpu_some_avg60    REAL,
    psi_mem_full_avg60    REAL,
    psi_io_full_avg60     REAL,
    disk_used_pct         REAL,      -- montaje principal (el primero de AGENT_MOUNTS, "/" por defecto)
    disk_used_bytes       BIGINT,
    disk_total_bytes      BIGINT,
    containers_running    INT,
    containers_unhealthy  INT,
    units_degraded        INT,       -- servicios con réplicas corriendo < deseadas
    restarts_15m          INT,       -- eventos die de los últimos 15 min (todo el host)
    PRIMARY KEY (host_id, sampled_at)
);
CREATE INDEX IF NOT EXISTS idx_alphataco_host_samples_time
    ON alphataco_host_samples (sampled_at);

-- Agregado horario. Lo llena la purga (rollup idempotente) antes de borrar las
-- muestras crudas. Retención 180 días.
CREATE TABLE IF NOT EXISTS alphataco_host_samples_hourly (
    host_id               BIGINT      NOT NULL REFERENCES alphataco_hosts(id) ON DELETE CASCADE,
    hour                  TIMESTAMPTZ NOT NULL,
    samples               INT         NOT NULL,
    cpu_avg               REAL,
    cpu_max               REAL,
    load1_max             REAL,
    mem_avail_min         REAL,
    mem_avail_avg         REAL,
    psi_mem_full_max      REAL,
    disk_used_pct_max     REAL,
    disk_used_bytes_last  BIGINT,
    restarts_sum          INT,
    PRIMARY KEY (host_id, hour)
);

-- Último estado de contenedores y montajes del host (una fila por host, se pisa
-- en cada reporte). Separado de alphataco_hosts para no reescribir la fila del
-- host con ~10 KB de JSON cada minuto.
CREATE TABLE IF NOT EXISTS alphataco_host_snapshots (
    host_id       BIGINT      PRIMARY KEY REFERENCES alphataco_hosts(id) ON DELETE CASCADE,
    sampled_at    TIMESTAMPTZ NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    docker_ok     BOOLEAN     NOT NULL,
    docker_error  TEXT,                    -- texto corto ("sin respuesta del socket")
    mounts        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    units         JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- En qué servidor corre la instancia. NULL = sin agente (degradación limpia, §9.3).
ALTER TABLE alphataco_instances
    ADD COLUMN IF NOT EXISTS host_id BIGINT REFERENCES alphataco_hosts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_alphataco_instances_host ON alphataco_instances (host_id);

-- Último payload de /api/admin/v1/status (para la vista) y cuándo se obtuvo.
ALTER TABLE alphataco_instances ADD COLUMN IF NOT EXISTS admin_status    JSONB;
ALTER TABLE alphataco_instances ADD COLUMN IF NOT EXISTS admin_status_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Chequeos: dueño servicio (F1) o dueño host (F2)
-- ---------------------------------------------------------------------------

ALTER TABLE alphataco_checks ALTER COLUMN service_id DROP NOT NULL;
ALTER TABLE alphataco_checks
    ADD COLUMN IF NOT EXISTS host_id BIGINT REFERENCES alphataco_hosts(id) ON DELETE CASCADE;
-- Parámetros por chequeo (umbrales, montaje, ventana). '{}' = los defaults del código.
ALTER TABLE alphataco_checks ADD COLUMN IF NOT EXISTS params     JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Último valor medido (%, horas hasta llenarse, reinicios), para la vista.
ALTER TABLE alphataco_checks ADD COLUMN IF NOT EXISTS last_value REAL;
ALTER TABLE alphataco_check_results ADD COLUMN IF NOT EXISTS value REAL;

DO $$
DECLARE c record;
BEGIN
    -- 1) Ampliar el CHECK de type (067 lo creó sin nombre: se busca por definición).
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'alphataco_checks'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE 'CHECK ((type = ANY (ARRAY[%'
               AND conname <> 'alphataco_checks_type_check_v2'
    LOOP
        EXECUTE format('ALTER TABLE alphataco_checks DROP CONSTRAINT %I', c.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alphataco_checks_type_check_v2') THEN
        ALTER TABLE alphataco_checks ADD CONSTRAINT alphataco_checks_type_check_v2 CHECK (type IN (
            -- F1 (servicio)
            'app_health', 'db_via_health', 'storage_via_health', 'api_capabilities',
            'sha_match', 'tcp', 'container',
            -- F2 (servicio)
            'restart_loop',      -- el servicio se recrea en bucle (agente)
            'admin_status',      -- /api/admin/v1/status responde con el token
            'jobs',              -- algún job con error o atrasado (deriva de admin_status)
            'migrations',        -- migraciones pendientes o fallidas (deriva de admin_status)
            -- F2 (host)
            'host_heartbeat', 'host_cpu', 'host_memory', 'host_disk', 'host_disk_trend',
            'host_restart_loop'
        ));
    END IF;

    -- 2) Exactamente un dueño, y los tipos host_* solo con dueño host.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alphataco_checks_owner_check') THEN
        ALTER TABLE alphataco_checks ADD CONSTRAINT alphataco_checks_owner_check
            CHECK (num_nonnulls(service_id, host_id) = 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alphataco_checks_host_type_check') THEN
        ALTER TABLE alphataco_checks ADD CONSTRAINT alphataco_checks_host_type_check
            CHECK ((host_id IS NOT NULL) = (type LIKE 'host\_%'));
    END IF;

    -- 3) Ampliar el CHECK de kind de los incidentes.
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'alphataco_incidents'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE 'CHECK ((kind = ANY (ARRAY[%'
               AND conname <> 'alphataco_incidents_kind_check_v2'
    LOOP
        EXECUTE format('ALTER TABLE alphataco_incidents DROP CONSTRAINT %I', c.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alphataco_incidents_kind_check_v2') THEN
        ALTER TABLE alphataco_incidents ADD CONSTRAINT alphataco_incidents_kind_check_v2 CHECK (kind IN (
            'app_health', 'db_via_health', 'storage_via_health', 'api_capabilities',
            'sha_match', 'tcp', 'container', 'dokploy_unreachable',
            'restart_loop', 'admin_status', 'jobs', 'migrations',
            'host_heartbeat', 'host_cpu', 'host_memory', 'host_disk', 'host_disk_trend',
            'host_restart_loop'
        ));
    END IF;
END
$$;

-- Un chequeo de cada tipo por host (y uno de disco por montaje).
CREATE UNIQUE INDEX IF NOT EXISTS uq_alphataco_checks_host_type
    ON alphataco_checks (host_id, type, COALESCE(params->>'mount', ''))
    WHERE host_id IS NOT NULL;

-- Incidentes: dueño host. El CHECK de 067 «(check_id IS NULL) = (kind =
-- 'dokploy_unreachable')» sigue valiendo: los incidentes de host tienen check_id.
ALTER TABLE alphataco_incidents
    ADD COLUMN IF NOT EXISTS host_id BIGINT REFERENCES alphataco_hosts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_alphataco_incidents_host
    ON alphataco_incidents (host_id, opened_at DESC) WHERE host_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Secretos salientes por instancia (cifrados). Diseño de BLUEPRINT-F1 §7.2.
-- ---------------------------------------------------------------------------

-- TaskApp los ENVÍA (Authorization hacia Alphataco), así que tiene que poder
-- descifrarlos: AES-256-GCM con la clave ALPHATACO_SECRETS_KEY_V{key_version}
-- del entorno. AAD = "instance:{id}|{name}": un texto cifrado copiado a otra
-- fila no descifra. La API nunca los devuelve (solo has_admin_status_token).
CREATE TABLE IF NOT EXISTS alphataco_secrets (
    id           BIGSERIAL   PRIMARY KEY,
    instance_id  BIGINT      NOT NULL REFERENCES alphataco_instances(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL CHECK (name IN ('admin_status_token')), -- F3 suma 'admin_modules_token'
    nonce        BYTEA       NOT NULL CHECK (octet_length(nonce) = 12),
    ciphertext   BYTEA       NOT NULL,
    key_version  SMALLINT    NOT NULL CHECK (key_version >= 1),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at   TIMESTAMPTZ,
    UNIQUE (instance_id, name)
);
```

**Chequeos por defecto de un host nuevo.** Los crea `CreateHost` en la misma transacción, desde `defaultHostChecks()` en el código (§6.1), no desde el seed. Así un host creado por API, o más adelante por el alta remota, nace completo.

---

## 5. El agente (`alphataco-agent`)

### 5.1 Por qué un binario Go con `systemd`

| Opción                                                      | RAM / CPU                                                                                                                    | Estado entre muestras                                                                                                                  | Si Docker se cuelga                                                  | Encaje                                                                                                                                                                                                          | Veredicto                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Binario Go estático + `systemd`**                         | ~8-15 MB RSS, < 0,1 % de una CPU [supuesto, se mide en el paso 6]                                                            | Sí: delta de CPU, búfer y stream de eventos                                                                                            | **Sigue reportando** CPU, RAM y disco, con `docker_ok=false`         | Igual en cualquier VPS, con o sin Dokploy                                                                                                                                                                       | **Elegida**                                                                                    |
| Script bash + timer de `systemd` (propuesta §2.5, opción A) | ~0 en reposo, pero ~10 procesos por minuto (`docker ps`, `df`, `curl`; el CLI de Docker cuesta 50-100 ms de CPU por llamada) | No: la CPU en uso y el búfer necesitan archivos temporales. Escapar el JSON a mano es frágil. Los bucles de reinicio necesitan eventos | Sigue                                                                | Bueno                                                                                                                                                                                                           | Descartada: no resuelve la CPU, el búfer ni los reinicios sin volverse un programa mal escrito |
| Contenedor con `/proc:ro` y `docker.sock`                   | Similar al binario                                                                                                           | Sí                                                                                                                                     | **Cae con Docker**: se pierde la visibilidad justo cuando hace falta | Fuera de Dokploy rompe «no tocar containers a mano» (`~/.claude/docs/dokploy.md`, reglas). Dentro de Dokploy lo redeploya Dokploy y queda atado al swarm                                                        | Descartada                                                                                     |
| Monitoreo nativo de Dokploy (`setupMonitoring`)             | Un contenedor más                                                                                                            | —                                                                                                                                      | Cae con Docker                                                       | Hay que **escribir** con la key de administrador total. Los datos quedan en Dokploy. `getServerHealth` no trae CPU en uso. Está apagado (`enabledFeatures:false`) y ningún contenedor de monitoreo corre (§0.2) | **Descartada** (D2). No se ejecuta nada para probarla                                          |
| Beszel o Uptime Kuma                                        | 20-150 MB                                                                                                                    | —                                                                                                                                      | —                                                                    | Otra pantalla, y el usuario quiere todo en la vista                                                                                                                                                             | Descartada (propuesta §2.5)                                                                    |

**Montar `docker.sock:ro` no hace a la API de solo lectura:** el `:ro` es sobre el archivo del socket, no sobre las operaciones. Cualquier acceso al socket equivale a root. En cualquiera de las opciones, la lectura sola se garantiza en el código:

- una lista blanca de tres rutas GET constantes (`/containers/json`, `/services`, `/events`), igual que `dokploy_client.go`;
- sin cliente genérico;
- sin dependencias externas: solo la biblioteca estándar, así que no hay cadena de suministro que auditar.

Un proxy del socket (tipo `docker-socket-proxy`) sería otro contenedor fuera de Dokploy, con la misma objeción de arriba. Se descarta.

### 5.2 Qué lee, de dónde y cómo se calcula

Todo sin `exec` de procesos.

| Métrica                           | Fuente                                                                                                                                                                                                                  | Cálculo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cpu_pct`                         | `/proc/stat` (línea `cpu`)                                                                                                                                                                                              | Delta contra la lectura anterior, que guarda el agente: `100 × (1 − Δidle+Δiowait / Δtotal)`. La primera muestra va `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `load1`, `load5`, `load15`        | `/proc/loadavg`                                                                                                                                                                                                         | Directo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `mem_avail_pct`, `mem_total_mb`   | `/proc/meminfo` (`MemTotal`, `MemAvailable`)                                                                                                                                                                            | `MemAvailable / MemTotal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `swap_used_pct`                   | `/proc/meminfo` (`SwapTotal`, `SwapFree`)                                                                                                                                                                               | **Solo informativo.** Hoy está al 90 % sin presión real (PSI de memoria ≈ 0,1 %): alertar por esto sería una alarma permanente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `psi_*_avg60`                     | `/proc/pressure/{cpu,memory,io}`                                                                                                                                                                                        | `some avg60` de CPU y `full avg60` de memoria e IO. Si el archivo no existe (kernel viejo), `null` y el chequeo de memoria usa solo `MemAvailable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Disco                             | `syscall.Statfs` por montaje de `AGENT_MOUNTS` (por defecto `/`)                                                                                                                                                        | `used = (Blocks − Bfree) × Bsize` y `pct = used / (used + Bavail × Bsize)` (lo mismo que muestra `df`, descontando lo reservado para root). También inodos (`Files`, `Ffree`) en `mounts[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `uptime_s`                        | `/proc/uptime`                                                                                                                                                                                                          | Directo (el reinicio de la VPS se ve en la vista)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Hechos estáticos                  | `os.Hostname`, `/proc/sys/kernel/osrelease`, `runtime.NumCPU`                                                                                                                                                           | Una vez por reporte (son pocos bytes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Unidades (contenedores agregados) | Docker API `GET /containers/json` (solo corriendo)                                                                                                                                                                      | Agrupa por la **unidad**: `swarm:<com.docker.swarm.service.name>`, `compose:<com.docker.compose.project>/<com.docker.compose.service>` o `container:<nombre>`. Verificado el 2026-10-22: el storage de la demo (`compose-compress-wireless-transmitter-amgfd1-storage-1`) tiene `com.docker.compose.project = compose-compress-wireless-transmitter-amgfd1` (= `appName`) y `service = storage`, sin etiqueta de swarm. [supuesto] Un compose que Dokploy despliegue en modo _stack_ llevaría etiquetas de swarm (`<appName>_<servicio>`): `MatchUnits` acepta también `swarm:<appName>_*` para `dokploy_kind = compose`. Lee el estado de salud del texto `Status` («(healthy)» o «(unhealthy)»). **Solo lee esas tres etiquetas**: nunca manda `Labels` ni `Env` completos |
| Réplicas de swarm                 | `GET /services?status=true` (API ≥ 1.41)                                                                                                                                                                                | `ServiceStatus.DesiredTasks` y `RunningTasks` por servicio. **En un nodo sin swarm, Docker responde 503 («not a swarm manager»): eso quiere decir «sin swarm», no «Docker caído»**. Las unidades van con `desired: null` y `docker_ok` sigue en `true`, así que el agente funciona igual en una VPS sin swarm. «Caído» = corriendo < deseadas. **Nunca** se cuentan los `exited` de `docker ps -a` (el historial de swarm guarda 5 por servicio, §0.2)                                                                                                                                                                                                                                                                                                                       |
| Reinicios                         | `GET /events?filters={"type":["container"],"event":["die"]}` (stream de larga duración)                                                                                                                                 | Ventana deslizante de 15 min por unidad, en memoria. Cubre **swarm** (cada tarea nueva viene precedida por un `die`) y **contenedores sueltos** con `--restart`. Si el stream se corta, reconecta con backoff de 5 a 60 s, y mientras tanto los reinicios van `null` (no `0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Memoria y CPU por contenedor      | cgroup v2: `/sys/fs/cgroup/system.slice/docker-<id>.scope/{memory.current,cpu.stat}` [supuesto: el *driver* de cgroups de Docker es `systemd`; se verifica en el paso 0 con `docker info --format '{{.CgroupDriver}}'`] | `memory.current` directo. CPU con el delta de `usage_usec` contra la muestra anterior. Son unos 140 archivos chicos por minuto, sin `docker stats` (que serían 70 llamadas de un segundo cada una). Si no existe el archivo, `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 5.3 Ciclo, búfer y envío

- **Intervalo:** `AGENT_INTERVAL` (60 s por defecto), con una variación aleatoria de ±5 s al arrancar para no sincronizar varios hosts.
- **Por tick:**
  1. Lee el host (siempre).
  2. Lee Docker, con un tiempo de espera de **5 s** por llamada. Si falla: `docker_ok=false`, `docker_error` corto y sin unidades. Igual se manda la muestra de host.
  3. Arma `AgentSample` y lo agrega al búfer.
  4. POST.
- **Búfer en anillo en memoria: 180 muestras (3 h).**
  - Cada POST lleva **la más nueva y hasta 59 pendientes, de las más nuevas a las más viejas**. Así el latido se recupera en el primer envío exitoso y el historial se rellena en los siguientes.
  - Una muestra sale del búfer cuando el servidor la acepta (`accepted_until`).
  - Si el agente se reinicia durante un corte, se pierde el búfer. Es aceptable: es historial, no estado. No se escribe en disco, para no necesitar permisos de escritura (`ProtectSystem=strict`).
- **Reintento:** en el próximo tick, sin backoff exponencial (un intento por minuto es lo mismo que un reporte). Con 401 o 403, el log dice «token rechazado» **una vez por hora**, no por tick.
- **El snapshot de unidades viaja solo con la muestra más nueva:** la vista solo muestra el estado actual.
- **Tamaño del payload** [supuesto, se mide en el paso 6]:

| Pieza                             | Tamaño aproximado                  |
| --------------------------------- | ---------------------------------- |
| Muestra                           | ~350 B de JSON                     |
| Unidades                          | ~60 × ~180 B ≈ 11 KB               |
| Reporte normal                    | ~12 KB crudo, **~2-3 KB con gzip** |
| Lote de 60 muestras tras un corte | ~33 KB crudo, ~6 KB con gzip       |
| Tráfico por día                   | ~1440 × 3 KB ≈ **4 MB**            |

- **Consumo esperado:** RSS de 8 a 15 MB. CPU de 10 a 30 ms por tick (parsear unos 70 contenedores, más `/proc` y cgroups), es decir menos del 0,05 % de una vCPU. Una conexión unix abierta para eventos. Topes del sistema: `GOMAXPROCS=1`, `GOMEMLIMIT=32MiB`, `MemoryMax=48M`, `CPUQuota=10%` (§5.6). Se mide en el paso 6 con `systemctl status` (memoria) y `pidstat -p <pid> 60 5`.

### 5.4 Configuración (entorno, archivo `0640 root:alphataco-agent`)

| Variable         | Default                | Uso                                                                                                                           |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `TASKAPP_URL`    | — (obligatoria)        | `https://apitaskapp.codecontrol.com.ar`. Tiene que ser `https://`, salvo que `AGENT_ALLOW_HTTP=1` (solo para la prueba local) |
| `AGENT_TOKEN`    | — (obligatoria)        | `ata1_<43 caracteres base64url>`. **Nunca se loguea**. El log solo muestra el prefijo (`ata1_k3Jd…`)                          |
| `AGENT_INTERVAL` | `60s`                  | Entre 15 s y 10 min                                                                                                           |
| `AGENT_MOUNTS`   | `/`                    | Lista separada por comas. El primero es el «principal»                                                                        |
| `DOCKER_SOCKET`  | `/var/run/docker.sock` | Vacío = sin Docker (un host sin contenedores)                                                                                 |

El agente no lee ningún otro archivo de configuración ni acepta flags con secretos (los argumentos se ven en `ps`).

### 5.5 Contrato (`internal/model/alphataco_agent.go`)

**`POST /api/agent/v1/reports`**, con los encabezados:

- `Authorization: Bearer ata1_…`
- `Content-Type: application/json`
- `Content-Encoding: gzip` (opcional)
- `User-Agent: alphataco-agent/0.1.0`

```json
{
  "protocol": 1,
  "agent_version": "0.1.0+3f2a9c1",
  "facts": {
    "hostname": "srv837578",
    "kernel": "6.8.0-147-generic",
    "cpu_count": 2,
    "mem_total_mb": 7940,
    "docker_version": "28.5.1",
    "uptime_s": 432000
  },
  "samples": [
    {
      "sampled_at": "2026-10-22T18:04:00Z",
      "cpu_pct": 23.4,
      "load1": 0.93,
      "load5": 0.52,
      "load15": 0.49,
      "mem_avail_pct": 35.7,
      "swap_used_pct": 89.7,
      "psi_cpu_some_avg60": 4.1,
      "psi_mem_full_avg60": 0.07,
      "psi_io_full_avg60": 0.3,
      "disk_used_pct": 70.8,
      "disk_used_bytes": 72806752256,
      "disk_total_bytes": 102888095744,
      "containers_running": 70,
      "containers_unhealthy": 0,
      "units_degraded": 0,
      "restarts_15m": 0
    }
  ],
  "snapshot": {
    "sampled_at": "2026-10-22T18:04:00Z",
    "docker_ok": true,
    "docker_error": null,
    "mounts": [
      { "path": "/", "used_pct": 70.8, "used_bytes": 72806752256, "total_bytes": 102888095744, "inodes_used_pct": 9.1 }
    ],
    "units": [
      {
        "key": "swarm:alphataco-app-vta1g3",
        "kind": "swarm",
        "name": "alphataco-app-vta1g3",
        "desired": 1,
        "running": 1,
        "unhealthy": 0,
        "restarts_15m": 0,
        "mem_bytes": 412000000,
        "cpu_pct": 3.1,
        "started_at": "2026-10-22T14:51:16Z",
        "image": "registry-31-97-42-82.sslip.io/alphataco:main"
      },
      {
        "key": "compose:compose-compress-wireless-transmitter-amgfd1/rustfs",
        "kind": "compose",
        "name": "compose-compress-wireless-transmitter-amgfd1/rustfs",
        "desired": null,
        "running": 1,
        "unhealthy": 0,
        "restarts_15m": 0,
        "mem_bytes": 98000000,
        "cpu_pct": 0.4,
        "started_at": "…",
        "image": "rustfs/rustfs:…"
      }
    ]
  }
}
```

**Respuesta `202`:**

```json
{
  "accepted": 1,
  "duplicates": 0,
  "dropped": 0,
  "accepted_until": "2026-10-22T18:04:00Z",
  "evaluated": true,
  "server_time": "2026-10-22T18:04:01Z",
  "report_interval_s": 60
}
```

`report_interval_s` deja que TaskApp cambie el ritmo sin tocar la VPS: el agente lo adopta si está dentro de 15 s a 10 min.

### 5.6 Unidad `systemd` (`deploy/alphataco-agent/alphataco-agent.service`)

```ini
[Unit]
Description=Agente de la sala de control de Alphataco (solo lectura, empuja métricas a TaskApp)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=alphataco-agent
Group=alphataco-agent
# El socket de Docker es root:docker 0660 (verificado). Equivale a root: el código
# del agente solo hace tres GET en lista blanca (ver BLUEPRINT-F2 §5.1).
SupplementaryGroups=docker
EnvironmentFile=/etc/alphataco-agent/agent.env
Environment=GOMAXPROCS=1 GOMEMLIMIT=32MiB
ExecStart=/usr/local/bin/alphataco-agent
Restart=always
RestartSec=10
Nice=10
CPUQuota=10%
MemoryMax=48M
# Endurecimiento: solo lectura del sistema, sin capacidades, sin escribir nada.
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
```

`ProtectControlGroups` deja `/sys/fs/cgroup` en solo lectura, que es lo que el agente necesita. `ProtectSystem=strict` no impide leer `/proc`.

### 5.7 Instalación, actualización y baja (procedimiento manual; **no se ejecuta en F2**)

Requiere la aprobación explícita del usuario, porque instala un servicio en la VPS (propuesta §6, F2).

```bash
# 0) En la máquina de desarrollo: compilar (estático, amd64 [supuesto: `uname -m` = x86_64, se verifica en el paso 0]).
cd taskapp/taskApp-backend
VER=$(git rev-parse --short HEAD)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
  -ldflags "-s -w -X main.version=0.1.0+$VER" -o /tmp/alphataco-agent ./cmd/alphataco-agent
sha256sum /tmp/alphataco-agent            # anotar el hash
scp /tmp/alphataco-agent deploy/alphataco-agent/{alphataco-agent.service,install.sh} yordan@31.97.42.82:/tmp/

# 1) En la vista de TaskApp: «Servidores → Nuevo servidor» (o POST /api/alphataco/hosts).
#    Copiar el token que se muestra UNA vez. No pegarlo en ningún archivo local.

# 2) En la VPS (install.sh hace exactamente esto y es idempotente):
ssh yordan@31.97.42.82
sha256sum /tmp/alphataco-agent           # comparar con el del paso 0
sudo useradd --system --no-create-home --shell /usr/sbin/nologin alphataco-agent 2>/dev/null || true
sudo install -o root -g root -m 0755 /tmp/alphataco-agent /usr/local/bin/alphataco-agent
sudo install -d -o root -g alphataco-agent -m 0750 /etc/alphataco-agent
# El token se lee de stdin sin eco y no queda en el historial de la shell:
read -rs AGENT_TOKEN && printf 'TASKAPP_URL=https://apitaskapp.codecontrol.com.ar\nAGENT_TOKEN=%s\nAGENT_INTERVAL=60s\nAGENT_MOUNTS=/\n' "$AGENT_TOKEN" \
  | sudo install -o root -g alphataco-agent -m 0640 /dev/stdin /etc/alphataco-agent/agent.env; unset AGENT_TOKEN
sudo install -o root -g root -m 0644 /tmp/alphataco-agent.service /etc/systemd/system/alphataco-agent.service
sudo systemctl daemon-reload && sudo systemctl enable --now alphataco-agent
systemctl status alphataco-agent --no-pager   # memoria y estado
journalctl -u alphataco-agent -n 20 --no-pager  # debe decir "reporte aceptado" sin mostrar el token

# Actualizar: copiar el binario nuevo y verificar el hash, guardar el anterior para volver atrás.
sudo cp /usr/local/bin/alphataco-agent /usr/local/bin/alphataco-agent.prev
sudo install -m 0755 /tmp/alphataco-agent /usr/local/bin/alphataco-agent && sudo systemctl restart alphataco-agent
# Volver atrás: sudo mv /usr/local/bin/alphataco-agent.prev /usr/local/bin/alphataco-agent && sudo systemctl restart alphataco-agent

# Rotar el token: en la vista «Generar token nuevo» (el anterior vence en 24 h), reescribir agent.env
# con el bloque `read -rs` de arriba y `sudo systemctl restart alphataco-agent`. Revocar el viejo.

# Baja: sudo systemctl disable --now alphataco-agent && sudo rm -rf /etc/alphataco-agent \
#   /usr/local/bin/alphataco-agent* /etc/systemd/system/alphataco-agent.service && sudo userdel alphataco-agent
#   y en la vista: revocar los tokens y pausar el host.
```

**Automatización con el alta remota (fase posterior, fuera de F2).** El script de alta de instancia, `new.sh` de `RUNBOOK-NUEVA-INSTANCIA.md`, va a:

1. llamar a `POST /api/alphataco/hosts` con un token de servicio de TaskApp, que se define cuando exista el alta (hoy la API exige la sesión de un usuario con la capability);
2. recibir el token del agente;
3. por SSH, copiar el binario de un _release_ (con su SHA-256 publicado) y correr `install.sh` pasándole el token **por stdin**;
4. hacer `PATCH /api/alphataco/instances/{id}` con `host_id`.

`install.sh` ya queda escrito en F2 para que el procedimiento manual y el automático sean el mismo.

---

## 6. Alertas: chequeos, umbrales y anti-ruido

### 6.1 Chequeos de host (los crea `defaultHostChecks()`)

Todos pasan por `Transition` de F1. «Abre tras N» son **N muestras seguidas**: con muestras de 1 minuto, son N minutos.

| Tipo                                 | Valor (`last_value`)             | `fail` si…                                                                                                                      | `ok` si…                               | Entre los dos (banda)                       | Abre tras                                 | Cierra tras | Severidad                                              | `params` por defecto                                             |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `host_heartbeat`                     | segundos desde el último reporte | `ahora − last_report_at > 2,5 × report_interval_s` (150 s)                                                                      | reporte dentro de ese plazo            | —                                           | 2 evaluaciones (≈ **5 min** sin reportes) | 1           | **crítica**                                            | `{"stale_factor":2.5}`                                           |
| `host_cpu`                           | `cpu_pct`                        | ≥ 90 %                                                                                                                          | < 75 %                                 | `fail` si hay incidente abierto, `ok` si no | 10 (**10 min sostenidos**)                | 5           | media                                                  | `{"open":90,"clear":75}`                                         |
| `host_memory`                        | `mem_avail_pct`                  | `mem_avail_pct` < 10 % **o** `psi_mem_full_avg60` ≥ 10 %                                                                        | `mem_avail_pct` > 15 % **y** PSI < 5 % | igual                                       | 5                                         | 5           | alta                                                   | `{"avail_open":10,"avail_clear":15,"psi_open":10,"psi_clear":5}` |
| `host_disk` (un chequeo por montaje) | `disk_used_pct`                  | ≥ 85 %                                                                                                                          | < 80 %                                 | igual                                       | 2                                         | 3           | alta; **sube a crítica si ≥ 92 %** (`RaiseSeverityTo`) | `{"mount":"/","open":85,"clear":80,"critical":92}`               |
| `host_disk_trend`                    | horas hasta llenarse             | se llena en **< 48 h** con la pendiente de las últimas 6 h (`regr_slope(disk_used_bytes, epoch)`, ≥ 120 puntos y pendiente > 0) | ≥ 72 h o pendiente ≤ 0                 | igual                                       | 15                                        | 30          | alta                                                   | `{"window_h":6,"open_h":48,"clear_h":72,"min_points":120}`       |
| `host_restart_loop`                  | `restarts_15m` del host          | ≥ 5 eventos `die` en 15 min en **cualquier** contenedor del host. El error nombra las 3 unidades con más reinicios              | < 2                                    | igual                                       | 2                                         | 5           | media                                                  | `{"open":5,"clear":2}`                                           |

**Por qué estos números:**

- **CPU de 2 vCPU:** un build o un `next build` en la misma VPS satura 5 a 8 minutos. 10 minutos no alerta por un deploy y sí por un proceso desbocado. No se alerta por `load1`, que en una VPS de 2 vCPU con I/O lento se dispara por espera de disco y no por CPU: se muestra, no alerta.
- **Memoria:** `MemAvailable` ya cuenta la caché recuperable. PSI `full` > 10 % quiere decir que, durante el 10 % del tiempo, todos los procesos esperaban memoria. Eso es _thrashing_ real, no swap inerte. Hoy el swap está al 90 % con PSI en 0,07 %, y la regla queda en verde, que es lo correcto.
- **Disco:** son los de la propuesta (85 / 80 / 92). La tendencia cubre el caso «71 % pero creciendo 5 GB por hora» (logs desbocados, respaldos), que el umbral fijo vería tarde. 15 evaluaciones evitan alertar por un pico de escritura temporal (un `docker pull`).
- **Bucle de reinicio del host:** un deploy normal produce 1 `die` por servicio, y 5 en 15 min es un bucle.

**La banda de histéresis** es una función pura nueva, `gauge(v, open, clear, hasOpen)` en `alphataco_host_eval.go`. `Transition` no cambia: la banda solo decide si la muestra cuenta como `fail` u `ok`. Sin dato (métrica `null`) → `unknown`, que no toca los contadores.

### 6.2 Chequeos de servicio nuevos o cambiados (instancia)

| Tipo                     | Fuente                                                                                                   | `fail` si…                                                                                                                                                                  | `unknown` si…                                                                                | Abre / cierra        | Severidad                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------ |
| `container` (**cambia**) | **Agente** si el host de la instancia tiene snapshot fresco (≤ 3 min) y `docker_ok`; si no, Dokploy (F1) | ninguna réplica **sana**: corriendo − unhealthy < 1, o `desired > 0` y corriendo = 0                                                                                        | sin agente fresco **y** sin Dokploy                                                          | 2 / 2 (igual que F1) | la de F1                                   |
| `restart_loop`           | Solo agente: `restarts_15m` de las unidades del servicio                                                 | ≥ 3 en 15 min                                                                                                                                                               | sin agente fresco, o el stream de eventos cortado (`null`)                                   | 1 / 5                | crítica en `app` y `api`, alta en el resto |
| `admin_status`           | `GET {app_url}/api/admin/v1/status` cada **5 min**                                                       | 401 o 403 («token rechazado»), 5xx, timeout o JSON inválido. **Solo si `app_health` está `ok`**: si la app no responde, es `unknown` (supresión, igual que `db_via_health`) | sin token cargado; `404` (versión de Alphataco sin el endpoint); sin `ALPHATACO_SECRETS_KEY` | 2 / 1                | media                                      |
| `jobs`                   | Deriva del payload de `admin_status`                                                                     | algún job con `overdue = true` o con `last_status = "error"` más nuevo que su último `ok`                                                                                   | `admin_status` sin dato                                                                      | 1 / 1                | media                                      |
| `migrations`             | Ídem                                                                                                     | `pending > 0` o `failed > 0`                                                                                                                                                | ídem                                                                                         | 1 / 1                | alta                                       |

**Cómo se casa una unidad del agente con un servicio de F1** (función pura `MatchUnits(dokployKind, appName, units)`):

- `application` y `postgres` → la unidad `swarm:<appName>`. El `appName` de Dokploy es el nombre del servicio de swarm [verificado en §0.2].
- `compose` → todas las unidades `compose:<appName>/*`, agregadas: corriendo = suma, unhealthy = suma, `desired` = `null`.
- Sin coincidencias, con el snapshot fresco: `fail` «no hay contenedores de `<appName>` en el servidor».

**Cadencia de `admin_status`:** se reutiliza `Outcome.Result == ""` («no se evalúa en esta pasada»). La sonda corre solo si `last_checked_at` del chequeo `admin_status` es más viejo que `params.every_s` (300 por defecto). En las pasadas intermedias, `admin_status`, `jobs` y `migrations` no se aplican: no suman `unknown` ni ensucian el historial.

### 6.3 Anti-ruido y deduplicación (lo que ya garantiza F1, más lo nuevo)

- **Un incidente abierto por chequeo:** `uq_alphataco_incident_open_check` (067:145-147). Los chequeos de host tienen `check_id`, así que dos hosts con el disco lleno abren dos incidentes distintos, cada uno con su `host_id`.
- **Una muestra = una evaluación.** El reenvío del búfer no evalúa de nuevo:
  - `ClaimEvaluation` hace `UPDATE alphataco_hosts SET last_evaluated_at = $2 WHERE id = $1 AND (last_evaluated_at IS NULL OR last_evaluated_at < $2) RETURNING`;
  - solo se evalúa la muestra más nueva, y solo si `received_at − sampled_at ≤ 3 min`;
  - las muestras viejas que llegan después de un corte van solo al historial. Así no se abren ni se cierran incidentes «en el pasado».
- **Latido caído ⇒ el resto queda sin dato.** Cuando `host_heartbeat` da `fail`, el monitor aplica `unknown` a los demás chequeos del host (no al propio latido). `Transition` no toca los contadores ni los incidentes, y la vista los muestra «Sin dato». Una VPS que deja de reportar abre **un** incidente, no seis.
- **Gracia de arranque del monitor:** `runHeartbeats` no evalúa en los primeros **3 minutos** del proceso de TaskApp (`startedAt` en memoria). Además, si el tick anterior fue hace más de 2 minutos (el monitor estuvo parado), en ese tick se salta el latido.
  - Sin esto, un reinicio o deploy de TaskApp abriría un «dejó de reportar» falso en cada host: los agentes estuvieron reportando contra un 502.
  - Es lo mismo que la gracia de deploy de F1, del lado del vigilante.
- **«Nunca reportó» no es «dejó de reportar».** Con `first_report_at IS NULL`, el latido da `unknown` («esperando el primer reporte del agente»): ni falla ni abre incidente.
- **Pausa:**
  - `alphataco_hosts.monitoring_enabled = false` deja de evaluar el latido y descarta la evaluación al ingresar (las muestras se siguen guardando).
  - Los incidentes abiertos quedan abiertos, con el mismo criterio que F1 §4.1.
  - El chequeo deshabilitado cierra su incidente con `check_disabled` (§3.3).

---

## 7. Flujo de datos

### 7.1 Ingreso (`POST /api/agent/v1/reports`)

1. **Middleware**, en este orden:
   1. `RateLimitByIP(60)` (`middleware/ratelimit.go:56`). `ClientIP` toma el último tramo de `X-Forwarded-For`, que es el de Traefik (`:36-53`).
   2. `AgentTokenAuth`: `sha256(token)` → `HostByTokenHash`, por índice único. **No hace falta comparar en tiempo constante:** la búsqueda es por el hash de un valor de 256 bits aleatorios, así que medir tiempos no revela nada útil del token (es el mismo modelo que los tokens de GitHub). Sin el prefijo `ata1_`, se rechaza sin consultar la base. El 401 va siempre sin detalle. Se loguea `WARN agent auth failed prefix=ata1_k3Jd ip=…` y **nunca** el token.
   3. Un tope por host: `rateLimitKeyed(10, hostKey)`, para que un agente roto no inunde la base.
2. **Handler:**
   - `http.MaxBytesReader(256 KiB)` sobre el cuerpo. Si viene con `Content-Encoding: gzip`, `gzip.NewReader` con `io.LimitReader(1 MiB)` sobre lo descomprimido (contra una bomba gzip).
   - `415` si el `Content-Type` no es JSON. `413` si excede. `400` si `protocol ≠ 1`.
3. **Validación en el servicio:**
   - como máximo 120 muestras;
   - una muestra se descarta (`dropped++`) si `sampled_at` cae fuera de `[ahora − 6 h, ahora + 2 min]`;
   - los porcentajes se acotan a 0-100;
   - como máximo 300 unidades y 16 montajes;
   - los textos se truncan a 200 runas.
4. **Una transacción `StoreReport`:**
   - `INSERT … ON CONFLICT (host_id, sampled_at) DO NOTHING` por muestra (en un único `INSERT … SELECT unnest(...)`);
   - _upsert_ del snapshot si es más nuevo que el guardado;
   - en el host:
     ```sql
     UPDATE alphataco_hosts SET
       last_report_at = $received,
       first_report_at = COALESCE(first_report_at, $received),
       last_sample_at = GREATEST(last_sample_at, $newest),
       agent_version, hostname, …,
       clock_skew_s = …
     ```
   - `TouchToken` con _throttle_ de 5 minutos.
5. **Evaluación** (fuera de esa transacción): si la muestra más nueva está fresca y `ClaimEvaluation` la gana, sigue con:
   - `ListEnabledHostChecks`, **sin `host_heartbeat`** (el latido lo evalúa solo el monitor; si se evaluara también al ingresar, contaría dos veces por minuto);
   - `DiskSeries`, solo si hay un chequeo `host_disk_trend`;
   - `EvaluateHostCheck`;
   - `Transition`;
   - `ApplyCheckOutcome` por chequeo, cada uno en su transacción, igual que F1.
6. Responde `202` con el cuerpo de §5.5.

### 7.2 Monitor (se suma a la pasada de F1, `alphataco_monitor.go:116-158`)

```
run():
  ClaimDueInstances → por instancia (F1, con dos cambios):
      contenedores: SnapshotForInstance(inst) fresco y docker_ok → ContainerProbe{Source: agent} por servicio;
                    si no, probeContainers (Dokploy, F1) como respaldo.
      admin_status: si toca (cada 5 min) y app_health respondió: GetSecret → AdminStatus(ctx, appURL, token).
                    Guarda admin_status y admin_status_at en la instancia (el payload ya validado).
  runHeartbeats():                       ← nuevo
      si uptime del proceso < 3 min, o el tick anterior fue hace > 2 min → salir.
      ClaimDueHosts (next_check_at = NOW() + 60 s) → EvalHeartbeat → Transition → ApplyCheckOutcome.
      si el latido dio fail → unknown a los demás chequeos del host.
  CloseIncidentsOfDisabledChecks (ahora también los de host)
  purgeIfDue (ahora también muestras y rollup)
```

---

## 8. Endpoints

### 8.1 Del agente (fuera del `Auth` de usuario)

```go
// Ingreso del agente de la sala de control. Va FUERA de /api/alphataco: no usa
// sesión de usuario, lo autentica el token por servidor (hash en la base).
r.Route("/api/agent/v1", func(r chi.Router) {
    r.Use(middleware.RateLimitByIP(60))
    r.Use(middleware.AgentTokenAuth(alphatacoHostRepo))
    r.Post("/reports", alphatacoAgentHandler.Report)
})
```

| Método y ruta                | Auth                                                                                                     | Cuerpo | Respuestas                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `POST /api/agent/v1/reports` | `Bearer ata1_…` (hash en `alphataco_host_tokens`, no revocado ni vencido, host con `monitoring_enabled`) | §5.5   | `202` §5.5 · `400 {"error":"invalid report"}` · `401 {"error":"unauthorized"}` · `413` · `415` · `429` |

Un host pausado responde **202 con `evaluated:false`**, no 403: así el agente no entra en modo error y se sigue guardando el historial.

### 8.2 De la vista (todas dentro de `r.Route("/api/alphataco")`, `main.go:598`, con `Auth` + `RequireCapability`)

| Método y ruta                                              | Uso                                                                                                                                                                         | Respuesta                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/alphataco/overview` (**cambia**)                 | Suma `hosts[]` y `instances[].host`                                                                                                                                         | ver abajo                                                                                                                                                                                                                                           |
| `GET /api/alphataco/hosts/{id}`                            | Detalle del servidor                                                                                                                                                        | ver abajo · 404                                                                                                                                                                                                                                     |
| `GET /api/alphataco/hosts/{id}/samples?range=24h\|7d\|30d` | Series para los gráficos                                                                                                                                                    | `{"range":"24h","bucket_s":300,"points":[{"t":"…","cpu":23.4,"cpu_max":41.0,"mem_avail":35.7,"disk":70.8,"load1":0.9,"psi_mem":0.07}]}`. **24h**: crudo agregado a 5 min (288 puntos). **7d**: horario (168). **30d**: horario agregado a 6 h (120) |
| `POST /api/alphataco/hosts`                                | Alta: crea el host, sus chequeos por defecto y el **primer token**                                                                                                          | `201 {"host": HostSummary, "token": {"id": 3, "prefix": "ata1_k3Jd", "value": "ata1_…"}}`. `value` aparece **solo acá**. `409` si el slug existe                                                                                                    |
| `PATCH /api/alphataco/hosts/{id}`                          | `{"name"?, "notes"?, "monitoring_enabled"?, "report_interval_s"?}`                                                                                                          | `HostSummary`                                                                                                                                                                                                                                       |
| `POST /api/alphataco/hosts/{id}/tokens`                    | Rotar: `{"note": "rotación oct", "expire_previous_in_h": 24}` (de 0 a 168)                                                                                                  | `201 {"id", "prefix", "value", "previous_expire_at"}`                                                                                                                                                                                               |
| `POST /api/alphataco/hosts/{id}/tokens/{tokenId}/revoke`   | Revocación inmediata                                                                                                                                                        | `200 {"revoked": true}` · 404                                                                                                                                                                                                                       |
| `PATCH /api/alphataco/checks/{id}`                         | Umbrales y encendido: `{"enabled"?, "params"?}`. Los `params` se validan por tipo (claves conocidas, rangos y `clear < open`). Sirve para la prueba «bajar el disco a 40 %» | `AlphatacoCheck` · 400 con el campo inválido                                                                                                                                                                                                        |
| `PATCH /api/alphataco/instances/{id}` (**cambia**)         | Además de `monitoring_enabled`, `{"host_id": 1 \| null}`                                                                                                                    | `InstanceSummary`                                                                                                                                                                                                                                   |
| `PUT /api/alphataco/instances/{id}/admin-status-token`     | `{"value": "…"}` (de 32 a 256 caracteres). Se cifra y se guarda. **Nunca se devuelve**                                                                                      | `204` · `409 {"error":"secrets key not configured"}` si falta `ALPHATACO_SECRETS_KEY_V1`                                                                                                                                                            |
| `DELETE /api/alphataco/instances/{id}/admin-status-token`  | Lo borra                                                                                                                                                                    | `204`                                                                                                                                                                                                                                               |
| `GET /api/alphataco/incidents` (**cambia**)                | Suma `host_id=`                                                                                                                                                             | `Incident` suma `host_id` y `host_slug`                                                                                                                                                                                                             |

**`overview` (lo que se suma):**

```json
{
  "dokploy": { "...": "F1" },
  "last_tick_at": "…",
  "hosts": [
    {
      "id": 1,
      "slug": "vps-dokploy",
      "name": "VPS Dokploy (31.97.42.82)",
      "monitoring_enabled": true,
      "agent": "reporting",
      "status": "ok",
      "last_report_at": "2026-10-22T18:04:01Z",
      "agent_version": "0.1.0+3f2a9c1",
      "latest": {
        "sampled_at": "…",
        "cpu_pct": 23.4,
        "mem_avail_pct": 35.7,
        "swap_used_pct": 89.7,
        "disk_used_pct": 70.8,
        "load1": 0.93,
        "containers_running": 70,
        "containers_unhealthy": 0,
        "units_degraded": 0
      },
      "open_incidents": 0,
      "instances": [{ "id": 1, "slug": "demo" }]
    }
  ],
  "instances": [{ "...": "F1", "host": { "id": 1, "slug": "vps-dokploy", "agent": "reporting" } }]
}
```

- **`agent`** puede valer:
  - `never` («esperando el primer reporte»);
  - `reporting` (reportó dentro de 2,5 × el intervalo);
  - `stale` (no reporta: hay un incidente de latido o está por abrirse);
  - `paused`.
- **`status`** del host es el peor de sus chequeos, con el mismo `rankStatus` de F1 (`repository/alphataco.go:309-319`).
- **`instances[].host`** es `null` cuando la instancia no tiene servidor asignado.

**`hosts/{id}`** devuelve lo mismo que el elemento del overview, más:

- `provider`, `address`, `hostname`, `kernel`, `cpu_count`, `mem_total_mb`, `docker_version`, `report_interval_s`, `clock_skew_s`, `notes` y `first_report_at`;
- `checks[]`, con el mismo DTO `AlphatacoCheck` de F1 más `params` y `last_value`;
- `snapshot: {sampled_at, docker_ok, docker_error, mounts[], units[]}`;
- `tokens[]: {id, prefix, note, created_at, expires_at, last_used_at, last_used_ip, revoked_at}`, **sin hash ni valor**.

**`instances/{id}`** suma:

- `host`;
- `has_admin_status_token: bool`;
- `admin_status_at`;
- `admin_status`: el último payload de §10.3 tal como llegó (ya validado y truncado).

---

## 9. Integración con F1

### 9.1 `ContainerProbe` con dos fuentes

```go
type ContainerProbe struct {
    Source      string // "agent" | "dokploy" (vacío = sin fuente)
    Configured  bool   // hay alguna fuente
    Skipped     bool   // circuito de Dokploy abierto (F1)
    Canceled    bool
    Err         string
    Running     int
    Total       int
    Unhealthy   int    // solo agente
    Desired     *int   // solo agente, swarm
    Restarts15m *int   // solo agente; nil = stream de eventos sin dato
}
```

- **`evalContainer`:** `ok` si `Running − Unhealthy ≥ 1`. Con Dokploy, `Unhealthy = 0`, que es el mismo comportamiento de F1.
- **`summary`:** «No hay ninguna réplica sana de alphataco-api (1 corriendo, 1 unhealthy)».
- **`last_error`** dice la fuente: «agente: …» o «Dokploy: …». Así queda claro de dónde salió el dato.

### 9.2 Prioridad de fuentes

1. **Agente**, si `instance.host_id` tiene un snapshot con `received_at` de 3 min o menos y `docker_ok`.
2. **Dokploy**, si está configurado y el circuito lo permite (F1 §4.5).
3. **`unknown`** («sin agente ni Dokploy»).

Si el agente está sano, no se llama a Dokploy: baja de 4 llamadas por minuto a 0. El circuito de F1 solo cuenta las pasadas que de verdad consultaron a Dokploy, así que no se abre un `dokploy_unreachable` cuando no se lo usa.

### 9.3 Degradación limpia: cómo se ve F1 sin agente (o sin token)

| Situación                                                     | Qué pasa                                                                                                                        | Qué muestra la vista                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Instancia sin `host_id` (hoy, hasta el paso 9)                | Los chequeos `container` siguen con Dokploy, como en F1. `restart_loop` queda `unknown` («sin agente»). No hay chequeos de host | Tarjeta de instancia con «Servidor: sin agente» (pill `neutral`) y un enlace «Cómo instalarlo» (§5.7). Nada en rojo         |
| Host creado, el agente nunca reportó                          | `host_heartbeat` y los recursos en `unknown`. No hay incidente                                                                  | Tarjeta del servidor «Esperando el primer reporte del agente», con el prefijo del token y la hora de alta                   |
| El agente reporta pero Docker no responde (`docker_ok=false`) | Los recursos del host se evalúan. `container` cae a Dokploy. `restart_loop` queda `unknown`                                     | Aviso en la tarjeta: «Docker no responde en el servidor: contenedores sin dato del agente»                                  |
| El agente dejó de reportar                                    | Latido en `fail` → incidente crítico a los ~5 min. Recursos en `unknown`. `container` cae a Dokploy                             | Servidor «Caído · sin reportes desde hace X». Incidente «El servidor vps-dokploy dejó de reportar hace 5 min»               |
| Sin `ALPHATACO_SECRETS_KEY_V1`                                | `admin_status`, `jobs` y `migrations` en `unknown`. El `PUT` del token responde 409                                             | Panel «Estado interno»: «Falta configurar la clave de secretos en TaskApp»                                                  |
| Sin token cargado en la instancia                             | Ídem `unknown`                                                                                                                  | Panel: «Cargá el `ADMIN_STATUS_TOKEN` de la instancia para ver jobs, migraciones y módulos», con un campo de solo escritura |
| Alphataco viejo, sin el endpoint (404)                        | `unknown` («la instancia no expone el estado interno: versión anterior a F2»)                                                   | Ídem, con ese texto                                                                                                         |
| Token rechazado (401)                                         | `admin_status` en `fail` → incidente medio «TaskApp no puede leer el estado de demo: token rechazado»                           | Pill en rojo, y el token se puede volver a cargar                                                                           |
| La app no responde                                            | `admin_status` en `unknown` (supresión). El incidente es el de `app_health`, uno solo                                           | Igual que F1                                                                                                                |

---

## 10. Alphataco: `GET /api/admin/v1/status`

### 10.1 Rama y archivos (repo `alphataco-arq`)

- **Rama nueva:** `git fetch && git switch -c feat/admin-status-endpoint origin/main`. **No** desde `refactor/calidad-codigo`.
- **Sin migración:** `alphataco_system` ya puede leer `_prisma_migrations`, `jobs_runs`, `modules`, `tabs`, `company` y `auth_user`. Lo cubre el `GRANT SELECT … ON ALL TABLES IN SCHEMA public` de `prisma/migrations/20261025130000_app_and_system_roles/migration.sql:20`, que corrió cuando `_prisma_migrations` ya existía, más los `DEFAULT PRIVILEGES` de `:25` para las tablas posteriores [verificado en el SQL. Se confirma en la base con `\dp _prisma_migrations` en el paso 7].

| Archivo                                                  | Acción    | Contenido                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/lib/service-token-auth.ts`                   | crear     | `authorizeServiceToken(request, expected): 'ok' \| 'invalid-token' \| 'token-not-configured'`. Es **el algoritmo actual de `Jobs/lib/auth.ts:20-49` movido tal cual**: SHA-256 de los dos lados, `timingSafeEqual` siempre y centinela si no hay token. Un solo lugar para la comparación en tiempo constante                                                                                                 |
| `src/features/Jobs/lib/auth.ts`                          | modificar | `authorizeJobRequest(request)` queda con la **misma firma** y delega en `authorizeServiceToken(request, process.env.JOBS_TOKEN?.trim())`. `auth.test.ts` no se toca. **No se escriben ni se corren tests** (regla del usuario y «Learned Corrections» de Alphataco): se verifica con `check-types` y con `curl` a un job local. El test existente se corre recién cuando el usuario apruebe la etapa de tests |
| `src/features/AdminApi/lib/status.server.ts`             | crear     | `import 'server-only'`. `getInstanceStatus()` con `prismaSystem` y `Logger`. Las consultas de §10.4 en `Promise.all`                                                                                                                                                                                                                                                                                          |
| `src/features/AdminApi/lib/migrations-on-disk.server.ts` | crear     | Lista `prisma/migrations/*/` del filesystem de la imagen (`process.cwd()`; `Dockerfile:133` copia `prisma/` al runtime). Resultado cacheado en memoria del proceso: no cambia sin redeploy                                                                                                                                                                                                                    |
| `src/features/Jobs/lib/schedule.ts`                      | crear     | `JOB_SCHEDULE: Record<JobName, { cron: string; maxAgeHours: number }>`, espejo de `docker/cron/crontab` con un comentario que obliga a mantenerlos juntos. Los diarios llevan `maxAgeHours: 26` y los semanales, 176                                                                                                                                                                                          |
| `src/features/AdminApi/types/index.ts`                   | crear     | `export type InstanceStatus = Awaited<ReturnType<typeof getInstanceStatus>>` (inferido, sin tipos a mano: `typescript-types.md`)                                                                                                                                                                                                                                                                              |
| `src/app/api/admin/v1/status/route.ts`                   | crear     | Fino: `await connection()`, autorización, caché de 30 s y `Response.json`. **Sin `export const dynamic`** (`Jobs/lib/handler.ts:23-25`). Comentario de excepción a «Server Actions, no API routes», como en `src/app/api/jobs/documents-status/route.ts:7-11`                                                                                                                                                 |
| `.env.example`                                           | modificar | `ADMIN_STATUS_TOKEN=` (sin valor), con el comentario «solo lectura para la sala de control de TaskApp; distinto de JOBS_TOKEN; `openssl rand -base64 32`»                                                                                                                                                                                                                                                     |
| `docker-compose.yml`                                     | modificar | `ADMIN_STATUS_TOKEN: ${ADMIN_STATUS_TOKEN}` en el servicio de la app, junto a `JOBS_TOKEN` (`:126`)                                                                                                                                                                                                                                                                                                           |
| `docs/arquitectura/RUNBOOK-NUEVA-INSTANCIA.md`           | modificar | Sumar `ADMIN_STATUS_TOKEN` a la lista de variables de runtime (`:28`) y el paso «cargar el mismo valor en TaskApp → instancia → token de estado»                                                                                                                                                                                                                                                              |

**Por qué un helper compartido y no una copia:** la comparación en tiempo constante es delicada (el largo, el centinela, hashear siempre). Dos copias divergen. Se extrae sin cambiar el comportamiento de los jobs.

### 10.2 Ruta

```ts
// src/app/api/admin/v1/status/route.ts
import { connection } from 'next/server';

import { Logger } from '@/lib/logger';
import { getInstanceStatus } from '@/features/AdminApi/lib/status.server';
import { authorizeServiceToken } from '@/shared/lib/service-token-auth';

const logger = new Logger('api/admin/v1/status');

/** El estado se recalcula como mucho cada 30 s: protege la base aunque el token se filtre. */
const CACHE_TTL_MS = 30_000;
let cached: { at: number; body: Awaited<ReturnType<typeof getInstanceStatus>> } | null = null;

/**
 * Estado interno de la instancia para la sala de control de TaskApp (solo lectura).
 *
 * NO convertir a Server Action: es máquina a máquina (TaskApp → instancia), como /api/health
 * y /api/jobs/*. No pasa por el proxy de sesión (`src/proxy.ts`, matcher /dashboard/:path*):
 * la única llave es ADMIN_STATUS_TOKEN. Sin token configurado no entra nadie (401, sin detalle).
 * No devuelve datos de negocio ni PII: versión, migraciones, módulos, conteos y jobs agregados.
 */
export async function GET(request: Request) {
  await connection();
  const auth = authorizeServiceToken(request, process.env.ADMIN_STATUS_TOKEN?.trim());
  if (auth !== 'ok') {
    logger.warn('Pedido de estado rechazado', { data: { reason: auth } });
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
      cached = { at: Date.now(), body: await getInstanceStatus() };
    }
    return Response.json(cached.body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('No se pudo armar el estado de la instancia', { data: { error } });
    return Response.json({ error: 'status_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
```

Solo `GET`. Cualquier otro método recibe 405 de Next. No hay parámetros.

### 10.3 Respuesta (`200`)

```json
{
  "schema": 1,
  "generated_at": "2026-10-22T18:05:00.000Z",
  "version": { "sha": "827c6444…", "node": "v22.11.0", "process_started_at": "2026-10-22T14:51:20.000Z" },
  "database": { "latency_ms": 3 },
  "migrations": {
    "applied": 214,
    "on_disk": 214,
    "pending": 0,
    "failed": 0,
    "last": { "name": "20261029110000_processed_commands_purge", "finished_at": "2026-10-22T14:51:18.000Z" },
    "pending_names": [],
    "failed_names": []
  },
  "modules": [
    {
      "slug": "mantenimiento",
      "name": "Mantenimiento",
      "is_active": true,
      "tabs_total": 12,
      "tabs_active": 12,
      "tabs_inactive_slugs": []
    }
  ],
  "counts": {
    "companies_active": 1,
    "companies_inactive": 0,
    "users_active": 18,
    "users_banned": 0,
    "users_seen_30d": 9
  },
  "jobs": [
    {
      "job": "documents-status",
      "schedule": "10 0 * * *",
      "max_age_hours": 26,
      "last_started_at": "2026-10-22T03:10:01Z",
      "last_finished_at": "2026-10-22T03:10:04Z",
      "last_status": "ok",
      "last_ok_at": "2026-10-22T03:10:04Z",
      "last_error_at": null,
      "errors_24h": 0,
      "overdue": false
    }
  ]
}
```

**Qué no va nunca:**

- `jobs_runs.error`, `metadata` ni `company_id` (pueden llevar textos de excepciones con datos);
- nombres de empresas ni de usuarios;
- emails;
- variables de entorno.

`modules[].is_active` se informa **tal cual**: la columna es `Boolean?` (`schema.prisma:1892` en `origin/main`), y un `NULL` se apaga en `get_user_permissions` (exige `m.is_active`). La vista muestra `null` como «Sin valor (cuenta como apagado)». **Solo lectura**: el control de módulos es F3.

### 10.4 Consultas (todas con `prismaSystem`, `src/shared/lib/prisma-system.ts:23-24`)

Por qué `prismaSystem`: con RLS, el cliente contextual sin sesión (`prisma.ts:45-51`) corre sin `app.company_id`, y los conteos por empresa darían 0 o fallarían según la política. El de sistema tiene `BYPASSRLS` y es justo el caso que su comentario describe: lo que corre para todas las empresas a la vez (`prisma-system.ts:15-21`). Las consultas son agregadas y no devuelven filas de negocio.

```sql
-- latencia: SELECT 1 (medida con performance.now())

-- migraciones (en un $queryRaw): nombres aplicados y fallidos
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations ORDER BY started_at;
--   applied = finished_at IS NOT NULL AND rolled_back_at IS NULL
--   failed  = finished_at IS NULL AND rolled_back_at IS NULL
--   pending = carpetas en disco − nombres aplicados

-- módulos y pestañas
SELECT m.slug, m.name, m.is_active,
       count(t.id)::int AS tabs_total,
       count(t.id) FILTER (WHERE t.is_active)::int AS tabs_active,
       coalesce(array_agg(t.slug) FILTER (WHERE t.id IS NOT NULL AND t.is_active IS DISTINCT FROM true), '{}') AS tabs_inactive_slugs
FROM modules m LEFT JOIN tabs t ON t.module_id = m.id
GROUP BY m.id ORDER BY m.order_index, m.slug;

-- conteos (sin PII)
SELECT count(*) FILTER (WHERE is_active)::int, count(*) FILTER (WHERE NOT is_active)::int FROM company;
SELECT count(*) FILTER (WHERE NOT banned AND NOT is_anonymous)::int AS users_active,
       count(*) FILTER (WHERE banned)::int AS users_banned
FROM auth_user;
SELECT count(DISTINCT user_id)::int FROM auth_session WHERE updated_at > NOW() - interval '30 days';

-- jobs (agregado por job; nunca error/metadata/company_id)
SELECT job,
       max(started_at)                                         AS last_started_at,
       max(finished_at)                                        AS last_finished_at,
       max(finished_at) FILTER (WHERE status = 'ok')           AS last_ok_at,
       max(finished_at) FILTER (WHERE status = 'error')        AS last_error_at,
       count(*) FILTER (WHERE status = 'error' AND started_at > NOW() - interval '24 hours')::int AS errors_24h,
       (array_agg(status ORDER BY started_at DESC))[1]::text   AS last_status
FROM jobs_runs
WHERE started_at > NOW() - interval '30 days'
GROUP BY job;
```

**Reglas:**

- El índice `@@index([job, started_at])` de `jobs_runs` (`schema.prisma:1566`) cubre la ventana de 30 días.
- **`overdue`** se calcula en TypeScript: `last_started_at` es `null` o es más viejo que `maxAgeHours`.
- Los jobs de `JOB_NAMES` (`Jobs/lib/types.ts:2-9`) que no tienen filas igual aparecen, con `last_status: null` y `overdue: true` **solo si** el proceso lleva más de `maxAgeHours` arriba. Así una instancia recién creada no queda en rojo.
- Hora: todo va en UTC ISO. La vista de TaskApp lo muestra en hora argentina (regla de Alphataco «Fechas y horas»).

### 10.5 Cómo lo consume TaskApp

- **Sonda `AdminStatus`:**
  - `GET {app_url}/api/admin/v1/status` con `Authorization: Bearer <descifrado en el momento>`;
  - mismo cliente que `/api/health`: 5 s, 64 KiB y sin redirecciones (`alphataco_probes.go:22-29`);
  - el token se descifra **por llamada** y no se guarda en memoria entre pasadas.
- **Clasificación:**
  - 200 + `schema = 1` → `ok`, y el payload (validado y truncado) se guarda en `alphataco_instances.admin_status`;
  - 401 o 403 → `fail` «token rechazado»;
  - 404 → `unknown` «versión sin el endpoint»;
  - 5xx o timeout → `fail`.
- **Derivados:** `jobs` y `migrations` se evalúan sobre ese payload (§6.2).
- **En la demo, `app_url` es el dominio público**, el mismo que ya usa `/api/health` desde el contenedor de TaskApp (_hairpin_ verificado el 2026-10-22: `wget` desde el contenedor `taskapp-backend` a `https://alphataco.31.97.42.82.sslip.io/api/health` devolvió `{"status":"ok","sha":"827c6444…","storage":"ok"}`). El token viaja por HTTPS.

---

## 11. Vista

Se mantiene el protocolo de F1 §5.5: la skill `ibelick/fixing-accessibility`, el estado siempre con texto, `role="status"` montado siempre, `tabular-nums`, `<time>` y la verificación a 390 px. En el catálogo de `ui-skills` no hay una skill de gráficos que encaje (la consulta `chart` devolvió diagramas y presentaciones). Para los gráficos se aplica la guía local `dataviz`: colores con tokens `var(--chart-n)`, como `resolution-chart.tsx:1-4`, y verificación de contraste en claro y oscuro.

### 11.1 Pestaña «Servidores» (`/alphataco`)

Grilla de `HostCard`: 1 columna en móvil y 2 desde `md`. Cada tarjeta es **un único `<Link>`** al detalle, con nombre accesible «Ver servidor VPS Dokploy». Muestra:

- nombre, `address`, pill de estado y pill del agente («Reportando», «Sin reportes hace 7 min», «Esperando el primer reporte» o «Pausado»);
- **cuatro `ResourceMeter`**: CPU, Memoria disponible, Disco `/` y Swap. Cada uno es una barra con el valor en texto («CPU 23 %»), con color por umbral y **siempre con el texto**. Swap lleva la nota «informativo». Debajo, «Carga 0,93 · 2 vCPU»;
- contenedores: «70 corriendo · 0 unhealthy · 0 servicios degradados · 0 reinicios en 15 min»;
- incidentes abiertos e instancias alojadas («demo»);
- si `clock_skew_s` pasa de 120 s: «El reloj del servidor está desfasado X min».

**Vacío:** «Todavía no hay servidores. Creá uno para obtener el token del agente», con el botón «Nuevo servidor» (diálogo con `Form`: slug, nombre, proveedor y dirección). Al crear, el diálogo pasa a **mostrar el token una sola vez**:

- campo de solo lectura, botón «Copiar token» (`aria-label`) y el aviso «No se vuelve a mostrar»;
- el bloque de instalación de §5.7 listo para copiar, **sin el token adentro**;
- un único botón «Ya lo guardé», que cierra.

No hay modales encadenados: el alta y el token son el mismo diálogo en dos estados.

### 11.2 Detalle del servidor (`/alphataco/servidores/:id`)

- **Encabezado:** nombre, `hostname`, kernel, Docker, versión del agente, último reporte (`<time>`), botón «Pausar o reanudar» con `AlertDialog` y la lista de instancias alojadas con enlaces.
- **Sección «Recursos»:**
  - selector `24 h · 7 días · 30 días` (`ToggleGroup`, con `aria-label`);
  - **tres gráficos chicos de `recharts`** (`LineChart`/`AreaChart` en `ResponsiveContainer`, altura de unos 160 px):
    - CPU (promedio, y máximo en 7d y 30d);
    - Memoria disponible + PSI de memoria (eje secundario);
    - Disco `%`;
  - una línea de referencia punteada en el umbral `open` del chequeo, y la etiqueta del umbral en texto;
  - cada gráfico lleva `<figure>` con `<figcaption>` y un resumen textual en `sr-only` («CPU: promedio 21 %, máximo 64 % en las últimas 24 h»);
  - tooltip con `CustomChartTooltip` (`src/components/dashboard/chart-tooltip`), reutilizado.
  - `useHostSamples` se activa **solo con la sección visible** (`enabled`).
- **Sección «Chequeos»:** los de host, con el mismo `CheckRow` de F1 (estado, progreso «Fallando 4/10», último valor con unidad, historial desplegable con la columna `valor`). Los tipos con umbrales tienen el botón «Umbrales» → `ThresholdDialog` (`Form` + zod: `open`, `clear` y `critical`, con validación `clear < open`), que muestra el delta antes de guardar («Abre al 85 % → 40 %»).
- **Sección «Contenedores»** (`ContainersTable`, dentro de `scroll-x-pane`, `<th scope="col">`):
  - columnas: Unidad (nombre y tipo swarm/compose/contenedor), Estado (texto + pill), Réplicas (`1/1`), Unhealthy, Reinicios en 15 min, Memoria, CPU e Imagen (truncada, con `title`);
  - filtro «Solo Alphataco / Todos»: «Solo Alphataco» = unidades casadas con servicios de instancias del host (§6.2), y es el valor por defecto;
  - orden: primero las degradadas;
  - con `docker_ok=false`, el estado vacío explícito: «Docker no responde en el servidor desde hace X», **nunca** «sin contenedores».
- **Sección «Incidentes»:** `IncidentsTable` con `hostId`.
- **Sección «Tokens del agente»** (`AgentTokens`):
  - tabla: prefijo, nota, creado, vence, último uso (hora e IP) y estado;
  - «Revocar» con `AlertDialog` («El agente que use este token deja de reportar en el próximo minuto»);
  - «Generar token nuevo», con el mismo diálogo de una sola vez y la opción «el anterior vence en 24 h».

### 11.3 Detalle de instancia (cambios)

- **«Servidor»:** enlace al host con su pill, o «Sin agente» con el enlace a las instrucciones.
- **`AdminStatusPanel` («Estado interno»):**
  - versión (`sha` corto), proceso iniciado hace X y latencia de la base;
  - **Migraciones:** «214 aplicadas · 0 pendientes · 0 fallidas · última: `2026…_processed_commands_purge` hace 3 h», y los nombres pendientes o fallidos en rojo, con texto;
  - **Módulos (solo lectura):** lista con un pill «Encendido», «Apagado» o «Sin valor (cuenta como apagado)» y «12/12 pestañas activas». Si hay pestañas inactivas, se despliegan (`aria-expanded`). Nota visible: «El control de módulos llega en F3»;
  - **Conteos:** empresas activas, usuarios activos y vistos en 30 días;
  - **Jobs:** tabla Job · Programación (texto, por ejemplo «todos los días 00:10») · Última corrida · Estado · Último OK · Errores en 24 h · «Atrasado» en rojo;
  - pie: «Actualizado hace X (se consulta cada 5 min)»;
  - **token:** «Token de estado: cargado / no cargado», con el botón «Cargar o reemplazar» (campo `type="password"`, solo escritura) y «Quitar».

### 11.4 Estados (siempre los cuatro)

| Estado   | Cómo                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Carga    | `Skeleton` con la forma final (tarjetas, 3 gráficos, tabla) y `aria-busy`                                          |
| Error    | `QueryError` con «Reintentar». 403 con el texto de F1                                                              |
| Vacío    | Los textos de §11.1 y §11.2. Ningún vacío afirma una buena noticia sin dato (F1 §5.3)                              |
| Sin dato | «Sin dato» en gris con el motivo (`last_error`: «sin agente», «esperando el primer reporte», «Docker no responde») |

---

## 12. Orden de implementación (pasos chicos y verificables)

Ningún paso incluye commits ni despliegues. Las reglas de commit, PR y bajar el entorno del usuario se aplican cuando él lo pida. Todo lo que se levante localmente se baja al terminar.

| #     | Paso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Cómo se verifica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0** | **Relevamiento de solo lectura** (resuelve los [supuesto]): `uname -m` en la VPS; `docker info --format '{{.CgroupDriver}}'` y `ls /sys/fs/cgroup/system.slice \| grep docker- \| head -3`; `curl -sS -o /dev/null -w '%{http_code}' https://apitaskapp.codecontrol.com.ar/health` **desde el host** de la VPS (el agente sale desde el host, no desde un contenedor); volver a listar `db/migrations` en `origin/main` (¿068 libre?)                                                                                                                 | Tabla agregada a este documento. Si el _driver_ no es `systemd`, se ajusta la ruta del cgroup (`docker/<id>`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1     | **Migración 068.** Levantar el Postgres local de TaskApp (`docker compose up -d postgres` en `taskApp-backend`) y `go run ./cmd/server` (aplica 066, 067 y 068). Correrla **dos veces** (reiniciar el server)                                                                                                                                                                                                                                                                                                                                         | `\d alphataco_checks` y `\d alphataco_incidents`: aparecen `alphataco_checks_type_check_v2`, `_owner_check` y `_host_type_check`, y **no** quedan los CHECK viejos de `type` ni de `kind`. `SELECT conname FROM pg_constraint WHERE conrelid='alphataco_checks'::regclass`. Los inserts de F1 siguen funcionando (correr `db/seeds/alphataco_demo.sql` en local)                                                                                                                                                                                                                                                                                                         |
| 2     | Model, contrato del agente, repo de hosts, `ApplyOutcomeInput` con ids opcionales, `CloseIncidentsOfDisabledChecks`, `summaries` y `ListIncidents`                                                                                                                                                                                                                                                                                                                                                                                                    | `go build ./... && go vet ./cmd/... ./internal/... ./db/...`. Con el seed local, la vista de F1 responde **igual que antes** (`curl /api/alphataco/overview` con un token de usuario con capability: los mismos campos, más `hosts: []`)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3     | `POST /hosts`, tokens, `AgentTokenAuth` y `POST /api/agent/v1/reports` con `StoreReport` (sin evaluación)                                                                                                                                                                                                                                                                                                                                                                                                                                             | `curl` con un JSON de §5.5: 202. Sin token, 401. Token revocado, 401. Cuerpo de 300 KB, 413. Gzip de 200 KB que se descomprime a 5 MB, 413. Mismo reporte dos veces: `duplicates: 1`. Muestra con `sampled_at` de hace 7 h: `dropped: 1`. `grep` en el log del server: **no aparece el token**                                                                                                                                                                                                                                                                                                                                                                           |
| 4     | `alphataco_host_eval.go`, evaluación al ingresar y `PATCH /checks/{id}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Con `curl`: mandar 2 muestras de disco al 70 % con `open` en 40 (`PATCH`) → **un** incidente `host_disk` abierto; subir `open` a 85 → se cierra a las 3 muestras. Disco al 95 % → la severidad pasa a crítica **en el mismo incidente** (`SELECT count(*)` = 1)                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5     | Latido en el monitor, con gracia de arranque                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Dejar de mandar reportes: a los ~5 min, **un** `host_heartbeat` abierto y los demás chequeos del host en `unknown`. Reanudar → se cierra en el primer reporte. **Reiniciar TaskApp con el agente parado 6 min** y volver a levantar los dos: no se abre ningún latido falso. Un host recién creado sin reportes: `unknown`, sin incidente                                                                                                                                                                                                                                                                                                                                |
| 6     | **Agente** (`cmd/alphataco-agent`, `internal/agent/*`) contra el TaskApp local                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `go build ./cmd/alphataco-agent`. `TASKAPP_URL=http://localhost:8080 AGENT_ALLOW_HTTP=1 AGENT_INTERVAL=15s AGENT_TOKEN=… ./alphataco-agent` (el token se pega con `read -rs`, sin `echo`). En la vista aparece «Reportando». Medir el consumo: `ps -o rss,pcpu -p <pid>` durante 5 min. Medir el payload: log de depuración con el tamaño en bytes (nunca el contenido). Cortar el server 3 min y volver: el búfer rellena el historial (`SELECT count(*) FROM alphataco_host_samples` sin huecos) y el log no repite «token rechazado»                                                                                                                                  |
| 7     | **Docker de prueba aislado** (para no tocar el Docker de `vps-yordan`): `docker run -d --privileged --name f2-dind -v <scratchpad>/dind:/var/run docker:28-dind`. Dentro: `docker swarm init` y `docker service create --name loop alpine false` (bucle en swarm), `docker run -d --restart=always --name loop2 alpine sh -c 'sleep 20; exit 1'` (bucle sin swarm) y `docker service create --name sano --health-cmd 'false' --health-interval 5s nginx:alpine` (unhealthy). El agente con `DOCKER_SOCKET=<scratchpad>/dind/docker.sock`              | En la tabla de contenedores: `loop` con `restarts_15m` creciente y réplicas 0/1; `loop2` con reinicios; `sano` unhealthy. **Un** `host_restart_loop`. Registrar en el seed local un servicio de instancia con `dokploy_kind='application'` y `dokploy_app_name='loop'`: su `container` y su `restart_loop` fallan **con la fuente «agente»**. `docker stop` dentro del dind → `docker_ok=false`, los recursos del host se siguen evaluando y `container` cae a Dokploy (sin configurar → `unknown`). **Al terminar:** `docker rm -f f2-dind` y borrar `<scratchpad>/dind`                                                                                                |
| 8     | **Alphataco**, en la rama `feat/admin-status-endpoint`: helper compartido, ruta, `status.server.ts`, `schedule.ts`, `.env.example`, `docker-compose.yml` y runbook                                                                                                                                                                                                                                                                                                                                                                                    | `npm run check-types` (sin correr tests). Un job local con el `JOBS_TOKEN` correcto sigue respondiendo y con uno incorrecto da 401, así que el helper extraído no cambió el comportamiento. Compose local (`bash scripts/dev-up.sh`, `npm run dev`): `curl -i /api/admin/v1/status` → 401. Con un token incorrecto → 401. Con `ADMIN_STATUS_TOKEN` sin configurar → 401. Con el token correcto → JSON de §10.3. Revisar a ojo que no haya emails, nombres ni textos de error. `\dp _prisma_migrations` como `alphataco_system`. Forzar un job en error: `UPDATE jobs_runs SET status='error' WHERE …` en la base **local** → `errors_24h: 1` (esperar 30 s por la caché) |
| 9     | TaskApp: `secretbox`, secretos, sonda `admin_status` y derivados `jobs` y `migrations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Con `ALPHATACO_SECRETS_KEY_V1` local (`openssl rand -base64 32`, exportada sin `echo`): `PUT …/admin-status-token` → 204. `SELECT ciphertext FROM alphataco_secrets` no contiene el token en claro. Instancia local apuntando al Alphataco local: `admin_status` en `ok` y el panel con datos. Job en error → **un** incidente `jobs`. Token incorrecto → `admin_status` en `fail`. Sin clave → 409 y `unknown`. Alphataco sin la ruta (otra rama) → `unknown` «versión anterior»                                                                                                                                                                                        |
| 10    | Frontend: tipos, API, hooks, pestaña «Servidores», detalle del servidor, panel de estado interno, tokens y umbrales                                                                                                                                                                                                                                                                                                                                                                                                                                   | `pnpm lint && pnpm build`. Navegador con lectura de texto (snapshot), capturas solo para los gráficos. Probar: carga, error (backend apagado), vacío (sin hosts), host «Esperando el primer reporte», host reportando, incidente de disco por umbral bajado y token mostrado una sola vez (al recargar ya no está). Teclado completo y desborde a 390 px (`scrollWidth <= clientWidth`)                                                                                                                                                                                                                                                                                  |
| 11    | **Puesta en producción** (solo cuando el usuario lo pida, con aprobación explícita para instalar en la VPS): (a) `ALPHATACO_SECRETS_KEY_V1` en el entorno de `taskapp-backend` en Dokploy (nunca en el `Dockerfile`), y deploy; (b) deploy de Alphataco con `ADMIN_STATUS_TOKEN` en el entorno de la app de la demo y el mismo valor cargado en la vista de TaskApp; (c) crear el host `vps-dokploy` en la vista, instalar el agente con §5.7 y `PATCH` de la instancia `demo` con `host_id`; (d) seed actualizado con los chequeos nuevos de la demo | Servidor «Reportando», los cuatro medidores coinciden con `free -m` y `df -h /` (±1 %). `container` de la demo con la fuente «agente». Panel de estado interno completo. Bajar `host_disk.open` a 40 → un incidente; volver a 85 → se cierra. `sudo systemctl stop alphataco-agent` → latido abierto a los ~5 min; `start` → se cierra. Consumo del agente en la VPS (`systemctl status`: memoria < 20 MB)                                                                                                                                                                                                                                                               |

---

## 13. Riesgos, decisiones y pendientes

### 13.1 Decisiones justificadas (además de §1)

1. **Muestras de 1 minuto con 7 días de crudo y 180 de horario, sin TimescaleDB ni librerías:**
   - **Crudo:** ~150 B por fila con índice × 1440 por día ≈ **0,2 MB por día por host**, y ~1,5 MB en 7 días.
   - **Horario:** 24 × 180 ≈ 4300 filas, unos **0,7 MB por host**.
   - **Snapshot:** una fila de ~10 KB que se pisa cada minuto. Son 1440 _updates_ por día, una carga trivial para el autovacuum.
   - **Con 20 hosts** sigue siendo menos de 50 MB.
   - **El _rollup_** es un único `INSERT INTO …_hourly SELECT date_trunc('hour', sampled_at), … GROUP BY 1,2 ON CONFLICT (host_id, hour) DO UPDATE` sobre las horas cerradas que no tienen agregado. Corre dentro de la purga, con el mismo _advisory lock_ (`repository/alphataco.go:271-277`). Después se borran las muestras de más de 7 días en lotes de 5000, igual que F1.
2. **Evaluación al ingresar y latido en el monitor (D6).** Evaluar los recursos en el tick de 15 s mezclaría muestras repetidas y perdidas con el ritmo del ticker. Al ingresar, cada muestra es un paso exacto.
3. **Los umbrales viven en la base (`alphataco_checks.params`)**, con defaults en el código. Se pueden ajustar por host sin redeploy, y la prueba «bajar el disco a 40 %» es un `PATCH`, no un cambio de código.
4. **El swap no alerta.** La evidencia es de hoy: 90 % de swap con PSI de 0,07 %. La señal es `MemAvailable` más PSI `full`.
5. **No hay endpoint del agente bajo `/api/alphataco`:** chi no deja montar una ruta sin `Auth` dentro del grupo que lo exige (`main.go:598-600`). `/api/agent/v1` no se solapa con ningún subrouter existente.
6. **Secretos en una tabla con FK a la instancia,** en lugar del `scope TEXT` del boceto de F1 §7.2. El borrado en cascada y la AAD por id son más simples. El resto (AES-GCM, versión de clave, solo escritura) es lo mismo.

### 13.2 Riesgos

| Riesgo                                                                                                                  | Impacto                                                            | Mitigación                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El vigilante sigue en la misma VPS** (decisión del usuario: vive en `31.97.42.82`; no se diseña nada en `vps-yordan`) | Si la VPS cae, caen el agente, TaskApp y la vista: **nadie avisa** | **Aceptado por escrito.** El latido detecta cuándo cae un host **distinto** del de TaskApp (las VPS de clientes futuras). Para la VPS propia, la vista lo muestra al volver (hueco en los gráficos, `uptime_s` reiniciado). Un chequeo externo gratuito (tipo healthchecks.io) queda como opcional en F4, si el usuario lo pide |
| El agente con acceso al socket de Docker equivale a root                                                                | Un agente comprometido controla Docker                             | Solo biblioteca estándar, tres GET constantes, sin puertos de entrada, endurecimiento de `systemd` (§5.6), binario verificado por SHA-256. Es el mismo nivel que ya tiene `yordan` (grupo `docker`)                                                                                                                             |
| Fuga del token del agente                                                                                               | Alguien puede mandar métricas falsas de ese host                   | El token solo sirve para escribir muestras de **su** host. Rate limit por IP y por host. Revocación inmediata y rotación con solapamiento. No da lectura de nada                                                                                                                                                                |
| Fuga de `ADMIN_STATUS_TOKEN`                                                                                            | Lectura de versión, módulos, conteos y estado de jobs              | Sin PII ni datos de negocio, solo lectura, caché de 30 s. Distinto de `JOBS_TOKEN` (que manda correos) y del futuro token de módulos (F3)                                                                                                                                                                                       |
| Fuga de `ALPHATACO_SECRETS_KEY_V1` junto con un respaldo de la base de TaskApp                                          | Se pueden descifrar los tokens de estado                           | La clave vive solo en el entorno de Dokploy, no en la base ni en el `Dockerfile`. Para rotar: crear `V2`, volver a guardar los tokens y quitar `V1`                                                                                                                                                                             |
| Ruta del cgroup por contenedor [supuesto]                                                                               | Memoria y CPU por contenedor en `null`                             | Paso 0. Es información, no alerta: nada depende de eso                                                                                                                                                                                                                                                                          |
| Stream de eventos cortado                                                                                               | `restart_loop` sin dato                                            | Va `null` → `unknown`, nunca `0`. Reconexión con backoff. Las réplicas de `/services` siguen detectando la caída                                                                                                                                                                                                                |
| Reloj del agente desfasado                                                                                              | Muestras descartadas o fuera de orden                              | El latido usa la hora de recepción. Las muestras fuera de `[−6 h, +2 min]` se descartan y se cuentan. La vista avisa si el desfase pasa de 120 s                                                                                                                                                                                |
| Reinicio o deploy de TaskApp                                                                                            | Latidos falsos en todos los hosts                                  | Gracia de arranque de 3 min y salto si el tick anterior está viejo (§6.3)                                                                                                                                                                                                                                                       |
| `jobs` atrasado en una instancia nueva o tras un reset                                                                  | Falso «atrasado»                                                   | `overdue` solo si el proceso lleva más de `maxAgeHours` arriba. El `JOB_SCHEDULE` vive en Alphataco junto al crontab                                                                                                                                                                                                            |
| `JOB_SCHEDULE` desincronizado del `crontab`                                                                             | `overdue` mal calculado                                            | Comentario en los dos archivos y revisión en el diff. Se ve enseguida en la vista                                                                                                                                                                                                                                               |
| Choque de numeración (068 tomada)                                                                                       | La migración no se aplica                                          | Paso 0. F3 pasa a 069                                                                                                                                                                                                                                                                                                           |
| Los CHECK sin nombre de 067                                                                                             | Que el `DROP` no encuentre la restricción                          | Se buscan por definición (`pg_get_constraintdef`) y se verifica con `\d` en el paso 1. Si F1 se reescribe antes de desplegar, el bloque igual funciona                                                                                                                                                                          |

### 13.3 Fuera de alcance (solo se reporta)

- **`internal/middleware/apikey.go:29,34` loguea la API key de proyecto en claro** en cada intento fallido (`key=%s`). Conviene abrir un ticket aparte: loguear solo el prefijo. F2 **no** copia ese patrón.
- Los del F1 §7.3 siguen vigentes:
  - registro público con rol `admin`;
  - `integration_test.go:70`;
  - credenciales en claro en el `Dockerfile` de TaskApp.
- `alphataco-arq` no tiene índice de CodeGraph. Indexarlo es decisión del usuario (`codegraph init`).

**Skills y reglas aplicadas en el diseño:**

- `ibelick/fixing-accessibility` (reutilizada de F1) para los medidores, tablas y diálogos.
- Guía local `dataviz` para los gráficos (no había ninguna skill de gráficos en el catálogo).
- Reglas de Vercel a aplicar en la implementación:
  - `bundle-dynamic-imports`: `recharts` solo en el chunk diferido de `/alphataco`;
  - `client-swr-dedup`: las `queryKey` bajo `["alphataco", …]` y `enabled` en series e historial.
- Reglas de Alphataco:
  - `code-language`;
  - `logger`;
  - `typescript-types` (tipo inferido del retorno);
  - `server-actions`, con la excepción documentada;
  - `no-format-commands`.
