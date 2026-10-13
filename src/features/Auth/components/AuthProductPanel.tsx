import { Badge } from '@/components/ui/badge';
import { AUTH_PANEL } from '@/shared/lib/branding';

/** Datos de ejemplo del panel: ficticios y fijos, para que el acceso se vea igual en todas las instancias. */
const SAMPLE_ROWS = [
  { file: '0412', document: 'Examen preocupacional', due: '28/10/2026', state: 'Por vencer', variant: 'warning' },
  { file: '0187', document: 'Licencia de conducir', due: '09/10/2026', state: 'Vencido', variant: 'red' },
  { file: '0301', document: 'Seguro de vida', due: '14/03/2027', state: 'Vigente', variant: 'success' },
  { file: '0256', document: 'Curso de altura', due: '02/12/2026', state: 'Vigente', variant: 'success' },
] as const;

/**
 * Panel de producto de la pantalla de acceso. Siempre oscuro: `dark` fuerza el juego de tokens
 * oscuro en este subárbol, así que no hay colores sueltos y sigue la marca de la instancia.
 * Es decorativo (`aria-hidden`) y no se ve en pantallas angostas.
 */
export function AuthProductPanel() {
  return (
    <aside
      aria-hidden="true"
      className="dark bg-background text-foreground relative hidden overflow-hidden px-12 py-8 lg:flex lg:flex-col lg:justify-between"
    >
      <div className="bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,#000_20%,transparent_75%)] bg-[size:48px_48px]" />

      <p className="text-muted-foreground relative font-mono text-xs tracking-wider uppercase">{AUTH_PANEL.eyebrow}</p>

      <div className="relative">
        <div className="max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">{AUTH_PANEL.headline}</h2>
          <p className="text-muted-foreground mt-3 text-pretty">{AUTH_PANEL.description}</p>
        </div>

        <div className="bg-card mt-10 max-w-xl overflow-hidden rounded-xl border">
          <div className="text-muted-foreground flex items-center justify-between border-b px-4 py-3 font-mono text-xs tracking-wider uppercase">
            <span>Documentación · próximos vencimientos</span>
            <span>Datos de ejemplo</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left font-mono text-xs tracking-wider uppercase">
                <th className="px-4 py-2.5 font-medium">Legajo</th>
                <th className="px-4 py-2.5 font-medium">Documento</th>
                <th className="px-4 py-2.5 font-medium">Vence</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row) => (
                <tr key={row.file} className="border-t">
                  <td className="px-4 py-2.5 font-mono">{row.file}</td>
                  <td className="text-muted-foreground px-4 py-2.5">{row.document}</td>
                  <td className="px-4 py-2.5 font-mono">{row.due}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={row.variant}>{row.state}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-muted-foreground relative flex gap-5 font-mono text-xs tracking-wider uppercase">
        <span>● Vigente</span>
        <span>● Por vencer</span>
        <span>● Vencido</span>
      </div>
    </aside>
  );
}
