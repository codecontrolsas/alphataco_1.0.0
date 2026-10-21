# Modelo de trabajo

## Roles

- **Opus es el desarrollador senior.** Planifica, analiza las decisiones, revisa el resultado y responde toda duda de diseño.
- **Sonnet es el semi senior.** Implementa, prueba y documenta lo que Opus planificó.
- **Regla:** ante una duda, una decisión o algo que no esté claro, **se le pregunta a Opus** antes de seguir. No se improvisa una decisión de diseño.

### Cómo se consulta a Opus

1. **Herramienta `advisor`** (sin parámetros): revisa toda la conversación. Se llama antes de empezar trabajo sustancial, al creer que una tarea terminó, al trabarse y al cambiar de enfoque.
2. **Un agente Opus** (`Agent` con `model: "opus"`) para el diseño de cada tarea y otro para su revisión final. Si ya existe uno con el contexto cargado, se le escribe con `SendMessage` en lugar de crear otro.
3. **Un agente por fase como máximo** (diseño, revisión). Nada de varios en paralelo para algo que resuelve CodeGraph, LSP o grep.

## Flujo de cada tarea (`/dev`)

1. Entender el código: CodeGraph primero (`codegraph explore "..."`), después lectura directa.
2. **Diseño con Opus:** qué archivos, qué contratos, qué riesgos. Se anota en `LOOP-ESTADO.md`.
3. **Implementar** una pieza por vez y verificarla a mano: `npm run check-types`, lint, y probar el comportamiento real.
4. **Tests:** se escriben después de que la pieza funciona y está verificada. Por pedido explícito del usuario del 2026-10-21 se arman durante el trabajo nocturno, siempre después de implementar y verificar, nunca antes.
5. **Revisión con Opus** del conjunto de cambios de la tarea.
6. Actualizar `LOOP-ESTADO.md` y pasar a la siguiente.

Si el cambio toca React/Next o interfaz, se aplican la skill `vercel-react-best-practices` y el MCP `ui-skills` con el protocolo ahorrativo del CLAUDE.md global.

## Lo que NO se hace sin permiso explícito del usuario

- **Commits, push, merge y creación de PR.** El trabajo queda sin commitear en el worktree. Cuando el usuario diga "subí" se sigue el flujo: rama nueva, commit sin referencias a IA, PR y merge.
- **Deploy a producción o a la VPS de trabajo (Dokploy `31.97.42.82`).** Un push a `main` dispara el webhook de producción.
- **Crear repos de GitHub, instalar apps de GitHub o cambiar permisos o credenciales.**
- **Tocar el bot de Farm Merge (`fm-bot`), la sesión tmux, Chrome en el puerto 9222 y el monitor de la VPS.**
- Operaciones destructivas (borrar volúmenes, `git reset --hard`, `docker system prune`).
- Imprimir o copiar secretos, tokens o contraseñas en documentos o logs.

## Entorno

- El trabajo se hace en un **worktree aislado**: `/home/yordan/workspace/codecontrol/alphataco-arq`, rama local `feat/arquitectura-instancias` (sin upstream, para evitar un push accidental). No se trabaja en el checkout `alphataco_1.0.0` porque otras sesiones lo usan.
- **"Deploy" en el trabajo automático = `docker compose` en esta VPS (`vps-yordan`)**, con puertos y proyecto de compose propios. Nada de Dokploy.
- **Recursos** al 2026-10-21: ~12 GB de RAM (unos 5 GB libres) y 43 GB de disco libres. Un `next build` puede pedir 3 a 4 GB. Antes de un build pesado se revisa `free -m`. Los contenedores levantados se registran en `LOOP-ESTADO.md` y se bajan al terminar la tarea (sin `-v`).
- El idioma de comunicación y documentación es **español**.
- Se escribe en el repo y en `/home/yordan/...`. El directorio temporal de la sesión (`/tmp`) es efímero.

## El loop de trabajo

