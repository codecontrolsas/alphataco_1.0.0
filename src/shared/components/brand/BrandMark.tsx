import { cn } from '@/lib/utils';

/**
 * Isotipo de la plataforma. Toma los colores del theme (`foreground`, `background`, `brand`), así
 * que al cambiar la marca de una instancia en `globals.css` el isotipo la sigue sin tocar el SVG.
 * Cuando haya un logo propio de la instancia, se reemplaza acá (ver `shared/lib/branding.ts`).
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={cn('shrink-0', className)}>
      <path d="M0 0H36L48 12V48H0Z" className="fill-foreground" />
      <path d="M38 0H48V10Z" className="fill-brand" />
      <path
        d="M36 14 C32 20 28 34 20 34 C15 34 12 30 12 24.5 C12 19 15.5 15 20.5 15 C27 15 29 27 36 35"
        fill="none"
        strokeWidth="4.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="stroke-background"
      />
    </svg>
  );
}
