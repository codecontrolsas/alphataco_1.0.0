# Estado del rediseño

> Se actualiza al cerrar cada iteración del loop. Fecha de este corte: **2026-10-15**. Rama de trabajo: ver `PROMPT-LOOP.md`.
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

- Shell del Dashboard: `Dashboard/DashboardComponent.tsx` (pestañas Principal/Documentación/Estadísticas), `Dashboard/Estadisticas/EstadisticasTabComponent.tsx`, `Dashboard/Documentacion/DocumentsTabContent.tsx`, `Dashboard/Estadisticas/KPIs/KpisTabContent.tsx`
- Documentación: `Documentacion/{DocumentosEmpleados,DocumentosEmpresa,DocumentosEquipos,TiposDocumentos}/*TabContent.tsx`, `Documentacion/DetalleDocumento/DocumentDetailSection.tsx`
- Fichas: `Employees/EmpleadoID/components/{employee-document-detail,view/EmployeeReadView}.tsx`, `Employees/Diagrams/{EmployeesDiagram,DiagramDetailEmployeeView}.tsx`, `Equipos/EquipoID/components/{vehicle-tabs,vehicle-operations-history,equipment-document-detail}.tsx`, `Equipos/OtherEquipment/components/OtherEquipmentTabs.tsx`, `Equipos/Equipos/DadosDeBaja/DadosDeBajaTabContent.tsx`
- Configuración: `Empresa/EmpresaComponent.tsx`, `Empresa/General/GeneralTabContent.tsx`, `Empresa/General/components/mantenimiento/TalleresTab.tsx`, `Empresa/RRHH/RrhhTabContent.tsx`, `Empresa/Equipos/EquipmentsTabContent.tsx`, `Empresa/Usuarios/UsersTabComponent.tsx`
- Otros: `Clothing/ClothingCatalogTabContent.tsx`, `Mantenimiento/Gomeria/GomeriaTabContent.tsx`, `Mantenimiento/Pipeline/components/PipelineLayout.tsx` (pasos internos), `app/dashboard/employee/page.tsx`

## Tabla por módulo

Leyenda "Verificado": ✅ navegador 1280+390 · 🟡 `tsc`/`build` sin navegador · ❌ sin verificar. "Brecha vs GH": 🔴 se parece (sin auditar o con estructura GH) · 🟡 parcial · 🟢 distinto.

| Módulo (ruta)                               | Rediseño interno                                                                   | Verificado                 | Brecha vs GH             | Pendiente                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mantenimiento (`/maintenance`)              | Hecho (pipelines, bandeja, detalle en Sheet, Gomería, desvíos, QR)                 | ✅ 1280 (falta 390)        | 🟡                       | Partir `NuevoPedidoChecklistForm` (1162 líneas); Gomería/Pipeline aún con tabs internas                                                                                                                                                                                                                                                                       |
| Comercial (`/comercial`)                    | Hecho (Clientes, Contratos, Certificaciones, Facturación, talleres)                | ✅                         | 🟡                       | `MensureUnitsTable` (BaseDataTable) + cookies; decisión D-4 unidades de medida                                                                                                                                                                                                                                                                                |
| Almacenes (`/warehouse`)                    | Hecho (Stock, Movimientos, Préstamos, Pedidos, Materiales, Depósitos, Config)      | ✅                         | 🟢 (módulo propio)       | —                                                                                                                                                                                                                                                                                                                                                             |
| Compras (`/purchases`)                      | Hecho                                                                              | 🟡                         | 🟢 (módulo propio)       | Navegador; decisión `view_prices`/`send`                                                                                                                                                                                                                                                                                                                      |
| Tesorería (`/treasury`)                     | Hecho                                                                              | 🟡                         | 🟢 (módulo propio)       | Navegador; decisión `config-tesoreria` create/delete                                                                                                                                                                                                                                                                                                          |
| Dashboard (`/dashboard`)                    | Hecho: Principal, Estadísticas (RRHH, Operaciones, Sala de control, Mantenimiento) | ❌ (solo carga como admin) | 🔴 shell con tabs GH     | Shell/Estadísticas/Documentación/KPIs sin sectionNav; borrar 11 gráficos muertos de `KPIs/Graficos`; export de Documentación                                                                                                                                                                                                                                  |
| Formularios (`/forms`)                      | Hecho: permisos, detalle, tabla, checklist partido, legacy limpio                  | ❌ (QR sin probar)         | 🟡                       | Probar QR anónimo y `/forms/<id>/new`                                                                                                                                                                                                                                                                                                                         |
| Ayuda (`/help`)                             | Hecho: permisos, tokens, fechas, limpieza, sectionNav                              | ❌                         | 🟡                       | Probar en claro/oscuro y 390 px                                                                                                                                                                                                                                                                                                                               |
| Configuración (`/configuration`)            | Seguridad hecha + 7 tablas General/RRHH                                            | ❌                         | 🔴 tabs GH               | **C-P2b** tablas Equipos/Usuarios/AccesosExternos (+partir `Usuarios/actions.server.ts` 713 y `EquipmentOwners/actions.server.ts` 770); **C-P3** navegación (sectionNav 1er nivel, `SectionCard` en vez de 8 `CardHeader`, "APT"→"Aptitudes Técnicas", `StateBlock`, borrar `General/CentrosDeCostos/table/column.tsx`); opcional C-P4 company form a RHF+zod |
| Empleados (`/employee`)                     | Parcial (auditoría previa)                                                         | ❌                         | 🔴 fichas con tabs       | Rediseño estructural de lista y ficha; pendiente `Employees/Empleados/components/utils/utils.ts` a shared                                                                                                                                                                                                                                                     |
| Equipos (`/equipment`)                      | Parcial (auditoría previa)                                                         | ❌                         | 🔴 fichas con tabs       | Idem; `vehicle-tabs`, `OtherEquipmentTabs`                                                                                                                                                                                                                                                                                                                    |
| Documentación (`/document`)                 | Parcial (auditoría previa)                                                         | ❌                         | 🔴 5 TabContent con tabs | Rediseño estructural                                                                                                                                                                                                                                                                                                                                          |
| Operaciones (`/operations`)                 | Parcial (auditoría previa)                                                         | ❌                         | 🔴                       | Rediseño estructural                                                                                                                                                                                                                                                                                                                                          |
| Selección (`/recruitment`)                  | Parcial (auditoría previa)                                                         | ❌                         | 🟡                       | Revisar contra GH (GH no tiene módulo equivalente: es propio)                                                                                                                                                                                                                                                                                                 |
| Shell global (sidebar, header, login, tema) | Rediseñado en rama anterior (`feat/rediseno-ui`)                                   | ✅                         | 🟡                       | Verificar contra GH que sidebar/header/empresa-switcher no coincidan                                                                                                                                                                                                                                                                                          |

