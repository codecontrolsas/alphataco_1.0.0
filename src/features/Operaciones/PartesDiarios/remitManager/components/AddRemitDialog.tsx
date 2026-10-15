'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileText, Info, Loader2 } from 'lucide-react';
import React from 'react';
import { useCreateRemito } from '../hooks/useRemitos';
import { AddRemitDialogProps } from '../types';

export function AddRemitDialog({
  dailyReportRowId,
  isOpen,
  onClose,
  existingNumbers,
  onRemitoCreated,
}: AddRemitDialogProps) {
  const [remitNumber, setRemitNumber] = React.useState('');
  const [error, setError] = React.useState('');

  const createRemito = useCreateRemito(dailyReportRowId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!remitNumber.trim()) {
      setError('El número de remito es requerido');
      return;
    }

    if (existingNumbers.includes(remitNumber.trim())) {
      setError('Ya existe un remito con este número');
      return;
    }

    try {
      const newRemito = await createRemito.mutateAsync(remitNumber.trim());
      if (onRemitoCreated) {
        onRemitoCreated(newRemito.id);
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Error al crear el remito');
    }
  };

  const handleClose = () => {
    setRemitNumber('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="bg-muted text-muted-foreground rounded-lg p-2">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-xl">Agregar remito</DialogTitle>
              <p className="text-muted-foreground mt-1 text-sm">El número del remito que respalda este servicio.</p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-3">
            <Label htmlFor="remitNumber" className="text-sm font-semibold">
              Número de remito <span className="text-destructive">*</span>
            </Label>
            <Input
              id="remitNumber"
              value={remitNumber}
              onChange={(e) => setRemitNumber(e.target.value)}
              placeholder="Ej: 12345 o ABC-001"
              autoFocus
              disabled={createRemito.isPending}
              className="h-11 font-mono text-base tabular-nums"
            />
            <p className="text-muted-foreground text-xs">No puede repetirse dentro de la misma línea.</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert variant="info">
            <Info />
            <AlertDescription>Los documentos se suben después de crear el remito.</AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createRemito.isPending}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={createRemito.isPending || !remitNumber.trim()}
              aria-busy={createRemito.isPending}
              className="flex-1 sm:flex-none"
            >
              {createRemito.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Crear remito
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
