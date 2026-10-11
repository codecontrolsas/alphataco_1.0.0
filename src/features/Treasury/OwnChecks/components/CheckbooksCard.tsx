'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';
import { retireCheckbook, type CheckbookRow } from '../../actions/own-checks.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { CHECKBOOK_STATUS_LABELS, type CheckbookStatus } from '../../lib/own-check-transitions';
import { NewCheckbookDialog } from './NewCheckbookDialog';
import { VoidCheckNumberDialog } from './VoidCheckNumberDialog';

const STATUS_BADGE: Record<CheckbookStatus, 'default' | 'secondary' | 'outline'> = {
  ACTIVE: 'default',
  EXHAUSTED: 'secondary',
  RETIRED: 'outline',
};

/** Chequeras de la empresa con su uso (spec Tesorería etapa 3b §4.2): alta, números inutilizados y baja. */
export function CheckbooksCard({ checkbooks, can }: { checkbooks: CheckbookRow[]; can: { create: boolean; retire: boolean } }) {
  const [voiding, setVoiding] = useState<CheckbookRow | null>(null);
  const [retiring, setRetiring] = useState<CheckbookRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Chequeras</CardTitle>
          <CardDescription>Los cheques físicos salen de una chequera; los e-cheqs llevan el número que da el banco.</CardDescription>
        </div>
        {can.create && <NewCheckbookDialog />}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {checkbooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay chequeras. Cargá la primera para pagar con cheques físicos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Números</TableHead>
                <TableHead className="text-right">Usados</TableHead>
                <TableHead className="text-right">Libres</TableHead>
                <TableHead>Próximo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkbooks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.account.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {c.firstNumber} al {c.lastNumber}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.used}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.free}</TableCell>
                  <TableCell className="font-mono text-xs">{c.status === 'ACTIVE' ? c.nextNumber : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]} title={c.retireReason ?? undefined}>
                      {CHECKBOOK_STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
                    {can.create && c.status === 'ACTIVE' && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setVoiding(c)}>
                        Inutilizar número
                      </Button>
                    )}
                    {can.retire && c.status !== 'RETIRED' && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRetiring(c)}>
                        Dar de baja
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {voiding && <VoidCheckNumberDialog open onOpenChange={(open) => !open && setVoiding(null)} checkbook={voiding} />}
      {retiring && (
        <CancelReasonDialog
          open
          onOpenChange={(open) => !open && setRetiring(null)}
          title={`Dar de baja la chequera del ${retiring.firstNumber} al ${retiring.lastNumber}`}
          description="Sus números libres dejan de ofrecerse al pagar. Los cheques ya emitidos no cambian."
          successMessage="Chequera dada de baja"
          confirmLabel="Dar de baja"
          run={(reason) => retireCheckbook(retiring.id, reason)}
        />
      )}
    </Card>
  );
}
