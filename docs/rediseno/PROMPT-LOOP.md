# Prompts del loop de rediseño

Rama con el trabajo: **`feat/rediseno-alphataco`** (parte de `origin/main` f23dbcbb; contiene todo lo hecho hasta el corte de `ESTADO.md`).

## A) Prompt de arranque para una sesión NUEVA (pegar tal cual)

```
Trabajás en el repo alphataco_1.0.0 (Next 16, React 19, Prisma, Postgres; fork de GH Gestión, que está en ../gh_gestion).
Primero: git fetch && git checkout feat/rediseno-alphataco && git pull.

OBJETIVO: rediseñar y estandarizar TODO el sistema para venderlo como un producto único: quien ya usa GH no debe poder darse cuenta
de que alphataco es un clon. Se rediseña desde cero la UI y su estructura (navegación, tabs, composición de páginas, modales, fichas,
paneles; las tablas de datos se mantienen), y en el proceso se analiza y refactoriza el código de cada cosa (más eficiente, ordenado,
reutilizado, componentizado, sin código muerto ni duplicado). Debe ser responsive (390/768/1280). No es cambiar colores ni un mini
rediseño. No se cambian reglas de negocio. Se trabaja módulo por módulo, vista por vista, page por page, modal por modal, casi
componente por componente, comparando cada page de alphataco con su equivalente en ../gh_gestion.

LEÉ EN ORDEN antes de actuar: docs/rediseno/README.md, docs/rediseno/MODELO-DE-TRABAJO.md, docs/rediseno/ESTADO.md,
.claude/commands/dev.md, .claude/commands/rediseno.md y CLAUDE.md. Este entorno no tiene mi skill /dev ni mis reglas globales:
están copiadas en el repo (.claude/commands/, .claude/skills/, docs/rediseno/). Superpowers está prohibido: usá /dev.

REGLAS ABSOLUTAS: español siempre y conciso; no commitear ni pushear sin que yo lo pida (entonces: rama nueva desde origin/main,
commit de UNA línea, SIN ninguna referencia a IA/Claude/Co-Authored-By, PR a main; el merge lo hago yo); sin tests nuevos hasta que
yo lo diga; sin lint/prettier; sin migraciones fuera de alphataco_test; sin editar permissions-map.ts sin mi OK (reportá lo que falte);
máximo 3 agentes en paralelo y un solo tsc a la vez (la máquina tiene ~12 GB); verificá con tsc + next build + navegador
(agent-browser, :3100, base alphataco_test) antes de dar algo por hecho.

AUTONOMÍA (importante): varias funcionalidades tienen lógica ineficiente o mejorable (consultas N+1, agregaciones en Node,
cálculos duplicados, código copiado entre módulos): cuando la encuentres, MEJORALA DIRECTO sin preguntarme, manteniendo el resultado
observable (verificá equivalencia). Los flujos actuales (p. ej. todo Mantenimiento) están muy personalizados a como GH los quería, y
lo mismo el resto del sistema: está permitido y buscado ESTANDARIZAR y SIMPLIFICAR para que sea más fácil de usar (menos pasos, menos
modales, mejores defaults, nombres consistentes), sin romper las reglas de negocio ni perder datos ni permisos. Lo único que me
consultás: migraciones/permisos nuevos (permissions-map.ts) y cambios que alteren cifras, importes o quién puede hacer qué.

HERRAMIENTAS (verificá qué hay antes de empezar; lo que ya esté en el repo no se reinstala): ver docs/rediseno/PROMPT-LOOP.md §C
(feature-dev, ui-skills, CodeGraph, agent-browser, Postgres y qué hacer si no hay Postgres).

EJECUCIÓN: corré /loop /rediseno (autoritmo). Cada iteración: tomar el siguiente pendiente de docs/rediseno/ESTADO.md, auditar
contra GH, ejecutar paquetes con agentes, verificar, revisar con un revisor independiente, actualizar ESTADO.md y reportarme.
Frená el loop cuando ESTADO.md marque todo "Hecho y certificado" con brecha 🟢 y hayas hecho el cierre global; ahí me das el
reporte final (hecho, sin verificar, decisiones mías pendientes, cambios visibles). Empezá por el hallazgo clave de ESTADO.md:
las pantallas que todavía usan las tabs horizontales de GH y la comparación sistemática contra ../gh_gestion.
```

## B) Prompt del loop (el que se re-arma en cada tick)

```
/loop /rediseno
```

El comando `/rediseno` (`.claude/commands/rediseno.md`) contiene el algoritmo completo de una iteración. Si el entorno no soporta
comandos del repo, pegar su contenido como prompt del loop.

## C) Requisitos del nuevo entorno, instalación y fallbacks

### C.1 Qué ya viene en el repo (no hace falta instalar)

- `.claude/commands/dev.md` (`/dev`) y `.claude/commands/rediseno.md` (`/rediseno`), `.claude/agents/*` (incluido `table-expert`),
  `.claude/skills/{vercel-react-best-practices,agent-browser,chrome-devtools,new-datatable,excalidraw-skill}`, `.claude/rules/*`,
  `docs/rediseno/*` (incluidas guías de `ui-skills` y CodeGraph en `referencias/`).
- Verificación rápida al empezar: `ls .claude/commands .claude/skills .claude/agents` y `ls docs/rediseno`.

### C.2 Lo que puede faltar y cómo instalarlo