- Usa `/loop` dinámico: cada iteración lee `LOOP-ESTADO.md`, hace la siguiente tarea del backlog, actualiza el archivo y agenda la próxima con `ScheduleWakeup` (1200 s o más si espera algo externo; se usan builds en segundo plano).
- Si la sesión se queda sin tokens o se interrumpe, **retoma desde `LOOP-ESTADO.md`**: ahí está el estado, el último paso y lo pendiente.
- Si una tarea requiere una decisión de negocio o un permiso que no se tiene, se anota en `LOOP-ESTADO.md` ("Decisiones pendientes") y se pasa a la siguiente tarea. No se espera ni se inventa.
- Fuera de alcance de la noche: API móvil, worker de push, app Expo y motor de sync (dependen de decisiones abiertas).

## Reglas del repo que el trabajo respeta

Resumen de `CLAUDE.md` y `.claude/rules/` (ahí está el detalle):

- **Verificación:** solo `npm run check-types`. **Prohibido** `npm run lint`, `npm run format`, `prettier` y `eslint`: tocan cientos de archivos ajenos.
- **Código en inglés**; comentarios y textos de interfaz en español.
- **Prisma** para datos (nada de Supabase). **Migraciones** como carpeta manual `prisma/migrations/<timestamp>_<nombre>/migration.sql` + `npm run db:deploy`; nunca `prisma migrate dev`; nunca regenerar `0_init`. Los cambios de funciones o triggers se duplican en `prisma/sql/<dominio>.sql`.
- **Logger** (`@/lib/logger`) en lugar de `console.*`.
- **Server actions** en `features/`, no rutas API (excepción documentada: streaming y webhooks).
- **Fechas** con `moment`; "hoy" siempre en hora argentina (`argentinaDate()`).
- **Conventional commits de una sola línea**, sin cuerpo y sin atribución a herramientas, **solo cuando el usuario lo pide**.
- **Tests:** el repo exige esperar el OK del usuario. El 2026-10-21 el usuario pidió explícitamente armarlos durante el trabajo nocturno; rige ese pedido, siempre después de implementar y verificar a mano.
- Toda pantalla nueva o cambiada se prueba también a 390 px y en claro y oscuro; los estados de carga, vacío y error se cubren.

## Cómo se publica cuando el usuario lo pide

Subir y desplegar **solo ocurre cuando el usuario lo pide en esa sesión** (como el 2026-10-21 con el programa 2 de `LOOP-ESTADO.md`). Cuando lo pide, se hace así:

- **Rama y PR:** rama nueva desde `origin/main` (este repo no tiene `dev`), commit de una sola línea en formato conventional commit sin atribución a herramientas, `git push -u`, `gh pr create --base main`, esperar el CI en verde y `gh pr merge --merge --delete-branch`. Nunca push directo a `main`, nunca `--force`, nunca saltear el CI.
- **PR chicos e independientes** (uno por tema o por lote de tablas o módulos), de modo que `main` siempre sea desplegable.
- **Despliegue controlado:** el merge a `main` dispara `deploy.yml`. Después de cada merge se mira el run (`gh run watch`), se comprueba que `/api/health` devuelva el `sha` esperado y `"storage":"ok"`, y se hace una prueba de humo. Si falla, rollback inmediato (volver el tag `:main` al `sha` anterior, ver `docs/deploy/runbook.md`) y recién después se investiga.
- **Migraciones de base de datos:** se prueban antes contra un Postgres descartable con las migraciones completas, el seed y datos de **dos empresas** (sirven los scripts de `scripts/demo`). Las de RLS van por fases y detrás de un interruptor, nunca en un solo paso.
- **Blacksmith:** `CI_RUNNER` se carga como variable de repo solo después de comprobar que un job arranca en pocos minutos; si queda en cola, se borra.
- **El repo es público:** no se suben listas de vulnerabilidades sin corregir (por eso `AUDITORIA-SERVER-ACTIONS.md` no se publica hasta resolver sus ítems), credenciales, avisos de seguridad de otros repos ni documentos internos de terceros (`referencia-propuesta-original-colega.md`).
- Sigue sin hacerse nunca: tocar otros repos o VPS, cambiar credenciales o secretos de producción, escribir en la base de producción fuera de las migraciones, imprimir secretos, correr `npm run lint` o `format`.
