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

## C) Requisitos del nuevo entorno

- Repo `alphataco_1.0.0` en la rama `feat/rediseno-alphataco` y, **hermano**, `../gh_gestion` (para comparar). Si no está, clonarlo
  (`fspiritosi/gh_gestion`) o comparar contra los patrones GH listados en `README.md`.
- `npm install`; Postgres de pruebas: `bash scripts/dev-up.sh` (compose) y base `alphataco_test`; `.env` con `DATABASE_URL`.
- Server de pruebas: `npx next dev --webpack -p 3100` con `DATABASE_URL`/`DIRECT_URL` a `alphataco_test`. Login de pruebas:
  `administrador@patagonia-demo.com.ar` / `AlphaDemo2026!`.
- Navegador: skill `agent-browser` (copiada en `.claude/skills/agent-browser/`) o el MCP de Chrome.
- Opcional: MCP `ui-skills` (`claude mcp add --transport http ui-skills https://www.ui-skills.com/mcp`) y CodeGraph (`codegraph init -i`).
- Tipos: `tsc` con tsconfig temporal (ver `MODELO-DE-TRABAJO.md §2`); `npm run check-types` es el equivalente corto.
