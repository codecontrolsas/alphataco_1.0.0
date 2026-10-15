# Estado del rediseño

> Se actualiza al cerrar cada iteración del loop. Fecha de este corte: **2026-10-15 (iteraciones 1 y 2 cerradas: Dashboard/header/navegación y Configuración/ABM en Sheet)**. Rama de trabajo: ver `PROMPT-LOOP.md`.
> Última verificación completa de proyecto: `tsc` + `next build` OK **antes** de las últimas tandas de Dashboard, Formularios, Ayuda y
> Configuración (cada agente validó `tsc` acotado). **Hay que correr `tsc` + `next build` completos al retomar.**

## Hallazgo clave para el objetivo real (parecerse o no a GH)

El trabajo hecho hasta acá fue sobre todo **consistencia visual propia + refactor + seguridad + datos**. Todavía **no se hizo la
comparación sistemática pantalla por pantalla contra GH** (`../gh_gestion`). Indicadores objetivos de cuánto queda del "esqueleto GH":

- `TabsManagerServer/Client` (pestañas horizontales de GH): GH lo usa en 37 archivos; alphataco todavía en **~25** (lista abajo).
  `SectionManagerServer` (navegación propia) está en 19.
- Estructuras que delatan el fork y siguen en varias pantallas: Card+título+tabla; `ResizablePanelGroup` formulario+tabla;
  fichas con tabs internas (empleado/equipo); diálogos para detalle.
- Rutas de nivel superior idénticas a GH: `comercial, document, employee, equipment, forms, help, maintenance, operations`
  (alphataco agrega `configuration, purchases, recruitment, treasury, warehouse`). Los **nombres de secciones/rótulos** también se
  parecen: hay que auditarlos contra GH y renombrar/reordenar donde no haya razón de negocio.

### Pantallas que SIGUEN con tabs horizontales de GH (backlog de rediseño estructural)

- ~~Shell del Dashboard~~ (iteración 1: migrado a `ViewManagerServer`). Quedan las de abajo.
- Documentación: `Documentacion/{DocumentosEmpleados,DocumentosEmpresa,DocumentosEquipos,TiposDocumentos}/*TabContent.tsx`, `Documentacion/DetalleDocumento/DocumentDetailSection.tsx`
- Fichas: `Employees/EmpleadoID/components/{employee-document-detail,view/EmployeeReadView}.tsx`, `Employees/Diagrams/{EmployeesDiagram,DiagramDetailEmployeeView}.tsx`, `Equipos/EquipoID/components/{vehicle-tabs,vehicle-operations-history,equipment-document-detail}.tsx`, `Equipos/OtherEquipment/components/OtherEquipmentTabs.tsx`, `Equipos/Equipos/DadosDeBaja/DadosDeBajaTabContent.tsx`
- ~~Configuración~~ (iteración 2: migrada; también Clothing y TiposDocumentos)
- Otros: `Clothing/ClothingCatalogTabContent.tsx`, `Mantenimiento/Gomeria/GomeriaTabContent.tsx`, `Mantenimiento/Pipeline/components/PipelineLayout.tsx` (pasos internos), `app/dashboard/employee/page.tsx`

## Tabla por módulo

Leyenda "Verificado": ✅ navegador 1280+390 · 🟡 `tsc`/`build` sin navegador · ❌ sin verificar. "Brecha vs GH": 🔴 se parece (sin auditar o con estructura GH) · 🟡 parcial · 🟢 distinto.

