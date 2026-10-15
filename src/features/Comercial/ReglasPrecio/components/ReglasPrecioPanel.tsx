'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  runPriceUpdateRule,
  setPriceUpdateRuleActive,
  type ContractOption,
  type PriceUpdateRuleRow,
} from '@/features/Empresa/Clientes/actions/price-rules.server';
import { PRICE_METHOD_LABELS } from '@/features/Empresa/Clientes/lib/price-method-labels';
import { indexConfigSchema, polynomialConfigSchema } from '@/features/Empresa/Clientes/schemas/price-rule';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PriceRuleFormDialog } from './PriceRuleFormDialog';

interface ReglasPrecioPanelProps {
  rules: PriceUpdateRuleRow[];
  /** Contratos para elegir el alcance al crear o editar una regla. */
  contracts: ContractOption[];
}

/**
 * Reglas de actualización de precios.
 *
 * La regla guarda la ESTRUCTURA (qué índice, qué componentes y con qué peso). Los coeficientes
 * de cada período se piden al ejecutarla: son del momento, no de la regla — si el combustible
 * subió 12% este trimestre, ese 12% no pertenece a la fórmula sino a esta corrida.
 */
export function ReglasPrecioPanel({ rules, contracts }: ReglasPrecioPanelProps) {
  const [running, setRunning] = useState<PriceUpdateRuleRow | null>(null);
  const [validFrom, setValidFrom] = useState(argentinaDate());
  const [coefficient, setCoefficient] = useState('');
  const [coefficients, setCoefficients] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const { hasPermission } = usePermissions();

  const canUpdate = hasPermission('comercial', 'reglas-precio', 'update');
  const canCreate = hasPermission('comercial', 'reglas-precio', 'create');
  const canUpdatePrices = hasPermission('comercial', 'items-contrato', 'update_prices');

  const componentsOf = (rule: PriceUpdateRuleRow) => {
    const parsed = polynomialConfigSchema.safeParse(rule.config);
    return parsed.success ? parsed.data.components : [];
  };

  const indexNameOf = (rule: PriceUpdateRuleRow) => {
    const parsed = indexConfigSchema.safeParse(rule.config);
    return parsed.success ? parsed.data.indexName : null;
  };

  const openRun = (rule: PriceUpdateRuleRow) => {
    setRunning(rule);
    setCoefficient('');
    setCoefficients(Object.fromEntries(componentsOf(rule).map((c) => [c.name, ''])));
    setNote('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Reglas de actualización de precios</h3>
          <p className="text-muted-foreground text-sm">
            Una regla sin contrato aplica a toda la empresa. Los coeficientes se cargan al ejecutarla.
          </p>
        </div>
        {canCreate && <PriceRuleFormDialog contracts={contracts} triggerLabel="Nueva regla" />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Alcance</TableHead>
            <TableHead className="text-right">Corridas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                Todavía no hay reglas cargadas.{canCreate && ' Creá la primera con "Nueva regla".'}
              </TableCell>
            </TableRow>
          )}
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell className="font-medium">{rule.name}</TableCell>
              <TableCell>
                {PRICE_METHOD_LABELS[rule.method]}
                {rule.method === 'index' && indexNameOf(rule) && (
                  <span className="text-muted-foreground ml-2 text-xs">({indexNameOf(rule)})</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {rule.customer_services
                  ? `${rule.customer_services.customers?.name ?? 'Cliente sin asignar'} · ${rule.customer_services.service_name ?? 'Sin nombre'}`
                  : 'Toda la empresa'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{rule._count.runs}</TableCell>
              <TableCell>
                <Badge variant={rule.is_active ? 'outline' : 'secondary'}>
                  {rule.is_active ? 'Activa' : 'Desactivada'}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {canUpdate && (
                  <PriceRuleFormDialog rule={rule} contracts={contracts} triggerLabel="Editar" triggerVariant="ghost" />
                )}
                {rule.is_active && rule.method !== 'manual' && canUpdatePrices && (
                  <Button type="button" size="sm" disabled={pending} onClick={() => openRun(rule)}>
                    Ejecutar
                  </Button>
                )}
                {canUpdate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await setPriceUpdateRuleActive(rule.id, !rule.is_active);
                        if (!result.ok) toast.error(result.error);
                        else toast.success(rule.is_active ? 'Regla desactivada' : 'Regla activada');
                      })
                    }
                  >
                    {rule.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!running} onOpenChange={(open) => !open && setRunning(null)}>
        <DialogContent className="sm:max-w-[520px]">
          {running && (
            <>
              <DialogHeader>
                <DialogTitle>Ejecutar: {running.name}</DialogTitle>
                <DialogDescription>
                  Se crea una revisión por ítem alcanzado, con el precio anterior guardado. Las certificaciones ya
                  emitidas no cambian: su precio quedó congelado al emitirlas.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="valid-from">Vigente desde</Label>
                  <Input id="valid-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>

                {running.method === 'index' && (
                  <div className="space-y-2">
                    <Label htmlFor="coef">Coeficiente del período</Label>
                    <Input
                      id="coef"
                      inputMode="decimal"
                      placeholder="1.15 = subió 15%"
                      value={coefficient}
                      onChange={(e) => setCoefficient(e.target.value)}
                    />
                  </div>
                )}

                {running.method === 'polynomial' &&
                  componentsOf(running).map((component) => (
                    <div key={component.name} className="space-y-2">
                      <Label htmlFor={`coef-${component.name}`}>
                        {component.name}{' '}
                        <span className="text-muted-foreground text-xs">(peso {component.weight})</span>
                      </Label>
                      <Input
                        id={`coef-${component.name}`}
                        inputMode="decimal"
                        placeholder="1.12"
                        value={coefficients[component.name] ?? ''}
                        onChange={(e) => setCoefficients((prev) => ({ ...prev, [component.name]: e.target.value }))}
                      />
                    </div>
                  ))}

                <div className="space-y-2">
                  <Label htmlFor="note">Nota</Label>
                  <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRunning(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await runPriceUpdateRule({
                        ruleId: running.id,
                        validFrom,
                        coefficient: coefficient || undefined,
                        coefficients,
                        note,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(`Se actualizaron ${result.data.items} ítems`);
                      setRunning(null);
                    })
                  }
                >
                  Ejecutar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
