# Runbook: instanciar, desplegar y actualizar un cliente

Estado de cada paso: **[hoy]** existe y funciona, **[con falla]** existe pero tiene un problema conocido, **[a construir]** es el objetivo de la fábrica de instancias. El detalle de lo que existe hoy está en `docs/deploy/runbook.md`.

## 1. Qué se clona, qué se crea y qué se comparte

|                                 | Contenido                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Se clona** (repo del cliente) | Código completo, Dockerfile, compose, Caddyfile, workflows, esquema Prisma, migraciones y seed, tests y `e2e/`, historia de git con `upstream`, y la ficha `instance.yml` (nueva) |
| **Se crea nuevo por cliente**   | VPS y proyecto en Dokploy, PostgreSQL con base vacía, bucket de MinIO, secretos, dominio y TLS, imagen propia, primer admin, jobs, backups, registro para la app móvil            |
| **Se comparte**                 | Repo base, repo móvil y app genérica, CI y workflows reutilizables, monitoreo central, proyecto de Expo para push                                                                 |

## 2. Alta de un cliente nuevo

Objetivo: `scripts/instance/new.sh <slug>` **[a construir]**. Mientras tanto, estos son los pasos manuales equivalentes.

1. **Repo del cliente [a construir como script]:** copia con historia común, no repo plantilla.
   ```
   git clone --bare <repo-base> base.git && cd base.git
   git push --mirror <repo-cliente>
   # en el repo del cliente:
   git remote add upstream <repo-base>
   ```
2. **Ficha `instance.yml`** en la raíz **[a construir]**: ver sección 5.
3. **Secretos y variables** **[hoy, manual]:** se generan con `openssl rand` y se cargan en GitHub (secrets y variables) y en Dokploy. Nombres de variables (sin valores):
   - GitHub secrets: `REGISTRY_PASSWORD`, `DOKPLOY_DEPLOY_WEBHOOK`.
   - GitHub variables: `REGISTRY_USERNAME`, `REGISTRY_HOST` y `IMAGE_NAME` (propios de cada cliente para no pisar el tag `:main` de otro en el mismo registro), `DOKPLOY_HEALTH_URL`, `NEXT_PUBLIC_BASE_URL` (obligatoria), `NEXT_PUBLIC_PROJECT_URL`, `NEXT_PUBLIC_POSTHOG_*`, `NEXT_PUBLIC_SHOW_LOGS`, `CI_RUNNER`.
   - Runtime en Dokploy: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `S3_*`, `JOBS_TOKEN`, `ADMIN_STATUS_TOKEN`, `SMTP_*`, `EMAIL_FROM_NAME`, `FISCAL_SECRETS_KEY`, `ARCA_MODE`, `ARCA_ALLOW_PRODUCTION`, `RUN_SEED`, `SEED_COMPANY_NAME` (y las de integraciones que use el cliente).
   - Plantilla: `.env.docker.example`. **Los valores no se guardan en el repo.**
   - **`ADMIN_STATUS_TOKEN`** (solo lectura, para `GET /api/admin/v1/status`): distinto de `JOBS_TOKEN`; se genera con `openssl rand -base64 32`. **Cargar el mismo valor en TaskApp → instancia → token de estado** (sala de control). Sin esta variable el endpoint responde 401 a todos y la sala de control muestra la sonda como no disponible. Para rotarlo: generar uno nuevo, cargarlo en Dokploy, redeployar y cargarlo en TaskApp.
4. **VPS [manual]:** contratar, instalar Dokploy (o sumarla como servidor remoto) y dejar el acceso por SSH.
5. **DNS [manual]:** registro A del dominio hacia la IP. TLS automático.
6. **Dokploy [hoy, manual; a construir por API]:** proyecto, PostgreSQL, MinIO, aplicación (provider Docker, hace pull de `:main`) y dominio. **Almacenamiento:** usar RustFS fijado (`rustfs/rustfs:1.0.3`), no MinIO (su imagen oficial ya no se puede bajar). Receta del servicio en `docs/deploy/runbook.md` ("Almacenamiento S3"). El webhook de deploy se guarda como secret `DOKPLOY_DEPLOY_WEBHOOK`.
7. **Primer deploy [corregido en la rama `feat/arquitectura-instancias`, pendiente de "subí"]:** `RUN_SEED=true` en el primer arranque.
   - El seed ahora tiene en el runner todos los archivos que importa (antes fallaba con `ERR_MODULE_NOT_FOUND`); un test (`scripts/runner-files.test.ts`) lo vigila.
   - Los buckets del almacenamiento S3 se crean solos en cada arranque (`scripts/ensure-buckets.ts`). Si falla, la app arranca igual y `/api/health` informa `storage: "error"`, lo que deja el workflow de deploy en rojo.
8. **Primer administrador [corregido en la rama, pendiente de "subí"]:** dentro del contenedor de la app,
   ```
   node scripts/bootstrap-admin.ts --email admin@dominio.com --name "Nombre Apellido" --company "<SEED_COMPANY_NAME>"
   ```
   Imprime el enlace para definir la contraseña (vence en 24 h). `--reissue-link` emite otro para un usuario que ya existe. Reemplaza al bloque SQL de `docs/deploy/runbook.md`.
