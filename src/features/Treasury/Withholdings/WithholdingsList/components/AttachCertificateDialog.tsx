'use client';

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
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { attachWithholdingCertificate } from '../../../actions/withholdings.server';
import { invalidateTreasury } from '../../../lib/invalidate';

const logger = new Logger('Treasury/AttachCertificateDialog');

interface Props {
  withholdingId: string;
  /** Descripción corta de la retención, para el título del diálogo. */
  description: string;
  replacing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Adjunta (o reemplaza) el PDF del certificado de una retención sufrida. */
export function AttachCertificateDialog({ withholdingId, description, replacing, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async (selected: File) => {
      const formData = new FormData();
      formData.set('file', selected);
      return unwrapAction(await attachWithholdingCertificate(withholdingId, formData));
    },
    onSuccess: (result) => {
      toast.success(`Certificado ${replacing ? 'reemplazado' : 'adjuntado'}: ${result.name}`);
      invalidateTreasury(queryClient);
      router.refresh();
      setFile(null);
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al adjuntar el certificado', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo adjuntar el certificado');
    },
  });

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return;
    if (!next) setFile(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{replacing ? 'Reemplazar certificado' : 'Adjuntar certificado'}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`certificate-file-${withholdingId}`}>Certificado (PDF, hasta 10 MB)</Label>
          <Input
            id={`certificate-file-${withholdingId}`}
            type="file"
            accept="application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!file || mutation.isPending} onClick={() => file && mutation.mutate(file)}>
            {mutation.isPending ? 'Subiendo...' : replacing ? 'Reemplazar' : 'Adjuntar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
