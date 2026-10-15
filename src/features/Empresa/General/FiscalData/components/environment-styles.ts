import type { ARCA_ENVIRONMENTS } from '../schemas/fiscal-data';

/**
 * Badge del ambiente. Clases escritas completas (Tailwind v4 escanea el código como texto: una
 * clase armada por concatenación no se genera). Homologación en ámbar porque es "de prueba";
 * producción con el color de marca, como los estados confirmados de Certificaciones.
 */
export const ENVIRONMENT_BADGE_STYLES: Record<(typeof ARCA_ENVIRONMENTS)[number], string> = {
  homologacion: 'border-warn/40 bg-warn-subtle text-warn-subtle-foreground',
  produccion: 'bg-brand text-brand-foreground',
};