9. **Jobs y backups [a construir]:** los jobs hoy son Schedules cargados a mano en Dokploy; los backups no existen.
10. **App móvil [a construir]:** si `mobile.enabled`, registrar la instancia para la app (código o QR → URL del servidor).
11. **Verificación [hoy]:** `/api/health` devuelve el `sha` desplegado; probar el login.
12. Cambiar `RUN_SEED` a `false` una vez creada la empresa.

## 3. Redeploy y actualización

- **Desplegar un cambio [hoy]:** push a `main` del repo del cliente → `deploy.yml` filtra por paths, corre `verify` (check-types + vitest) en paralelo con el build, publica `:sha-<commit>`, reetiqueta `:main`, llama al webhook de Dokploy y espera a que `/api/health` devuelva el mismo `sha`.
- **Rollback [hoy, manual]:** reetiquetar `:main` con el `:sha-<bueno>` (`imagetools create`) y redeploy. **[a construir]** como workflow con el sha de entrada. Requiere migraciones aditivas.
- **Migraciones [hoy]:** `prisma migrate deploy` corre en el entrypoint de la app en cada arranque. Nunca se edita una migración aplicada.
- **Traer una versión nueva del base:**
  ```
  git fetch upstream --tags
  git merge <tag>        # o: git cherry-pick <sha-del-arreglo>
  ```
  Si hay conflicto es porque el clon divergió: se adapta a mano.
- **Llevar un módulo de una instancia a otra [a construir]:** `scripts/module.sh export|import <Modulo>` con `git apply --3way`.

## 4. Servicios de una instancia

| Servicio            | Función                                                                                                                                            | Estado                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `caddy`             | Entrada, TLS y rutas                                                                                                                               | [hoy]                                                                         |
| `app` (Next)        | Web, server actions, archivos y endpoints de jobs                                                                                                  | [hoy]                                                                         |
| `api`               | `/api/mobile/v1` (misma imagen, otro proceso)                                                                                                      | [a construir]                                                                 |
| `worker`            | Jobs programados; con la app, outbox y push                                                                                                        | [hoy como `cron`]                                                             |
| `sync`              | Datos offline de la app                                                                                                                            | [a construir, opcional]                                                       |
| `postgres`          | Datos, historial por triggers, sesiones, outbox                                                                                                    | [hoy]                                                                         |
| `storage` (RustFS)  | Archivos y fotos (buckets privados; los crea `ensure-buckets` al arrancar la app)                                                                  | [hoy; reemplaza a MinIO]                                                      |
| `redis`             | Límite de intentos compartido, colas, avisos en vivo                                                                                               | [opcional; no se usa hoy]                                                     |
| backup              | `pg_dump` + copia del bucket fuera de la VPS                                                                                                       | [a construir]                                                                 |
| agente de monitoreo | `alphataco-agent`: reporta CPU, RAM, disco y contenedores a TaskApp. **Va por defecto en toda instancia nueva** (decisión del usuario, 2026-10-22) | [hoy a mano en la VPS de Dokploy; a automatizar en `new.sh` y el alta remota] |

Diagrama: `diagramas/mapa-instancia.html` y `diagramas/arquitectura-instancias.html`.

## 5. Ficha de instancia (propuesta de formato; ejemplo en `instance.example.yml`)

```yaml
cliente: acme
base: v1.4.1
dominio: gestion.acme.com
modulos: [operaciones, mantenimiento, almacenes, documentacion]
mobile:
  enabled: true # false: sin api ni sync
  offline: true # false: solo online
  push: true
vps: { cpu: 4, ram_gb: 8 }
backups: diario
```

Gobierna el compose (perfil `mobile`), las variables, los workflows y la suite e2e. Los secretos no van en la ficha.

## 6. Checklist de un cliente nuevo

- [ ] Repo creado con historia y `upstream`
- [ ] `instance.yml` completa
- [ ] Secretos y variables cargados (GitHub y Dokploy)
- [ ] VPS, Dokploy y DNS listos
- [ ] Primer deploy sano (`/api/health` con el sha esperado)
- [ ] Empresa, módulos y roles sembrados; `RUN_SEED=false`
- [ ] Primer administrador creado
- [ ] Buckets creados
- [ ] Jobs programados y backup con restauración probada
- [ ] App móvil: instancia registrada (si corresponde)
- [ ] Versión del base anotada para el calendario de actualizaciones

## 7. CI

Todos los workflows (`ci.yml`, `deploy.yml`, `_build-image.yml`, `_e2e.yml`) corren en `${{ vars.CI_RUNNER || 'ubuntu-latest' }}`. **El servicio externo es Blacksmith** (el mismo que usa Ecokit): runners más rápidos para GitHub Actions, con builder persistente y caché. Se activa cargando la variable de repo `CI_RUNNER` (por ejemplo `blacksmith-2vcpu-ubuntu-2404`; vacía = runner de GitHub). **Requiere instalar antes la GitHub App de Blacksmith en la organización** (`app.blacksmith.sh` → Install → repo): sin la app, un label `blacksmith-*` deja el job en cola para siempre. Es un paso manual por cliente (o una vez por organización si todos los repos viven en la misma).

`_e2e.yml` levanta la imagen de producción con su entrypoint y corre Playwright (`e2e/`); cada clon adapta los specs. Referencia de la versión más completa (shards, carril rápido): `ecokit/.github/workflows/_e2e.yml`.