| Módulo (ruta)                               | Rediseño interno                                                                                                                                                                                                                                                                                                           | Verificado                                                               | Brecha vs GH             | Pendiente                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mantenimiento (`/maintenance`)              | Hecho (pipelines, bandeja, detalle en Sheet, Gomería, desvíos, QR)                                                                                                                                                                                                                                                         | ✅ 1280 (falta 390)                                                      | 🟡                       | Partir `NuevoPedidoChecklistForm` (1162 líneas); Gomería/Pipeline aún con tabs internas                                                                                          |
| Comercial (`/comercial`)                    | Hecho (Clientes, Contratos, Certificaciones, Facturación, talleres)                                                                                                                                                                                                                                                        | ✅                                                                       | 🟡                       | `MensureUnitsTable` (BaseDataTable) + cookies; decisión D-4 unidades de medida                                                                                                   |
| Almacenes (`/warehouse`)                    | Hecho (Stock, Movimientos, Préstamos, Pedidos, Materiales, Depósitos, Config)                                                                                                                                                                                                                                              | ✅                                                                       | 🟢 (módulo propio)       | —                                                                                                                                                                                |
| Compras (`/purchases`)                      | Hecho                                                                                                                                                                                                                                                                                                                      | 🟡                                                                       | 🟢 (módulo propio)       | Navegador; decisión `view_prices`/`send`                                                                                                                                         |
| Tesorería (`/treasury`)                     | Hecho                                                                                                                                                                                                                                                                                                                      | 🟡                                                                       | 🟢 (módulo propio)       | Navegador; decisión `config-tesoreria` create/delete                                                                                                                             |
| Dashboard (`/dashboard`)                    | Iteración 1: navegación propia (Resumen/Vencimientos/Análisis, vistas con `ViewManagerServer`), widgets con container queries, KPIs con `view`                                                                                                                                                                             | ✅ 1280/768/390 (Análisis, Resumen); Vencimientos sin datos demo         | 🟡                       | **Dashboard personalizable** (ver abajo); Resumen (Principal) sin rediseñar; Vencimientos sin verificar con datos (bug del seed demo)                                            |
| Formularios (`/forms`)                      | Hecho: permisos, detalle, tabla, checklist partido, legacy limpio                                                                                                                                                                                                                                                          | ❌ (QR sin probar)                                                       | 🟡                       | Probar QR anónimo y `/forms/<id>/new`                                                                                                                                            |
| Ayuda (`/help`)                             | Hecho: permisos, tokens, fechas, limpieza, sectionNav                                                                                                                                                                                                                                                                      | ❌                                                                       | 🟡                       | Probar en claro/oscuro y 390 px                                                                                                                                                  |
| Configuración (`/configuration`)            | Iteración 2: secciones propias (Organización, Usuarios y accesos, Personal, Flota, Taller, Tipos de documento), ViewManager en todos los niveles, ficha de empresa, ABM de empresas, **todos los ABM a tabla + Sheet** y catálogos reagrupados, permisos `view` en lecturas, M:M con altas/bajas, roles sin borrado masivo | ✅ 1280/390 (vistas, alias, Sheets, alta real de marca, editor de roles) | 🟢                       | Editor de roles/permisos: rediseño + nombres/descripciones (iteración 3); `fetchAllTypesOfRepairs` sin `view` (lo usa el asistente de órdenes)                                   |
| Empleados (`/employee`)                     | Hecho (iteración 3)                                                                                                                                                                                                                                                                                                        | ✅ 1280/390                                                              | 🟢                       | Lista con ViewManager (Activos/Bajas/Diagramas/Selección), ficha con RecordHeader + secciones, baja en Sheet. Pendiente `Employees/Empleados/components/utils/utils.ts` a shared |
| Equipos (`/equipment`)                      | Parcial (auditoría previa)                                                                                                                                                                                                                                                                                                 | ❌                                                                       | 🔴 fichas con tabs       | Idem; `vehicle-tabs`, `OtherEquipmentTabs`                                                                                                                                       |
| Documentación (`/document`)                 | Parcial (auditoría previa)                                                                                                                                                                                                                                                                                                 | ❌                                                                       | 🔴 5 TabContent con tabs | Rediseño estructural                                                                                                                                                             |
| Operaciones (`/operations`)                 | Parcial (auditoría previa)                                                                                                                                                                                                                                                                                                 | ❌                                                                       | 🔴                       | Rediseño estructural                                                                                                                                                             |
| Selección (`/recruitment`)                  | Parcial (auditoría previa)                                                                                                                                                                                                                                                                                                 | ❌                                                                       | 🟡                       | Revisar contra GH (GH no tiene módulo equivalente: es propio)                                                                                                                    |
| Shell global (sidebar, header, login, tema) | Header rediseñado (iteración 1): contexto módulo/sección + "Ir a…" Ctrl/⌘K + ayuda + tema                                                                                                                                                                                                                                  | ✅ 1280/390                                                              | 🟢 header / 🟢 sidebar   | Badges por sección en el sidebar HECHOS (iteración 3: tsc+build+navegador en Mantenimiento/Almacenes/Compras/Tesorería; fila `SectionNav` borrada); login sin revisar contra GH  |

