# Reglas de negocio y decisiones

Lo marcado **[verificado]** se comprobó en el código el 2026-10-21. Lo marcado **[acordado]** lo definió el equipo. Lo marcado **[abierto]** espera una decisión.

## 1. Modelo de negocio [acordado]

- Alphataco se vende a muchas empresas. Por cada cliente se **clona el base**: repo propio, VPS propia, base de datos propia y bucket propio. N repos, N VPS.
- Cada cliente puede pedir **cualquier cambio en cualquier parte** (flujos, validaciones, permisos, módulos nuevos o eliminados, pantallas). Los cambios se realizan.
- Los **módulos externos y desarrollos a medida se cobran aparte** (decisión comercial del equipo; no la toma el desarrollo).
- **La divergencia entre clones es aceptada.** Si hay un arreglo del base, se adapta a mano según cuánto haya divergido ese clon.
- Cada clon arranca con **los mismos tests** del base y los adapta a su proyecto.
- Los **datos de cada cliente nunca salen de su VPS**.
- Hay que poder **dar de alta una instancia nueva rápido** y **llevar un módulo** de una instancia al base o a otra.

## 2. App mobile [acordado]

- Va **incluida por defecto** en el paquete y se puede **apagar para un cliente** (`mobile.enabled: false`): no se levantan `api`, outbox/push ni `sync`.
- **Offline es necesario.** **Push es indispensable.**
- **Una app genérica** en App Store y Google Play que se conecta al servidor de cada empresa (código de empresa o QR). La **marca blanca** (app propia del cliente) es un fork del repo móvil y es opcional.
- Repo móvil **único** y separado del repo web. Contratos por OpenAPI generados desde los esquemas Zod.
- `/api/mobile/v1` queda **congelado**: solo cambios compatibles. Lo propio de un cliente va en otra ruta o por configuración del servidor. Un endpoint `/capabilities` informa versión y módulos habilitados.
- El **servidor siempre manda** en los conflictos de sincronización. Los rechazos llegan por push con el motivo.

## 3. Reglas técnicas invariantes

| Regla | Detalle | Estado |
|---|---|---|
| Aislamiento entre empresas | Hoy lo da `withCompany()` en cada consulta (`src/shared/lib/prisma-tenant.ts`). **No hay políticas RLS en las migraciones** | [verificado] |
| RLS | Se quiere mantener como segunda barrera y es requisito si el motor de sync lee la base | [acordado] |
| Archivos `'use server'` | Todo lo exportado es una Server Action y debe ser `async`. No exportar helpers que reciban una transacción | [verificado] |
| Migraciones | Nunca editar una ya aplicada (rompe el checksum). `0_init` no se regenera. Cambios aditivos para poder volver atrás | [verificado: `.claude/rules/migrations.md`] |
| Funciones y triggers SQL | Un `CREATE OR REPLACE FUNCTION` del base puede pisar una personalización sin conflicto de git. Hace falta una regla de propiedad antes del primer clon | [abierto] |
| Tablas del núcleo | Lo que agregue un cliente va en tablas laterales o JSONB, no en `ALTER` del base, salvo excepción registrada | [acordado] |
| Permisos | Claves `modulo:tab:accion`. Se mantienen; no se migra a "capacidades" | [acordado] |
| Orden de un caso de uso | Autorizar → validar empresa → validar reglas de estado → escribir en transacción con el actor → emitir evento | [acordado] |
| Contexto | Se pasa de forma explícita; hoy el usuario sale de `next/headers` y la empresa de una cookie | [verificado] |
| Fechas | "Hoy" es el día argentino comparado como string `YYYY-MM-DD` (`argentinaDate()`) | [verificado] |

## 4. Parte diario: reglas vigentes de las líneas [verificado]

Fuente: `src/features/Operaciones/PartesDiarios/detail/lib/row-permissions.ts` (réplica literal de la UI) y `detail/mutations.server.ts`. Hoy estas reglas **solo** se aplican en la interfaz; las mutaciones del servidor únicamente controlan la empresa.

