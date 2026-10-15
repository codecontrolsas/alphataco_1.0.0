# Plan de validación de punta a punta del flujo de documentos (se ejecuta al terminar E5–E7 y las migraciones)

Pedido del usuario: validar el flujo entero (vencimientos en fecha, alertas en TODO lugar donde se muestren, contadores y filtros, flujo de punta a punta), usar CodeGraph para encontrar TODOS los lugares, crear en la base los datos necesarios para verificarlos, y revisar escala (muchos registros: nada que traiga demasiados datos). Va a PRODUCCIÓN: tiene que funcionar perfecto. SIN tests por ahora (se probará funcionando: navegador, consultas, scripts descartables); los tests se hacen al final del rediseño completo, solo cuando el usuario lo diga.

## Consumidores del estado documental (inventario CodeGraph, a completar)

1. Las 6 listas: DocumentosEmpleados|Equipos|Empresa × Permanentes|Mensuales (E5a) + sus embebidos en fichas (EmployeeDocumentDetail, EquipmentDocumentDetail).
2. Tarjetas de estado (DocumentStateMetrics\*), botones de descarga masiva (PermanentDocumentsDownloadButton y los de Mensuales: separan `pendiente`/`archived_at`).
3. Dashboard/Documentacion/{Empleados,Vehiculos} (reportes de por vencer; usan archived_at).
4. DetalleDocumento/\* (ficha del documento; "Ya no aplica").
5. Store global del usuario: src/shared/store/loggedUser.ts (isOperativelyActive y hasAllDownDocumentsPresented leen 'pendiente'), src/shared/store/lib/document-buckets.ts (allDocumentsToShow/Alldocuments/lastMonthDocuments/pendingDocuments), src/shared/actions/session.server.ts (getStoreEmployees/getStoreVehicles). ⚠ ESCALA: trae TODOS los empleados con TODOS sus documentos al navegador.
6. Columnas/filtros/métricas de Empleados y Equipos que leen employees.status / vehicles.status (EmployeeList columns + EmployeeMetrics, EquipmentOwners/actions.server.ts, listas de vehículos y OtherEquipment si aplica).
7. Jobs: documents-expiry (mail semanal con get_documents_expiry_summary: usa filas pendientes) y documents-status (job diario nuevo).
8. Checklist de candidatos (separado: documents_pre_employees) y aprobar candidato.
9. shared/lib/{distinct-values,prisma-tenant,storage-perimeter}.ts y shared/utils/{mappers,legacy-mappers}.ts.
10. Cualquier otro lugar con alertas/notificaciones/badges de documentos (buscar con CodeGraph: "documents", "vencido", "pendiente", "alert", "notification", "expir").

## Qué validar

A. Vencimiento: un documento con validez futura pasa a vencido SIN escritura al llegar la fecha (derivado, hora argentina; el día del vencimiento todavía vale; 21–24 h AR); status del recurso cambia con el job diario y con los eventos; mensuales (período corriente).
B. Alertas en TODO lugar: cada consumidor del inventario muestra lo mismo que el motor para los mismos recursos (comparar contra el motor).
C. Contadores y filtros: tarjetas por estado == filas filtradas; facetas con cross-filter; búsqueda; export (cantidad y contenido); orden; paginación; filtros por status en Empleados/Equipos.
D. Flujo de punta a punta: crear tipo (con y sin condiciones) → recurso aplicable → "Faltante" → subir (simple y multirrecurso) → presentado → vencer → renovar → eliminar → status; editar condiciones del tipo (impacto); cambiar atributo del recurso (puesto/cliente/aptitud) → aplica/deja de aplicar; baja del recurso (down_document); aprobar candidato.
E. Datos: crear en la base de pruebas un set sintético grande y variado (empresas de prueba propias): p. ej. 5.000 empleados y 2.500 equipos con tipos globales y propios, especiales con condiciones por puesto/categoría/convenio/cliente/aptitud, mensuales, de baja, privados, con documentos en todos los estados y vencimientos en todas las ventanas (vencido, hoy, 1/7/30/31 días, sin vencimiento), recursos de baja y mezclados entre empresas.
F. Escala: medir por request el costo de cada lista, tarjeta, faceta, export, dashboard, store global y job (tiempo, cantidad de filas leídas, memoria); detectar consultas sin límite/sin paginar y N+1; con EXPLAIN en las consultas del dataset; objetivo: ninguna consulta de lectura trae más de lo necesario y el tiempo se mantiene con 10× los datos actuales. Corregir lo que no cumpla.
G. Navegador: recorrer cada pantalla afectada (escritorio y 390 px) con la base de pruebas.

## Reglas

Solo `alphataco_test` para datos sintéticos y escrituras (para ver la app contra esa base se levanta un `next dev` aparte con DATABASE_URL de pruebas, en otro puerto; no tocar el servidor del usuario en 3000). Nada de tests ni archivos \*.test.ts. Usar CodeGraph (`codegraph_explore`) para hallar los lugares, no grep a ciegas.
