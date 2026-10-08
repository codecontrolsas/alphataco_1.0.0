import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/shared/components/feedback/EmptyState';

const logger = new Logger('SimpleTable');

/** Tope de la guardia D7: más filas que esto es un conjunto que crece y va a DataTable paginado. */
const BOUNDED_ROWS_LIMIT = 200;

type SimpleColumnKind = 'text' | 'number' | 'code' | 'date';
type SimpleTableMobileLayout = 'scroll' | 'stack';

interface SimpleColumn<T> {
  id: string;
  header: string;
  /** Las celdas nulas las resuelve el consumidor (devolver `—`). */
  cell: (row: T) => React.ReactNode;
  /** `number`: derecha + tabular · `code`: `.data-code` · `date`: tabular. Default `text`. */
  kind?: SimpleColumnKind;
  /** Ancho u otros ajustes con clase literal (`'w-32'`). Se aplica al encabezado y a las celdas. */
  className?: string;
}

interface SimpleTableProps<T> {
  /** Nombre accesible de la tabla (`<caption class="sr-only">`). */
  caption: string;
  columns: SimpleColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Contenido del `<tfoot>` (filas `TableRow` con totales). */
  footer?: React.ReactNode;
  /** Vacío propio; por defecto un `EmptyState` compacto genérico. */
  empty?: React.ReactNode;
  /** `scroll` (default): scroll horizontal con la primera columna fija · `stack`: filas como bloques label/valor, para ≤ 4 columnas. */
  mobileLayout?: SimpleTableMobileLayout;
}

const KIND_CLASSES: Record<SimpleColumnKind, string> = {
  text: '',
  number: 'text-right tabular-nums',
  code: 'data-code',
  date: 'tabular-nums',
};

const HEAD_KIND_CLASSES: Record<SimpleColumnKind, string> = {
  text: '',
  number: 'text-right',
  code: '',
  date: '',
};

// Clases por modo, escritas completas (Tailwind solo emite clases literales).
const LAYOUT_CLASSES: Record<
  SimpleTableMobileLayout,
  { table: string; header: string; section: string; row: string; cell: string; firstHead: string; firstCell: string }
> = {
  scroll: {
    table: '',
    header: '',
    section: '',
    row: '',
    cell: '',
    firstHead: 'sticky left-0 z-10 bg-muted @max-xl/simple-table:shadow-[inset_-1px_0_0_var(--border)]',
    firstCell: 'sticky left-0 z-10 bg-card @max-xl/simple-table:shadow-[inset_-1px_0_0_var(--border)]',
  },
  stack: {
    table: '@max-xl/simple-table:block',
    // Fuera de la vista pero en el árbol de accesibilidad: los encabezados siguen nombrando las celdas.
    header: '@max-xl/simple-table:sr-only',
    section: '@max-xl/simple-table:block',
    row: '@max-xl/simple-table:flex @max-xl/simple-table:h-auto @max-xl/simple-table:flex-col @max-xl/simple-table:gap-2 @max-xl/simple-table:px-3 @max-xl/simple-table:py-3',
    cell: '@max-xl/simple-table:flex @max-xl/simple-table:flex-col @max-xl/simple-table:gap-0.5 @max-xl/simple-table:p-0 @max-xl/simple-table:text-left @max-xl/simple-table:whitespace-normal @max-xl/simple-table:before:text-caption @max-xl/simple-table:before:text-muted-foreground @max-xl/simple-table:before:content-[attr(data-label)]',
    firstHead: '',
    firstCell: '',
  },
};

/**
 * Tabla de presentación para conjuntos ACOTADOS (líneas de una factura, puntos de venta, ítems de
 * una orden). Lo que crece va a DataTable con paginación en servidor (anexo D7 del plan).
 *
 * Los roles ARIA van explícitos (`table`/`rowgroup`/`row`/`columnheader`/`cell`) porque en
 * `mobileLayout="stack"` se cambia el `display` y el navegador descarta la semántica de tabla.
 *
 * Server Component (sin hooks). Recibe funciones (`cell`, `getRowKey`): usarla desde un server
 * component o desde un client component padre, nunca pasándole funciones de server a client.
 */
export function SimpleTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  footer,
  empty,
  mobileLayout = 'scroll',
}: SimpleTableProps<T>) {
  if (process.env.NODE_ENV !== 'production' && rows.length > BOUNDED_ROWS_LIMIT) {
    logger.warn('SimpleTable es para conjuntos acotados; usar DataTable con paginación en servidor', {
      data: { caption, rows: rows.length },
    });
  }

  const layout = LAYOUT_CLASSES[mobileLayout];

  return (
    <div data-slot="simple-table" data-mobile-layout={mobileLayout} className="@container/simple-table w-full">
      <Table role="table" containerClassName="overscroll-x-contain scroll-fade-end" className={cn('text-cell', layout.table)}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader role="rowgroup" className={layout.header}>
          <TableRow role="row" className="h-8 border-border-strong bg-muted hover:bg-muted">
            {columns.map((column, index) => (
              <TableHead
                key={column.id}
                role="columnheader"
                scope="col"
                className={cn(
                  'h-8 px-3 text-overline text-muted-foreground',
                  HEAD_KIND_CLASSES[column.kind ?? 'text'],
                  index === 0 ? layout.firstHead : null,
                  column.className
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup" className={layout.section}>
          {rows.length === 0 ? (
            <TableRow role="row" className="border-border hover:bg-transparent">
              <TableCell role="cell" colSpan={columns.length} className="px-3 py-0 whitespace-normal">
                {empty ?? (
                  <EmptyState size="compact" title="Sin registros" description="No hay filas para mostrar." />
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={getRowKey(row)}
                role="row"
                className={cn('h-9 border-border hover:bg-transparent', layout.row)}
              >
                {columns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    role="cell"
                    data-label={column.header}
                    className={cn(
                      'px-3 py-2',
                      KIND_CLASSES[column.kind ?? 'text'],
                      index === 0 ? layout.firstCell : null,
                      layout.cell,
                      column.className
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {footer ? (
          <TableFooter role="rowgroup" className={cn('border-border-strong bg-panel-2', layout.section)}>
            {footer}
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}

export type { SimpleColumn, SimpleColumnKind, SimpleTableMobileLayout, SimpleTableProps };