| Acción | Condición |
|---|---|
| Crear línea | permiso `update` **y** (parte `abierto` **o** el parte es de hoy) |
| Editar línea | permiso `update` **y** estado distinto de `en_certificacion` **y** (estado distinto de `ejecutado` **o** el parte es de hoy) |
| Asignar recursos | permiso `assign_resources` **y** la misma elegibilidad que editar |
| Eliminar línea | permiso `delete` **y** (el parte es de hoy **o** futuro **o** el estado es `sin_recursos_asignados`) |

- **Estados:** `pendiente`, `sin_recursos_asignados`, `ejecutado`, `reprogramado`, `cancelado`, `en_certificacion`.
- **Estado inicial al escribir** (`resolveRowStatus`): si el estado enviado es terminal (`ejecutado`, `cancelado`, `reprogramado`, `en_certificacion`) se respeta; si no, parte de `pendiente` (con recursos) o `sin_recursos_asignados`. El definitivo lo fija `reconcileRowResourceStatus` (fórmula única en SQL).
- **Asignar recursos hoy reescribe todo:** la edición borra las tres relaciones (empleados, equipos, equipos de clientes) y las vuelve a crear. El historial se escribe por trigger, así que agregar un recurso a una línea con 10 registra 10 bajas y 11 altas.
- **Diferencia a decidir:** la UI exige el permiso `update` para crear, pero la propuesta mapea CU-1 a `operaciones:detalle-parte-diario:create`. **La corrección de seguridad replica exactamente la UI actual** (no cambia el comportamiento) y deja la diferencia como decisión abierta.

## 5. Decisiones aceptadas

1. Capa de casos de uso por módulo, usada por la web (en proceso), la API móvil, la API externa y los jobs.
2. API móvil como **proceso aparte de la misma imagen** (`app` y `api`), enrutado por Caddy. Versiones en lockstep.
3. Extracción **incremental** de casos de uso: solo los flujos que consume la app y los módulos nuevos.
4. Repo y VPS por cliente; **copia con historia común** (mirror con `upstream`), no repo plantilla.
5. Workflows reutilizables alojados en el base y fijados a una versión.
6. Ficha `instance.yml` por cliente, sin secretos.
7. Piloto: **partes diarios** (CU-1 crear línea, CU-2 asignar o quitar recursos, CU-3 cambiar estado), con altas y bajas explícitas, `commandId` y `baseVersion`.
8. Los tests se escriben **después de implementar y verificar a mano**, nunca antes (TDD no).

## 6. Decisiones abiertas

| # | Decisión | Quién |
|---|---|---|
| 1 | Perímetro del supervisor en el dispositivo: por cliente, sector, diagrama o todo el parte | Negocio (Operaciones) |
| 2 | Tolerancia N en horas para crear líneas en un parte cerrado mientras el teléfono estaba offline | Negocio |
| 3 | Recursos inválidos dentro de un comando: aplicación parcial o todo o nada (sugerido: todo o nada) | Negocio |
| 4 | Tabla de transiciones de estado válidas (hoy la edición masiva acepta cualquier estado) | Negocio |
| 5 | Destinatarios del push de línea creada y línea cancelada | Negocio |
| 6 | Lectura offline: delta propio (`change_log`) o PowerSync / ElectricSQL | Técnica, con prueba de concepto |
| 7 | Token de Expo en cada VPS o relay central de push | Técnica |
| 8 | Alojamiento de workflows reutilizables y del registro de imágenes (acceso entre repos y cuota) | Técnica |
| 9 | Políticas RLS como segunda barrera | Técnica |
| 10 | Regla de propiedad de funciones y triggers SQL antes del primer clon | Técnica |
| 11 | Diferencia `create` / `update` en el parte diario (sección 4) | Negocio |
| 12 | Edición masiva del parte diario: ¿debe respetar `en_certificacion` y "ejecutado salvo hoy" por fila? Hoy el modal no lo hace | Negocio |
| 13 | Migración de la instancia en producción de MinIO a RustFS (el código y el compose ya usan RustFS; procedimiento probado en `docs/deploy/runbook.md`). ¿Cuándo? | Técnica |