## Decisiones tomadas por defecto (el usuario las vio; se pueden revertir)

Comercial: 7 subtabs como sub-items del sidebar con las mismas URLs; ficha de cliente con URL propia; detalle de certificación en Sheet.
Compras: bloquear anular recepción facturada; Pagos con `?vista=vencimientos|ordenes`; sin `view_prices` nuevo. Almacenes: claves de
precio sin cambio; cancelar pedido sin cambio; sin umbral de "préstamo viejo". Tesorería: extracto limitado a 12 meses; contadores solo en
cobranzas/cheques/cheques propios/conciliación. Dashboard: se corrigieron solo rótulos, no fórmulas. Formularios: armador legacy
borrado, legacy en solo lectura. Ayuda: solo envoltura+tokens+fechas. Configuración: sectionNav solo en 1er nivel conservando `?tab=/subtab=`.

## Sistema de navegación de alphataco (decidido en la iteración 1, aplica a todo)

- **Nivel 1 (secciones)**: solo el sidebar. `SectionManagerServer` dibuja `PageHeader` (título + descripción + acciones; en móvil
  el título se vuelve selector de sección). La fila `SectionNav` solo queda en `md+` cuando alguna sección tiene `navCounter`.
- **Nivel 2 (vistas dentro de una sección)**: `ViewManagerServer` (`src/features/TabsManager/ViewManagerServer.tsx`), server-first,
  solo renderiza la vista activa, permisos por vista, `preserveParams` para no arrastrar filtros. `layout="menu"` (selector
  "Vista: X ▾" con descripción y contador) en todos los anchos; `layout="rail"` (columna lateral) desde `2xl`.
  Migración: ver el antes/después en `referencias/` o en `ViewManagerServer.tsx`. Al migrar la última pantalla se borran
  `TabsManagerServer/Client/ClientSide` y `SectionNav`.
- **Fichas** (empleado/equipo, próxima iteración): `RecordHeader` + índice de bloques anclados a la izquierda en `lg` +
  `SectionCard` en una columna; historial y documentos de detalle en `Sheet`.
- **Widgets**: toda tarjeta de gráfico/estadística decide su layout por su propio ancho (`@container`), preparado para el
  Dashboard personalizable. La barra del DataTable también (`@container/toolbar`).

## Pedidos nuevos del usuario (iteración 1)

- **Dashboard personalizable** (pedido 2026-10-15): uno o varios dashboards donde el usuario elige widgets (gráficos/estadísticas),
  los agranda/achica y los ordena. Requiere diseño propio (catálogo de widgets con permisos, grilla, persistencia por usuario →
  **migración: consultar al usuario**). Base lista: widgets fluidos por contenedor. El usuario va a dar más detalles.
- **Header** rediseñado (hecho). **Menús "Columnas" y "Filtros" de las tablas con buscador** (hecho, `Popover` + `Command`; ojo: dentro de `CommandList` los ítems van en `CommandGroup`, un `<div>` intermedio rompe el reordenamiento de cmdk). Criterio del usuario: ir puliendo
  detalles de UX de ese tipo en cada pantalla sin esperar que los pida.

- **ABM formulario + tabla → tabla a ancho completo + formulario en panel/modal** (decisión del usuario, 2026-10-15): aplica a
  TODAS las pantallas con `CatalogSplitLayout` o `ResizablePanelGroup` (~20: Configuración, Clientes/unidades, Diagramas, KPIs,
  Tipos de reparación). Además, **reagrupar** las vistas con pocos datos. Diseño cerrado (iteración 2):
  - Componente `src/shared/components/common/CatalogFormSheet.tsx` (`useCatalogSheet`, `CatalogFormSheet`, `CatalogCreateButton`,
    `CatalogTableSurface`, `useCatalogSheetClose`): tabla a ancho completo en superficie propia + Sheet derecho (md/lg/xl) para
    alta/edición; "Nuevo" exige `create`, "Editar" `update`; sin ambos, solo tabla. Se borra `CatalogSplitLayout` al terminar.
  - `ViewDefinition` suma `aliases` (links viejos `?subtab=X` caen en la vista fusionada), `visibleWhenAny` y `surface` (fondo).
  - Reagrupación (cada sub-bloque conserva su guard, `tableId` y botón "Nuevo"): Flota 5→3 (**Tipos y subtipos**, **Marcas y
    modelos** con "Ver modelos", Titulares); Personal → **Puestos, aptitudes y contratos**, **Diagramas y novedades**, Convenios,
    EPP; Organización: **Estructura** (centros de costo + organigrama); Taller 4→2 (**Talleres y sectores** con "Ver sectores",
    **Reparaciones y grupos**). DiagramFormUpdated (generador, no ABM): grilla @container en vez de Resizable.
  - Decisiones tomadas por defecto (recomendadas): Sheet lateral para todos (no modal); Tipos de contrato como 3er bloque de Puestos.
