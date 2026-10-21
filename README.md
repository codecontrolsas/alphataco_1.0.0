# alphataco

Sistema de gestión integral (empleados, equipos, documentación, operaciones, mantenimiento, comercial). Base: Next.js 16 + Prisma 7 + Supabase.
Ver `CLAUDE.md` para convenciones y `docs/superpowers/plans/` para planes.

## Entorno local

La base de datos corre en Docker (Postgres + RustFS, el almacenamiento S3), no en Supabase. Setup rápido:

```bash
bash scripts/dev-up.sh   # levanta postgres + almacenamiento S3 (Docker) y crea los buckets
npm run db:deploy        # aplica las migraciones (prisma migrate deploy)
npm run db:seed          # seed idempotente de empresa/módulos/tabs/roles
npm run test:db          # tests pgTAP contra la base de test
```

Detalle de variables, puertos y servicios del compose: `docs/desarrollo/entornos.md`. Para crear o modificar una migración, seguir SIEMPRE el flujo de `.claude/rules/migrations.md` (nunca `prisma migrate dev`).

## Server actions

### Uso

1. Definir el metodo a usar [GET, POST, UPDATE, DELETE]
2. Importar y desestructurar la funcion  
   `import {  getAllDocumentTypes } from '@/app/server/{METODO}/actions';`
3. Ejemplo de uso
   `  const employees = await getAllEmployees()`

### Creacion

1. Segun el metodo a utilizar ir a la ruta [GET, POST, UPDATE, DELETE]  
   `@/app/server/{METODO}/actions`
2. Ir al final del archivo y crear la funcion:  
   2.1 Nombre de la funcion: El nombre debe estar siempre en camelCase siguiendo la siguiente estructura metodoFiltroEntidad
   `typescriptgetAllEmployees()`
   `getActivesEmployees()`

## Manejo del tipado

### Exportar Tipos Globales

Declara los tipos globales utilizando `declare global`:

```typescript
declare global {
  type Database = DB;
  type Vehicles = DB['public']['Tables']['vehicles']['Row'];
  type Brand = DB['public']['Tables']['brand_vehicles']['Row'];
  type TypeOfDocuments = DB['public']['Tables']['document_types']['Row'];
  type Company = DB['public']['Tables']['company']['Row'];
  type DocumentEmployees = DB['public']['Tables']['documents_employees']['Row'];
}
```

### Exportar Tipos con Relaciones

Para exportar tipos que incluyen relaciones, puedes seguir estos pasos:

1. **Importar los Tipos Necesarios**:
   Asegúrate de tener los tipos necesarios importados desde tu archivo de tipos de base de datos. En este caso, necesitas los tipos `Vehicles` y `Brand`.

2. **Utilizar `Omit` para Excluir Campos**:
   Utiliza el tipo utilitario `Omit` de TypeScript para excluir el campo que será reemplazado por la relación. En este caso, excluimos el campo `brand` de `Vehicles`.

3. **Definir la Nueva Interfaz con la Relación**:
   Define una nueva interfaz que extienda el tipo resultante de `Omit` y agrega el campo de la relación con el tipo correspondiente. En este caso, agregamos el campo `brand` con el tipo `Brand`.

```typescript
export interface VehiclesWithBrand extends Omit<Vehicles, 'brand'> {
  brand: Brand; // Relación con la tabla de marcas
}
```
