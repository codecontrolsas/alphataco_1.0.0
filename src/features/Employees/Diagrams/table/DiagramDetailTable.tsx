'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTablePagination } from '@/features/Formularios/components/tables/data-table-pagination';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, FileDown, History } from 'lucide-react';
import moment from 'moment';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { DataTableToolbarDiagramDetail } from './DataTableToolbarDiagramDetail';
/** Fila del historial (`diagrams_logs` ya formateado por `EmployeeDiagramsSection`). */
export interface DiagramHistoryRow {
  /** DD/MM/YYYY */
  date: string;
  description: string;
  status: string;
  previousStatus: string;
  modifiedBy?: string;
  modifiedAt: string;
  type: 'modified' | 'created';
}

/** Lo que la tabla necesita de cada novedad además de las columnas: fecha (clave) y color. */
interface DiagramRowBase {
  created_at: string;
  color?: string;
  short_description?: string;
  name?: string;
  comments?: string | null;
}

interface DataTableProps<TData extends DiagramRowBase, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  historyData: DiagramHistoryRow[];
}

export function DiagramDetailTable<TData extends DiagramRowBase, TValue>({
  columns,
  data,
  historyData,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'Fecha', desc: true }, // id del campo de fecha
  ]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [datePickerKey, setDatePickerKey] = useState(0);

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  // Historial filtrado por la fecha elegida y por las novedades seleccionadas en la grilla:
  // estado derivado (useMemo), no un useEffect que lo copie a otro estado.
  const filteredHistoryData = useMemo(() => {
    let filtered = historyData;

    if (selectedDate) {
      const formattedSelectedDate = moment(selectedDate).format('DD/MM/YYYY');
      filtered = filtered.filter((item) => item.date === formattedSelectedDate);
    }

    if (selectedRows.length > 0) {
      const selectedDates = selectedRows.map((date) => moment(date).format('DD/MM/YYYY'));
      filtered = filtered.filter((item) => selectedDates.includes(item.date));
    }

    return filtered;
  }, [historyData, selectedDate, selectedRows]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const totalPages = Math.ceil(filteredHistoryData.length / itemsPerPage);
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1); // Resetear a la primera página cuando se cambia la cantidad de elementos por página
  };

  const handlePreviousPage = () => {
    setCurrentPage((prevPage) => Math.max(prevPage - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prevPage) => Math.min(prevPage + 1, totalPages));
  };

  const paginatedData = filteredHistoryData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleRowClick = (created_at: string) => {
    setSelectedRows((prevSelectedRows) => {
      if (prevSelectedRows.includes(created_at)) {
        return prevSelectedRows.filter((row) => row !== created_at);
      } else {
        return [...prevSelectedRows, created_at];
      }
    });
  };

  const createAndDownloadFile = (rows: TData[]) => {
    const dataToDownload = rows.map((row) => ({
      Fecha: moment(row.created_at).format('DD/MM/YYYY'),
      Turno: row.short_description ?? '',
      Novedad: row.name ?? '',
      Comentario: row.comments ?? '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToDownload);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Novedades');

    XLSX.writeFile(workbook, `Novedades-${moment().format('YYYYMMDD')}.xlsx`, { compression: true });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
      <div className="space-y-4 col-span-5">
        <DataTableToolbarDiagramDetail table={table} />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => {
                  const isSelected = selectedRows.includes(row.original.created_at);
                  return (
                    <TableRow
                      key={row.id}
                      className="hover:cursor-pointer"
                      style={{
                        color: row.original.color,
                        opacity: selectedRows?.length > 0 && !isSelected ? 0.5 : 1,
                      }}
                      data-state={isSelected && 'selected'}
                      onClick={() => handleRowClick(row.original.created_at)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns?.length} className="h-24 text-center">
                    Sin resultados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {/* <BtnXlsDownload dataToDownload={data} nameFile="data" fn={createAndDownloadFile} /> */}
        <Button
          type="button"
          variant={'outline'}
          size={'icon'}
          onClick={(e) => {
            e.preventDefault();
            createAndDownloadFile(data);
          }}
        >
          <FileDown />
        </Button>
        <DataTablePagination table={table} />
      </div>
      <div className="col-span-5 mt-3">
        <Card className="w-full">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 w-full">
            <div className="flex items-center space-x-2">
              <CardTitle className="text-xl font-bold">Historial</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger type="button">
                    <History className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Historial de cambios en horarios</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Date Picker */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* `key`: el picker guarda su texto internamente; al limpiar se remonta para vaciarlo. */}
              <EnhancedDatePicker
                key={datePickerKey}
                date={selectedDate || undefined}
                setDate={(date) => setSelectedDate(date ?? null)}
                aria-label="Filtrar por fecha"
                placeholder="Filtrar por fecha (DD/MM/YYYY)"
                className="w-[260px]"
              />
              {selectedDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDate(null);
                    setDatePickerKey((key) => key + 1);
                  }}
                >
                  Limpiar
                </Button>
              )}
            </div>

            {/* Bloque Derecho */}
            <div className="w-full md:w-auto">
              <Select defaultValue="10" onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-[70px]">
                  <SelectValue placeholder="20" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Estado Anterior</TableHead>
                  <TableHead>Modificado Por</TableHead>
                  <TableHead>Fecha Modificación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...paginatedData]
                  .sort((a, b) => {
                    const dateA = moment(a.date, 'DD/MM/YYYY');
                    const dateB = moment(b.date, 'DD/MM/YYYY');
                    return dateB.diff(dateA); // Orden descendente (más nuevo primero)
                  })
                  .map((row, index) => (
                    <TableRow
                      key={`${row.date}-${index}`}
                      className={
                        row.description === 'MD'
                          ? 'bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/20 dark:hover:bg-pink-950/30'
                          : ''
                      }
                    >
                      <TableCell className="font-medium">{row.date}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.description === 'MD'
                              ? 'border-pink-500 text-pink-700 dark:text-pink-400'
                              : 'border-blue-500 text-blue-700 dark:text-blue-400'
                          }
                        >
                          {row.description}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>
                        {row.previousStatus !== 'Nuevo' ? (
                          <span className="text-muted-foreground">{row.previousStatus}</span>
                        ) : (
                          <Badge variant="secondary">Nuevo</Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.modifiedBy}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{row.modifiedAt} </span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between space-x-2 py-4">
              <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
