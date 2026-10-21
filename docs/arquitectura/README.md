# Arquitectura de instancias y app mobile

> Aprobada el 2026-10-21. Esta carpeta es la fuente de verdad para quien retome el trabajo (persona o sesión nueva de Claude).

## Por dónde empezar

1. **`LOOP-ESTADO.md`**: qué se hizo, qué está en curso, qué sigue y qué hay que decidir. Se lee primero y se actualiza al final de cada iteración.
2. **`MODELO-DE-TRABAJO.md`**: cómo se trabaja (Opus decide y revisa, Sonnet implementa), qué no se hace sin permiso y cómo se cuida la VPS.
3. **`REGLAS-DE-NEGOCIO.md`**: el modelo de negocio, las reglas del producto y del parte diario, y las decisiones aceptadas y abiertas.
4. **`RUNBOOK-NUEVA-INSTANCIA.md`**: cómo crear, desplegar, actualizar y volver atrás una instancia de cliente.
5. **`PROPUESTA-ACEPTADA.md`**: la propuesta completa con el razonamiento (arquitectura, operación, plan por etapas, riesgos). **`AUDITORIA-SERVER-ACTIONS.md`**: Server Actions de escritura sin guarda de permisos reconocible (candidatos a revisar).
6. **`diagramas/`**: `arquitectura-instancias.html` y `mapa-instancia.html` (abrir en el navegador; usan tipografías de Google Fonts).
7. `referencia-propuesta-original-colega.md`: la propuesta de la que se partió. Es solo referencia; la vigente es `PROPUESTA-ACEPTADA.md`.

## En una frase

Un repo y una VPS por cliente (se clona el base), lógica en casos de uso por módulo que usan todos los canales, API de la app móvil como otro proceso de la misma imagen, app móvil incluida por defecto y apagable por cliente, y una fábrica de instancias que deja un cliente nuevo funcionando en cerca de una hora.

## Glosario

| Término | Significado |
|---|---|
| Base | Este repo (`alphataco`). Los clientes lo clonan |
| Instancia | Un cliente desplegado: su repo, su VPS, su base de datos y su bucket |
| Caso de uso | Función de aplicación `(contexto, comando) → resultado` que autoriza, valida, escribe y emite eventos |
| Contexto | `{ actorId, companyId, permisos }` pasado de forma explícita |
| Ficha de instancia | `instance.yml`: configuración declarativa de un cliente |
| Outbox | Tabla de eventos que un worker procesa para push e integraciones |
| `commandId` | Identificador de idempotencia de un comando enviado por la app |
| `baseVersion` | Versión de la fila que el usuario veía al editar (detecta conflictos) |
