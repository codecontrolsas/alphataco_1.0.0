import { Skeleton } from '@/components/ui/skeleton';

/**
 * Maintenance index loading skeleton.
 * Matches the GHLogin page: a centered Card (max-w-md) with:
 * - Logo image at top
 * - Description text
 * - Equipment search combobox (equipment-selection step)
 * - Continue button
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background bg-cover bg-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-lg">
        {/* CardHeader */}
        <div className="p-6 pb-2 space-y-1">
          {/* Logo centrado */}
          <div className="flex items-center justify-center mb-4">
            <Skeleton className="h-15 w-60" />
          </div>
          {/* Descripcion */}
          <Skeleton className="h-4 w-72 mx-auto" />
        </div>

        {/* CardContent — formulario equipment-selection */}
        <div className="p-6 pt-2 space-y-4">
          {/* Texto de instruccion */}
          <Skeleton className="h-4 w-64 mx-auto" />

          {/* Label "Equipo" */}
          <Skeleton className="h-4 w-14" />

          {/* Combobox (boton outline) */}
          <Skeleton className="h-10 w-full rounded-md" />

          {/* Boton "Continuar" */}
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