## Decisiones tomadas por defecto (el usuario las vio; se pueden revertir)

Comercial: 7 subtabs como sub-items del sidebar con las mismas URLs; ficha de cliente con URL propia; detalle de certificación en Sheet.
Compras: bloquear anular recepción facturada; Pagos con `?vista=vencimientos|ordenes`; sin `view_prices` nuevo. Almacenes: claves de
precio sin cambio; cancelar pedido sin cambio; sin umbral de "préstamo viejo". Tesorería: extracto limitado a 12 meses; contadores solo en
cobranzas/cheques/cheques propios/conciliación. Dashboard: se corrigieron solo rótulos, no fórmulas. Formularios: armador legacy
borrado, legacy en solo lectura. Ayuda: solo envoltura+tokens+fechas. Configuración: sectionNav solo en 1er nivel conservando `?tab=/subtab=`.

## Decisiones PENDIENTES del usuario (reportar en cada cierre hasta que las tome)

1. **Unidades de medida** (Comercial): catálogo global sin `company_id` → rol de plataforma o migración. `getContacts` (Empresa/Clientes) es código muerto sin borrar.
2. **Permisos que faltan en `permissions-map.ts`** (requieren mapa + migración de roles `admin`, `administrador`, `full-access-provisional`):
   `compras:*:view_prices`, `tesoreria:config-tesoreria:create|delete`, clave `send` de órdenes de compra, `facturacion:update`,
   `documentos-contrato:create|delete`, `mensure_units:delete`, `convenios:update`.
3. **Dashboard**: "Disponibles" de personal (puede dar negativo), 4 criterios de "servicios del día", "disponible/sin asignar" de equipos,
   qué estados de orden de mantenimiento son terminales (Dashboard vs ficha del equipo), filtros por cookie → URL.
4. **Préstamos**: días para considerar un préstamo "viejo". Búsqueda parcial de CUIT <11 dígitos acotada a 500. Formularios: unión de
   fuentes con tope 2000/fuente sin aviso. Lecturas "selector" de Configuración sin guard (¿`view` de cualquiera de las tabs que las usan?).
5. Cambios visibles a avisar: preferencias de tablas `-v2` reseteadas (Mantenimiento) y columna sector de Posiciones; "Cerrada" vs
   "Finalizada" en gomería; colores de estados de tickets y fechas `DD/MM/YYYY`; "Sin puesto"; borrado de conceptos de Tesorería con confirmación.

## Pendiente de cierre (técnico)

- `tsc` completo + `next build` + navegador (1280/390) de TODOS los módulos; QR anónimo; caso negativo de permisos.
- Dos revisiones independientes (Compras+Tesorería; Configuración+Dashboard+Formularios+Ayuda) y aplicar hallazgos.
- Actualizar "Learned Corrections" del `CLAUDE.md` con las trampas de `MODELO-DE-TRABAJO.md §8`.
- Lecturas de KPIs (`Dashboard/Estadisticas/KPIs/**`) sin `view` (`configuracion:kpis`).
- Dashboard P5 (Documentación: `ExportResult` + memoizar `loadRows`) y P6 (borrar muertos).
