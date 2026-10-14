/**
 * Resaltado de filas del detalle del parte. Única fuente para `rowClassName` de la tabla y para la
 * leyenda, así cada color de fila tiene su explicación. Clases escritas completas (Tailwind v4).
 */
export const ROW_HIGHLIGHT_CLASSES = {
  /** La fila fue editada desde Comercial. */
  commercialEdit: 'bg-blue-100 dark:bg-blue-900/30',
  /** La fila se cargó después de la fecha del parte. */
  lateCreated: 'bg-yellow-100 dark:bg-yellow-900/30',
} as const;

export const ROW_HIGHLIGHT_LEGEND: { swatch: string; label: string }[] = [
  {
    swatch: 'border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30',
    label: 'Editada desde Comercial',
  },
  {
    swatch: 'border-yellow-300 bg-yellow-100 dark:border-yellow-700 dark:bg-yellow-900/30',
    label: 'Cargada después de la fecha del parte',
  },
];
