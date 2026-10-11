'use client';

import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WITHHOLDING_TAXES } from '@/features/Purchases/schemas/payment-settings';
import { FileText, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { CERTIFICATE_MAX_BYTES, CUSTOMER_WITHHOLDING_TAX_LABELS, type ReceiptFormValues } from '../../schemas/receipts';
import type { PendingCertificates } from './ReceiptEditor';

/**
 * Retenciones que practicó el cliente: impuesto, jurisdicción (IIBB), certificado y el PDF. El
 * PDF es opcional y se sube al guardar; también se puede adjuntar después desde el recibo.
 */
export function ReceiptWithholdingsSection({
  form,
  rows,
  files,
  certificates,
  onCertificate,
}: {
  form: UseFormReturn<ReceiptFormValues>;
  rows: UseFieldArrayReturn<ReceiptFormValues, 'withholdings'>;
  /** Certificados ya guardados, por id de retención. */
  files: Record<string, { name: string; url: string }>;
  certificates: PendingCertificates;
  onCertificate: (rowId: string, file: File | null) => void;
}) {
  const today = moment().format('YYYY-MM-DD');

  const pick = (rowId: string, file: File | undefined) => {
    if (!file) return onCertificate(rowId, null);
    if (file.type !== 'application/pdf') return toast.error('El certificado tiene que ser un PDF');
    if (file.size > CERTIFICATE_MAX_BYTES) return toast.error('El archivo supera los 10 MB');
    onCertificate(rowId, file);
  };

  return (
    <div className="space-y-3">
      {rows.fields.length === 0 && <p className="text-sm text-muted-foreground">Sin retenciones.</p>}
      {rows.fields.map((row, i) => {
        const tax = form.watch(`withholdings.${i}.tax`);
        const savedId = form.watch(`withholdings.${i}.id`);
        const saved = savedId ? files[savedId] : undefined;
        const pending = certificates[row.id];
        return (
          <div key={row.id} className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_10rem_9rem_auto] sm:items-end">
              <FormField
                control={form.control}
                name={`withholdings.${i}.tax`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impuesto</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== 'IIBB') form.setValue(`withholdings.${i}.jurisdiction`, '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WITHHOLDING_TAXES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {CUSTOMER_WITHHOLDING_TAX_LABELS[t]}
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
                name={`withholdings.${i}.jurisdiction`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jurisdicción</FormLabel>
                    <FormControl>
                      <Input placeholder={tax === 'IIBB' ? 'Neuquén' : 'Solo IIBB'} disabled={tax !== 'IIBB'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`withholdings.${i}.certificateNumber`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° de certificado</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`withholdings.${i}.certificateDate`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                        setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`withholdings.${i}.amount`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importe</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" className="text-right tabular-nums" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Quitar la retención"
                onClick={() => {
                  onCertificate(row.id, null);
                  rows.remove(i);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <FileText className="h-4 w-4" />
                {pending || saved ? 'Reemplazar certificado (PDF)' : 'Adjuntar certificado (PDF)'}
                <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => pick(row.id, e.target.files?.[0])} />
              </label>
              {pending ? (
                <span className="text-muted-foreground">{pending.name} · se sube al guardar</span>
              ) : saved ? (
                <a href={saved.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  {saved.name}
                </a>
              ) : (
                <span className="text-muted-foreground">Sin certificado: se puede adjuntar después.</span>
              )}
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => rows.append({ id: '', tax: 'IIBB', jurisdiction: 'Neuquén', certificateNumber: '', certificateDate: today, amount: '' })}
      >
        <Plus className="mr-1 h-4 w-4" />
        Agregar retención
      </Button>
    </div>
  );
}
