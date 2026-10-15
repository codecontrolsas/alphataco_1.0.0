import { Info } from 'lucide-react';

/**
 * Pestañas cuyo contenido usa permisos de otra pestaña: se avisa en la fila para que se sepa
 * dónde se configuran. Clave `modulo:tab`.
 */
const INHERITED_NOTES: Record<string, string[]> = {
  'empleados:detalle-empleado': [
    'La pestaña Documentación del legajo usa los permisos de Documentación › Documentos de empleados.',
    'Cargar un diagrama desde el legajo usa Empleados › Diagramas › Cargar diagramas.',
  ],
  'equipos:detalle-equipo': [
    'La pestaña Documentación del equipo usa los permisos de Documentación › Documentos de equipos.',
  ],
  'comercial:customers': ['Los contratos de la ficha del cliente usan los permisos de Gestión comercial › Contratos.'],
};

export function getInheritedNotes(moduleSlug: string | null, tabSlug: string | null): string[] {
  if (!moduleSlug || !tabSlug) return [];
  return INHERITED_NOTES[`${moduleSlug}:${tabSlug}`] ?? [];
}

export function InheritedNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="bg-info-subtle text-info-subtle-foreground space-y-1 rounded-md px-3 py-2 text-xs">
      {notes.map((note) => (
        <li key={note} className="flex gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="text-pretty">{note}</span>
        </li>
      ))}
    </ul>
  );
}