- **Dependencias sin uso se quitan sin preguntar** (corrección del usuario): `react-modal` + `@types/react-modal` desinstaladas.

## Bloqueantes de verificación

- ~~**Seed demo sin documentos obligatorios ni vencimientos**~~ (arreglado en la iteración 2: `seedDocuments` inserta los obligatorios; además `applies_to: 'equipment'` → `'other_equipment'` en catalogs.ts) (`scripts/demo/domains/documents.ts`): espera filas "pendiente"
  generadas por triggers que en alphataco ya no existen (el motor de cumplimiento calcula faltantes en TS). Resultado: 309/111
  documentos presentados, todos con `validity = NULL`; Vencimientos y Documentación no se pueden verificar con datos. Afecta
  también a la instancia demo publicada. Arreglar el seed (insertar documentos con vencimiento) antes de la iteración de Documentación.

## Decisiones TOMADAS por el usuario (2026-10-15, después de la iteración 2)

- **D-NAV-1 → SÍ**: contadores de sección como badges en los sub-ítems del sidebar; borrar la fila `SectionNav` de
  Mantenimiento/Almacenes/Compras/Tesorería (y el componente cuando quede sin uso).
- **Dashboard personalizable → SÍ, con migración**: uno o varios dashboards por usuario, widgets elegibles/redimensionables/
  ordenables; **cada widget visible solo si el usuario tiene permiso sobre su módulo** (no cualquiera ve cualquier dashboard).
  Migración permitida (aplicar solo en `alphataco_test`; el resto llega por deploy).
- **Todas las decisiones pendientes de abajo → SÍ, "metelo todo"**: agregar las claves de permisos que faltan en
  `permissions-map.ts` + migración para los 3 roles de sistema; resolver unidades de medida, criterios del Dashboard, etc.
  con la recomendación de cada una.
- **Permisos**: revisar que tabs y acciones se nombren correctamente y que cada permiso indique **qué le habilita al usuario**
  (descripción visible en el editor). **Rediseñar la vista de roles y permisos** (editor de rol y permisos por usuario).

## Iteración 3 (2026-10-15) — avance

- Badges de sección en el sidebar: HECHO y verificado (tsc + build + navegador).
- Permisos P1: 13 claves nuevas (`send`, `view_prices` en solicitudes/cotizaciones/ordenes/recepciones, tesorería config create/delete,
  facturacion:update, documentos-contrato create/delete, mensure_units:delete), 85 tabs renombradas, descripciones de 164 tabs y 15 acciones
  (`permission-catalog.ts`); migraciones 20261022100000/100100 aplicadas solo en alphataco_test (copiadas a quien tenía la clave de origen).
- Permisos P2: todas las claves nuevas consumidas en servidor + UI ("Sin permiso" en importes). `compras:recepciones:view_prices` no gobierna
  nada (Recepciones no muestra importes) → se mantiene por decisión del usuario. Editar OC borrador y cargar respuesta de cotización exigen view_prices.
- Decisiones punto 4: préstamo viejo = 30 días (`Warehouses/lib/loan-rules.ts`); aviso de truncado en Formularios; guards `requireAnyView` en
  selectores de Configuración; CUIT parcial sin LIMIT. Pendiente: guard de `getFiscalDataOverview` (Facturación).
- Dashboard personalizable: `user_dashboards` (migración 20261022110000, solo alphataco_test), registro de widgets con permisos por módulo,
  7 tableros por defecto.
