'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { importStatement } from '../../actions/reconciliation.server';
import { formatInCurrency } from '../../lib/currency-format';
import { invalidateTreasury } from '../../lib/invalidate';
import { STATEMENT_DATE_FORMATS, buildStatementLines, columnLetter } from '../../lib/statement-parse';
import { MAX_STATEMENT_ROWS, statementProfileSchema, type StatementProfileValues } from '../../schemas/reconciliation';
import { readStatementFile, rowsAsText, type RawRows } from './read-statement-file';

const logger = new Logger('Treasury/ImportStatementDialog');

const DEFAULT_PROFILE: StatementProfileValues = {
  headerRow: 1,
  dateColumn: 'A',
  descriptionColumn: 'B',
  referenceColumn: '',
  amountMode: 'SINGLE',
  amountColumn: 'C',
  debitColumn: '',
  creditColumn: '',
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: ',',
};

const dmy = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

/**
 * Importar un extracto (spec Tesorería etapa 4 §3.1): un solo diálogo con el archivo, el perfil de
 * columnas de la cuenta (se recuerda) y la vista previa de las líneas tal como van a quedar.
 */
export function ImportStatementDialog({ account, profile }: { account: { id: string; name: string }; profile: StatementProfileValues | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; rows: RawRows } | null>(null);
  const [reading, setReading] = useState(false);
  const form = useForm<StatementProfileValues>({
    resolver: zodResolver(statementProfileSchema),
    defaultValues: profile ?? DEFAULT_PROFILE,
  });
  const values = useWatch({ control: form.control });
  const amountMode = values.amountMode ?? 'SINGLE';

  const preview = useMemo(() => {
    if (!file) return null;
    const parsed = statementProfileSchema.safeParse(values);
    if (!parsed.success) return null;
    const p = parsed.data;
    return buildStatementLines(rowsAsText(file.rows, p.decimalSeparator), {
      headerRow: p.headerRow,
      dateColumn: p.dateColumn,
      descriptionColumn: p.descriptionColumn,
      referenceColumn: p.referenceColumn || null,
      amountColumn: p.amountMode === 'SINGLE' ? p.amountColumn : null,
      debitColumn: p.amountMode === 'SPLIT' ? p.debitColumn : null,
      creditColumn: p.amountMode === 'SPLIT' ? p.creditColumn : null,
      dateFormat: p.dateFormat,
      decimalSeparator: p.decimalSeparator,
    });
  }, [file, values]);

  // La vista previa arranca un poco antes del encabezado: con logo o preámbulo, el encabezado puede estar en la fila 10 o más abajo.
  const previewStart = Math.max(0, (Number(values.headerRow) || 1) - 3);
  const columns = useMemo(() => Math.max(0, ...(file?.rows.slice(0, 200).map((r) => r.length) ?? [0])), [file]);

  const chooseFile = async (selected: File | undefined) => {
    if (!selected) return;
    setReading(true);
    try {
      const rows = await readStatementFile(selected);
      if (rows.length > MAX_STATEMENT_ROWS + 100) throw new Error(`El archivo tiene más de ${MAX_STATEMENT_ROWS} filas: partilo en varios`);
      setFile({ name: selected.name, rows });
    } catch (error) {
      logger.error('Error al leer el extracto', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo leer el archivo');
      setFile(null);
    } finally {
      setReading(false);
    }
  };

  const save = useMutation({
    mutationFn: async (p: StatementProfileValues) => {
      if (!file) throw new Error('Elegí el archivo');
      return unwrapAction(await importStatement({ accountId: account.id, fileName: file.name, profile: p, rows: rowsAsText(file.rows, p.decimalSeparator) }));
    },
    onSuccess: (result) => {
      const parts = [`${result.imported} ${result.imported === 1 ? 'línea importada' : 'líneas importadas'}`];
      if (result.matched > 0) parts.push(`${result.matched} conciliadas solas`);
      if (result.skipped > 0) parts.push(`${result.skipped} ya estaban importadas`);
      toast.success(parts.join(' · '));
      invalidateTreasury(queryClient);
      router.refresh();
      setFile(null);
      setOpen(false);
    },
    onError: (error) => {
      logger.error('Error al importar el extracto', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo importar el extracto');
    },
  });

  const columnField = (name: 'dateColumn' | 'descriptionColumn' | 'referenceColumn' | 'amountColumn' | 'debitColumn' | 'creditColumn', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input className="uppercase" maxLength={3} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const canImport = Boolean(file && preview && preview.errors.length === 0 && preview.lines.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <FileUp className="mr-1 h-4 w-4" />
        Importar extracto
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar extracto · {account.name}</DialogTitle>
          <DialogDescription>Subí el Excel (.xlsx) o CSV que bajaste del home banking. El archivo se lee en tu navegador y no se guarda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={fileId}>Archivo</Label>
          <Input id={fileId} type="file" accept=".xlsx,.csv,.txt" disabled={reading} onChange={(e) => void chooseFile(e.target.files?.[0])} />
          {reading && <p className="text-sm text-muted-foreground">Leyendo el archivo…</p>}
        </div>

        {file && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Filas del archivo desde el encabezado ({file.rows.length} en total)</p>
              <div className="max-h-48 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Fila</TableHead>
                      {Array.from({ length: columns }, (_, i) => (
                        <TableHead key={i} className="font-mono">
                          {columnLetter(i)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {file.rows.slice(previewStart, previewStart + 10).map((row, i) => (
                      <TableRow key={previewStart + i}>
                        <TableCell className="text-muted-foreground tabular-nums">{previewStart + i + 1}</TableCell>
                        {Array.from({ length: columns }, (_, c) => (
                          <TableCell key={c} className="max-w-[12rem] truncate text-xs">
                            {rowsAsText([[row[c] ?? '']], values.decimalSeparator ?? ',')[0]![0]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}

        <Separator />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <p className="text-sm font-medium">Columnas del extracto (se recuerdan para esta cuenta)</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="headerRow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fila del encabezado</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {columnField('dateColumn', 'Fecha')}
              {columnField('descriptionColumn', 'Descripción')}
              {columnField('referenceColumn', 'Referencia (opcional)')}
            </div>
            <FormField
              control={form.control}
              name="amountMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importe</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-6">
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="SINGLE" />
                        </FormControl>
                        <FormLabel className="font-normal">Una columna con signo</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="SPLIT" />
                        </FormControl>
                        <FormLabel className="font-normal">Débito y crédito separados</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-4">
              {amountMode === 'SINGLE' ? (
                columnField('amountColumn', 'Columna del importe')
              ) : (
                <>
                  {columnField('debitColumn', 'Débitos')}
                  {columnField('creditColumn', 'Créditos')}
                </>
              )}
              <FormField
                control={form.control}
                name="dateFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formato de fecha</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATEMENT_DATE_FORMATS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decimalSeparator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Separador decimal</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value=",">Coma (1.234,56)</SelectItem>
                        <SelectItem value=".">Punto (1,234.56)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {preview && (
              <div className="space-y-2">
                <Separator />
                {preview.errors.length > 0 ? (
                  <div role="status" className="space-y-1 text-sm text-red-600 dark:text-red-400">
                    {preview.errors.slice(0, 5).map((e) => (
                      <p key={e}>{e}</p>
                    ))}
                    {preview.errors.length > 5 && <p>y {preview.errors.length - 5} errores más. Revisá las columnas y el formato.</p>}
                  </div>
                ) : (
                  <p role="status" className="text-sm text-muted-foreground tabular-nums">
                    {preview.lines.length} {preview.lines.length === 1 ? 'línea' : 'líneas'} para importar
                  </p>
                )}
                {preview.lines.length > 0 && (
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.lines.slice(0, 10).map((l) => (
                          <TableRow key={l.key}>
                            <TableCell className="tabular-nums">{dmy(l.date)}</TableCell>
                            <TableCell>{l.description}</TableCell>
                            <TableCell>{l.reference}</TableCell>
                            <TableCell className={`text-right tabular-nums ${l.amountCents < BigInt(0) ? 'text-red-600 dark:text-red-400' : ''}`}>
                              {formatInCurrency((Number(l.amountCents) / 100).toFixed(2), 'ARS')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending || !canImport}>
                {save.isPending ? 'Importando…' : 'Importar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