| Herramienta                                                                                                    | Para qué                                                            | Cómo instalar / comprobar                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **feature-dev** (agentes `feature-dev:code-architect`, `code-explorer`, `code-reviewer`; es la base de `/dev`) | Auditar (Opus), explorar y revisar                                  | Plugin oficial de Claude Code: `/plugin install feature-dev@claude-plugins-official` (o `/plugin` → marketplace `claude-plugins-official` → _feature-dev_). Comprobar: que existan los tipos de agente `feature-dev:*`. **Si no se puede instalar**, `.claude/agents/code-architect.md` y `.claude/agents/staff-reviewer.md` del repo + `general-purpose` cubren el rol (usar `/dev` igual).                     |
| **skills.sh** (CLI de skills: `npx skills ...`)                                                                | Buscar/instalar skills de la comunidad                              | `npx skills find [query]` (buscar), `npx skills add <owner/repo>` (ej. `npx skills add vercel-labs/agent-skills`), `npx skills list`, `npx skills update`. `find-skills` es `vercel-labs/skills`. Si `feature-dev` aparece en el buscador (`npx skills find feature-dev`) se puede instalar por ahí, pero la vía oficial es el plugin de arriba.                                                                 |
| **ui-skills** (catálogo de skills de diseño/UX/a11y: https://www.ui-skills.com/)                               | Reglas de diseño, accesibilidad, motion, tipografía, color, estados | **MCP**: `claude mcp add --transport http ui-skills https://www.ui-skills.com/mcp` (endpoint `https://www.ui-skills.com/mcp`; herramientas `list_skills` —siempre con `query`— y `get_skill`). **CLI**: `npx ui-skills`. Docs: `https://www.ui-skills.com/mcp/docs` y `/cli`. Guía de uso y gotchas de slugs: `docs/rediseno/referencias/ui-skills.md`. Opcional: si no está, aplicar `MODELO-DE-TRABAJO.md §5`. |
| **vercel-react-best-practices**                                                                                | Performance React/Next                                              | Ya está en `.claude/skills/`. Leer solo `rules/<slug>.md`.                                                                                                                                                                                                                                                                                                                                                       |
| **CodeGraph**                                                                                                  | Búsqueda semántica de código (primera herramienta para explorar)    | `codegraph init -i` en la raíz (guía en `docs/rediseno/referencias/codegraph.md`). Sin índice: usar LSP/grep.                                                                                                                                                                                                                                                                                                    |
| **agent-browser / Chrome MCP**                                                                                 | Verificación en navegador                                           | Skill `agent-browser` ya en el repo (requiere el CLI `agent-browser`); alternativa: MCP de Chrome/`chrome-devtools`.                                                                                                                                                                                                                                                                                             |

### C.3 Entorno de ejecución

- Repo `alphataco_1.0.0` en la rama `feat/rediseno-alphataco` y, **hermano**, `../gh_gestion` (para comparar). Si no está, clonarlo
  (`fspiritosi/gh_gestion`) o comparar contra los patrones GH listados en `README.md`.
- `npm install` y `npx prisma generate` (el build lo necesita).
- Server de pruebas: `npx next dev --webpack -p 3100` con `DATABASE_URL`/`DIRECT_URL` a la base de pruebas. Login de pruebas (datos demo):
  `administrador@patagonia-demo.com.ar` / `AlphaDemo2026!`.
- Tipos: `tsc` con tsconfig temporal (ver `MODELO-DE-TRABAJO.md §2`); `npm run check-types` es el equivalente corto.

### C.4 Postgres: opciones, de mejor a peor

1. **Docker disponible**: `bash scripts/dev-up.sh` (crea `.env.docker` desde `.env.docker.example`: completar contraseñas; levanta `postgres` y `minio`),
   luego `set -a; source .env.docker; set +a; export DATABASE_URL=postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco_test`
   (crear la base: `docker compose --env-file .env.docker exec -T postgres createdb -U alphataco alphataco_test`),
   `npm run db:deploy` (aplica migraciones), `npm run db:seed` (empresa/módulos/roles) y `npm run demo:reset` (datos demo "Patagonia"; ver `scripts/demo/`).
   Poner `ARCA_MODE=mock` en el `.env` (facturación simulada sin certificado).
2. **Sin Docker pero con permisos de instalación**: instalar PostgreSQL 16 local (`apt install postgresql` / `brew install postgresql@16`),
   crear usuario y base `alphataco_test`, apuntar `DATABASE_URL`/`DIRECT_URL` ahí y seguir con `db:deploy` + `db:seed` + `demo:reset`.
   Extensión necesaria: `pgcrypto`. El storage (MinIO) es opcional: sin él fallan solo subidas de archivos.
3. **Postgres administrado/remoto de prueba** (Neon, Supabase, contenedor ajeno): mismo procedimiento con su `DATABASE_URL`. NUNCA producción.
4. **Sin ninguna base**: se trabaja en **modo estático** y se dice explícitamente: verificar con `tsc` + `next build` (el build no necesita
   datos), revisar por lectura y comparar con GH por código; en `ESTADO.md` marcar cada pantalla como "🟡 sin verificar en navegador" y
   **no** declarar "Hecho y certificado". Dejar la pasada de navegador (1280/390 px, QR anónimo, caso sin permiso) como pendiente
   para cuando haya base, y avisarme.