- Dashboard cierre: HECHO. Tablero activo en sidebar/miga, manual, criterios unificados: servicios del día, disponibles, estados terminales
  de pedidos (27→25), solicitudes abiertas = `pending_approval` o `approved` sin pedido (70→5); "En operación" excluye servicios cancelados y los muestra aparte.
- Editor de roles/permisos rediseñado: HECHO (Sheet con rail de módulos, búsqueda, descripciones, delta visible; página de usuario con
  Roles asignados y Acceso efectivo).
- MensureUnitsTable al DataTable nuevo: HECHO.
- Empleados: HECHO (lista con ViewManager Activos/Bajas/Diagramas/Selección, ficha con RecordHeader + secciones, baja en Sheet, aliases).
- Fix: `getWorkDiagrams` (store de catálogos) devolvía `Decimal` al cliente; ahora serializa a number.

## Decisiones PENDIENTES del usuario (reportar en cada cierre hasta que las tome)

Quedan abiertas: guard de `getFiscalDataOverview` (Facturación); Equipos, Documentación, Operaciones y resto de Mantenimiento sin rediseñar (próxima iteración).

1. **Unidades de medida** (Comercial): catálogo global sin `company_id` → rol de plataforma o migración. `getContacts` (Empresa/Clientes) es código muerto sin borrar.
2. ~~**Permisos que faltan en `permissions-map.ts`** (requieren mapa + migración de roles `admin`, `administrador`, `full-access-provisional`):
   `compras:*:view_prices`, `tesoreria:config-tesoreria:create|delete`, clave `send` de órdenes de compra, `facturacion:update`,
   `documentos-contrato:create|delete`, `mensure_units:delete`, `convenios:update`.~~ Resuelto en P1/P2 de la iteración 3.
3. ~~**Dashboard**: "Disponibles" de personal (puede dar negativo), 4 criterios de "servicios del día", "disponible/sin asignar" de equipos,
   qué estados de orden de mantenimiento son terminales (Dashboard vs ficha del equipo), filtros por cookie → URL.~~ Resuelto: criterios unificados en el cierre del Dashboard.
4. ~~**Préstamos**: días para considerar un préstamo "viejo". Búsqueda parcial de CUIT <11 dígitos acotada a 500. Formularios: unión de
   fuentes con tope 2000/fuente sin aviso. Lecturas "selector" de Configuración sin guard (¿`view` de cualquiera de las tabs que las usan?).~~ Resuelto (30 días, avisos, guards `requireAnyView`); queda el guard de `getFiscalDataOverview`.
5. ~~**D-NAV-1**: contadores de sección en desktop: ¿badges en los sub-ítems del sidebar (recomendado) y borrar la fila `SectionNav`
   de Mantenimiento/Almacenes/Compras/Tesorería? Hoy esa fila sigue solo donde hay contadores.~~ Resuelto: badges de sección en el sidebar.
6. Cambios visibles a avisar: Dashboard: secciones renombradas (Principal→**Resumen**, Documentación→**Vencimientos**,
   Estadísticas→**Análisis**; vistas Personal/Equipos y Operación/Flota y taller/Personal/Control de desvíos), cambio de vista con ida
   al servidor (antes cambio instantáneo en cliente), header nuevo con Ctrl/⌘K; preferencias de tablas `-v2` reseteadas (Mantenimiento) y columna sector de Posiciones; "Cerrada" vs
   "Finalizada" en gomería; colores de estados de tickets y fechas `DD/MM/YYYY`; "Sin puesto"; borrado de conceptos de Tesorería con confirmación.

## Pendiente de cierre (técnico)

- `tsc` completo + `next build` + navegador (1280/390) de TODOS los módulos; QR anónimo; caso negativo de permisos.
- Dos revisiones independientes (Compras+Tesorería; Configuración+Dashboard+Formularios+Ayuda) y aplicar hallazgos.
- Actualizar "Learned Corrections" del `CLAUDE.md` con las trampas de `MODELO-DE-TRABAJO.md §8`.
- ~~Lecturas de KPIs sin `view`~~ y ~~Dashboard P5/P6~~: hechos en la iteración 1.
- KPIs › Gráficos desborda a 768/390 por la barra de tabs GH de Configuración › General (se resuelve en la iteración de Configuración).
