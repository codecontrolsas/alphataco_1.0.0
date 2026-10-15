---
description: Una iteración del loop de rediseño de alphataco (anti-clon de GH + refactor + responsive). Usar con /loop /rediseno
argument-hint: Módulo opcional (si se omite, toma el siguiente pendiente de ESTADO.md)
---

# `/rediseno` — una iteración del loop de rediseño

Argumento opcional: $ARGUMENTS

**Antes de hacer nada, leer en este orden:** `docs/rediseno/README.md` (objetivo y criterio de aceptación),
`docs/rediseno/MODELO-DE-TRABAJO.md` (reglas, agentes, verificación, patrones, trampas), `docs/rediseno/ESTADO.md` (qué falta),
`.claude/commands/dev.md` (fases). Responder SIEMPRE en español y conciso.

## Objetivo en una frase

Que alguien que usa GH (`../gh_gestion`) vea alphataco y **no reconozca el clon**: navegación, tabs, composición de páginas, modales,
fichas y paneles rediseñados desde cero (las tablas se mantienen), con el código de cada cosa **refactorizado, componentizado y sin
muertos**, **responsive** y **sin cambiar flujos de negocio**. No es un cambio de colores ni un mini rediseño.

## Algoritmo de UNA iteración

1. **Elegir el trabajo.** Si hay argumento, ese módulo. Si no, el primer ítem de `ESTADO.md` con brecha 🔴/🟡 o "Pendiente". Si no
   queda nada pendiente ni decisión abierta → ir a _Cierre_ (paso 8).
2. **Auditar contra GH (solo lectura, `code-architect` Opus; omitir si ya existe blueprint en `docs/rediseno/referencias/` o
   en `ESTADO.md` para ese módulo).** Por cada page/vista/modal/componente del módulo:
   - Localizar su equivalente en `../gh_gestion/src/app/dashboard/**` y `../gh_gestion/src/features/**` (CodeGraph/grep; si `../gh_gestion`
     no existe, comparar contra los patrones GH listados en `README.md`).
   - Clasificar: **idéntica / parecida / distinta** (criterio de `README.md`). Lo "idéntica" o "parecida" entra al backlog de rediseño.
   - Auditar el código: bugs, N+1, waterfalls, permisos faltantes, fechas fuera de hora argentina, colores fijos, duplicados,
     código muerto, archivos > 600 líneas, `BaseDataTable`/cookies, a11y, responsive.
   - Entregar paquetes P0..Pn (archivos disjuntos, qué reutilizar, verificación) y decisiones del usuario (máx. 3, con recomendación).
3. **Ejecutar paquetes** con agentes Sonnet (`general-purpose`; **`table-expert`** si hay DataTables), **máx. 3 en paralelo**, archivos
   disjuntos, un `tsc` a la vez. Cada prompt incluye lo ya hecho, reglas, archivos prohibidos y qué devolver. Sin tests nuevos.
   Orden típico: P0 permisos/seguridad → P1 base compartida → estructura/navegación → tablas → fichas/paneles → formularios → partir archivos grandes.
4. **Rediseño estructural obligatorio** (no solo estilo): reemplazar tabs horizontales por `SectionManagerServer` + `sectionNav`;
   cabeceras `RecordHeader`; bandas de atención + tarjetas de métricas; detalle en `Sheet`; formularios en secciones (sin modal
   sobre modal); estados con `StatusUi`; `StateBlock` para vacío/error/sin permiso; rótulos y orden de secciones propios de alphataco.
5. **Responsive**: verificar 390 / 768 / 1280 px (`scrollWidth > clientWidth` falso), tablas con columnas ocultas/`mobileCards`,
   formulario+tabla apilados bajo `lg`, acciones con `flex-wrap`.
6. **Verificar** el módulo: `tsc` completo (8 GB) + `next build` + navegador (carga, filas, desborde, caso negativo de permisos,
   flujos reales de formularios). Reiniciar el server de pruebas tras `next build`.
7. **Revisión independiente** (`code-reviewer`) del módulo cerrado y aplicar hallazgos de confianza alta. Luego **actualizar
   `docs/rediseno/ESTADO.md`** (tabla, hecho/pendiente, decisiones abiertas) y, si el aprendizaje es nuevo, `MODELO-DE-TRABAJO.md §8`.
8. **Cierre global** (cuando todos los módulos están "Hecho y certificado" con brecha 🟢): `tsc` + `next build` completos, pasada
   de navegador por TODOS los módulos y viewports, dos revisiones independientes, actualizar "Learned Corrections" del `CLAUDE.md`,
   reporte final al usuario y **detener el loop** (`ScheduleWakeup stop:true`).

## Reglas duras (resumen; ver MODELO-DE-TRABAJO.md)

- NO commitear/pushear salvo pedido explícito del usuario (entonces: rama nueva desde `origin/main`, commit de UNA línea, sin
  atribución a IA, PR a `main`; el merge lo hace el usuario).
- NO tests nuevos, NO lint/format/prettier, NO migraciones fuera de `alphataco_test`, NO editar `permissions-map.ts` sin OK
  (se reporta lo que falta).
- NO cambiar reglas de negocio. Lo dudoso → decisión del usuario en `ESTADO.md`, no se resuelve en silencio.
- Reportar al usuario, al cerrar cada iteración: qué se hizo, qué quedó sin verificar, decisiones que necesita y cambios visibles.

## Salida de cada iteración

Reporte corto en español: módulo/paquetes cerrados, verificación hecha (y la que falta), decisiones abiertas, siguiente ítem.
