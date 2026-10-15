# Remit Manager

Sistema de gestión de múltiples remitos y documentos por línea de parte diario.

## 🚀 Uso Rápido

```tsx
import { RemitosManagerModal } from '@/features/Operaciones/PartesDiarios/remitManager';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Gestionar Remitos</Button>

      <RemitosManagerModal
        dailyReportRowId="uuid-here"
        customerName="Cliente Ejemplo"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

## 📦 Estructura

```
remitManager/
├── actions/
│   └── actionsClient.ts       # CRUD operations
├── hooks/
│   ├── useRemitos.ts          # Remitos queries & mutations
│   └── useDocuments.ts        # Documents queries & mutations
├── types/
│   └── index.ts               # TypeScript types
├── components/
│   ├── RemitosManagerModal.tsx
│   ├── AddRemitForm.tsx
│   ├── RemitTab.tsx
│   ├── DocumentUploadArea.tsx
│   └── DocumentViewer.tsx
└── index.ts                   # Public exports
```

## 🔧 API

### Componentes

#### RemitosManagerModal

Modal principal para gestionar remitos.

**Props:**

- `dailyReportRowId: string` - ID de la línea del parte diario
- `customerName?: string` - Nombre del cliente (opcional)
- `isOpen: boolean` - Estado del modal
- `onClose: () => void` - Callback al cerrar

### Hooks

#### useRemitos(dailyReportRowId)

Hook para gestionar remitos.

```tsx
const { data: remitos, isLoading, error } = useRemitos(rowId);
const createRemito = useCreateRemito(rowId);
const updateRemito = useUpdateRemitoNumber(rowId);
const deleteRemito = useDeleteRemito(rowId);
```

#### useDocuments(dailyReportRowId)

Hook para gestionar documentos.

```tsx
const uploadDocument = useUploadDocument(rowId, customerName);
const deleteDocument = useDeleteDocument(rowId);
const downloadDocument = useDownloadDocument();
```

### Acciones

Todas las acciones están en `actions/actionsClient.ts`:

- `getRemitosWithDocumentsClient(rowId)`
- `createRemitoClient(rowId, remitNumber)`
- `uploadDocumentToRemitoClient(remitId, file, customerName?)`
- `deleteDocumentClient(documentId)`
- `deleteRemitoClient(remitId)`
- `downloadDocumentClient(documentPath, documentName)`
- `getDocumentUrlClient(documentPath)`

### Tipos

```tsx
import type {
  RemitoWithDocuments,
  RemitDocument,
  RemitosManagerProps,
} from '@/features/Operaciones/PartesDiarios/remitManager';
```

## 📝 Ejemplos

### Crear un remito

```tsx
const createRemito = useCreateRemito(dailyReportRowId);

await createRemito.mutateAsync('12345');
```

### Subir un documento

```tsx
const uploadDocument = useUploadDocument(dailyReportRowId, customerName);

await uploadDocument.mutateAsync({
  remitId: 'uuid',
  file: selectedFile,
});
```

### Eliminar un documento

```tsx
const deleteDocument = useDeleteDocument(dailyReportRowId);

await deleteDocument.mutateAsync(documentId);
```

## 🎨 Características

- ✅ Múltiples remitos por línea
- ✅ Múltiples documentos por remito
- ✅ Subir archivos (PDF, JPG, PNG, WebP)
- ✅ Validación de archivos (max 10MB)
- ✅ Descargar documentos
- ✅ Eliminar con confirmación
- ✅ Reemplazar documentos
- ✅ Vincular documentos existentes
- ✅ Selector de remito dentro del gestor (alta y vinculación en el mismo modal)
- ✅ Estadísticas en tiempo real
- ✅ Toast notifications
- ✅ Optimistic updates

## 🗄️ Base de Datos

### Tablas

**remitos**

- `id` - UUID primary key
- `daily_report_row_id` - FK a dailyreportrows
- `remit_number` - Número del remito
- `created_at`, `updated_at` - Timestamps

**remito_documents**

- `id` - UUID primary key
- `remit_id` - FK a remitos
- `document_path` - Path en Supabase Storage
- `document_name` - Nombre original del archivo
- `created_at`, `updated_at` - Timestamps

### Migraciones

1. `20250118_create_remitos_tables.sql` - Crear tablas
2. `20250118_migrate_remitos_data.sql` - Migrar datos

## 🔒 Seguridad

- RLS habilitado en ambas tablas
- Políticas para usuarios autenticados
- Validación de tipos de archivo
- Validación de tamaño de archivo (max 10MB)

## 📚 Convenciones

Este feature sigue las convenciones de TypeScript del proyecto:

- ✅ Tipado con `Awaited<ReturnType<typeof function>>`
- ✅ `useQuery` para fetching client-side
- ✅ `useMutation` para operaciones CRUD
- ✅ Acciones separadas en `actionsClient.ts`
- ✅ Estructura de features aislada

Ver: `.kiro/steering/typescript-conventions.md`
