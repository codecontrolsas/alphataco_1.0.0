# Auditoría de Server Actions sin guarda de permisos

Fecha: 2026-10-21 · Rama `feat/arquitectura-instancias` · Estado: **candidatos a revisar, no vulnerabilidades confirmadas**.

## Por qué

Una Server Action (archivo con `'use server'`) se puede invocar sin pasar por la pantalla. Si la interfaz solo oculta el botón y la acción no verifica el permiso ni las reglas de estado, cualquier usuario autenticado con acceso a la app puede ejecutarla. La app móvil agrega otro canal de entrada, así que este control deja de ser opcional.

## Método (heurística, reproducible)

Se listaron los archivos `'use server'` (330 en `src/`) y se marcaron los que:

1. exportan funciones de escritura (nombres que empiezan con `create`, `update`, `delete`, `remove`, `upsert`, `set`, `save`, `assign`, `approve`, `reject`, `cancel`, `close`, `send`, `import`, `register`, `insert`, `add`, `toggle`, `reopen`, `activate` o `deactivate`), y
2. **no contienen ninguna** de estas guardas: `checkPermissionServer`, `requireServerAuthProfile`, `requireComercialPermission`, `require*Permission`, `assert*Permission`, `hasPermission`, `getClothingOperatorCompanyId`, `assertWarehouse*` o llamadas a `can*(`.

**Límites:** un archivo puede estar protegido por un helper con otro nombre o por una función que llama; un archivo con guarda en una función puede no tenerla en otra (la heurística mira el archivo entero); y solo se miran las funciones cuyo nombre sugiere escritura. Por eso es una lista de **dónde mirar primero**.

## Resultado: 17 candidatos

(Un decimoctavo, `PartesDiarios/detail/mutations.server.ts`, salió en la búsqueda porque sus guardas se llaman `authorize*`; ya fue corregido en T2.)

| Archivo | Funciones de escritura | Nota |
|---|---|---|
| `Operaciones/PartesDiarios/actions/mutations.server.ts` | `updateMultipleDailyReportStatus`, `createDailyReport`, `deleteDailyReport` | Cabecera del parte diario: revisar primero (mismo módulo que T2) |
| `Operaciones/Preparte/actions/mutations.server.ts` | `createPreparte`, `updatePreparte`, `updatePreparteImageByOrderNumber`, `deletePreparte` | Existe `preparte-permissions.ts`; verificar que estas funciones lo usen |
| `Operaciones/PartesDiarios/remitManager/actions/remitos.server.ts` | `createRemito`, `updateRemitoNumber`, `deleteRemitDocument`, `deleteRemito` | Remitos de partes diarios |
| `Operaciones/PartesDiarios/detail/clone.server.ts` | `cloneDailyReportRows` | No salió en la heurística por su nombre; crea líneas y partes en otra fecha y **no tiene guardas propias** (queda cubierta solo cuando la llama la edición masiva) |
| `Equipos/EquipoID/lib/actions/vehicle-actions.ts` | `toggleVehicleStatus`, `createVehicle`, `updateVehicle`, `updateEquipmentCondition` | Alta, edición y baja de equipos |
| `Comercial/Facturacion/actions/invoice-drafts-create.server.ts` | `createInvoiceDraftFromCertifications`, `createManualInvoiceDraft`, `createAdjustmentDraft` | Facturación: prioridad alta por impacto |
| `Clothing/actions/catalog.server.ts` | `createClothingBrand`, `updateClothingBrand`, `toggleClothingBrandActive`, `createClothingSize`, … (10) | Catálogo de indumentaria |
| `Empresa/CCT/actions/categories.server.ts` | `createCategory` | Convenios |
| `Empresa/CCT/actions/covenants.server.ts` | `createCovenant` | Convenios |
| `OperatorPanel/actions/work-orders.server.ts` | `closeWorkOrder` | Panel del operario: el perímetro es el operario de sesión, revisar que lo valide |
| `OperatorPanel/actions/repairs.server.ts` | `updateTechnicianNotes` | Ídem |
| `OperatorPanel/actions/session.server.ts` | `setActiveOperatorSector` | Ídem |
| `Dashboard/Boards/actions/boards.server.ts` | `createUserBoard`, `deleteUserBoard`, `saveUserBoardLayout` | Tableros del propio usuario: verificar que solo toque los suyos |
| `Auth/actions/auth-actions.ts` | `updatePasswordAction` | Va por el token de Better Auth; probablemente correcto |
| `Layout/sidebar/actions/user-profile.ts` | `updateProfileAvatar` | Perfil propio |
| `shared/actions/table-preferences.ts` | `saveTable*` (4) | Preferencias del propio usuario; bajo riesgo |
| `shared/actions/actions.ts` | `setMainTabCookie`, `setSubTabCookie`, `setTabStateCookie` | Cookies de pestañas; sin riesgo |
| `lib/utils/sendErrorReport.ts` | `sendErrorReport` | Envío de reporte de errores |

## Cómo seguir

1. Revisar en este orden: Operaciones (cabecera del parte, preparte, remitos, clonado), Facturación, Equipos, y el resto.
2. Para cada archivo confirmar: ¿verifica permiso por pestaña y acción?, ¿verifica la empresa de cada id que recibe?, ¿hay reglas de estado que hoy solo aplica la interfaz?
3. Corregir con el mismo patrón de T2: reglas puras compartidas con la interfaz + guarda de servidor + (donde hay estado) reevaluación bajo bloqueo de fila.
4. Los archivos que dependen del usuario de sesión (cookies, preferencias, perfil propio) suelen estar bien; confirmar que no aceptan un id de usuario por parámetro.

Para reproducir: recorrer los archivos `'use server'` con las reglas de arriba (el script usado está descrito en el método; se corrió con Node sobre `src/`).
