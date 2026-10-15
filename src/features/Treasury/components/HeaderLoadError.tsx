/** Aviso discreto cuando no se pudo calcular el encabezado: la tabla de abajo sigue funcionando. */
export function HeaderLoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="text-muted-foreground text-sm">
      No se pudo cargar {what}. La tabla de abajo sigue disponible.
    </p>
  );
}
