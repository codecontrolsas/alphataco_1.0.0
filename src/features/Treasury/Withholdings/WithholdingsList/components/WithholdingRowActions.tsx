'use client';

import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../../schemas/receipts';
import type { WithholdingListItem } from '../actions.server';
import { AttachCertificateDialog } from './AttachCertificateDialog';

/** Adjuntar o reemplazar el certificado. La fila decide si se muestra según `tesoreria:retenciones-sufridas:update`. */
export function WithholdingRowActions({ withholding }: { withholding: WithholdingListItem }) {
  const [open, setOpen] = useState(false);
  const replacing = withholding.certificateUrl != null;
  const description = `${CUSTOMER_WITHHOLDING_TAX_LABELS[withholding.tax]} ${withholding.certificateNumber} — ${withholding.customer.name}`;

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setOpen(true)}>
        <Paperclip className="h-3.5 w-3.5" />
        {replacing ? 'Reemplazar' : 'Adjuntar certificado'}
      </Button>
      <AttachCertificateDialog
        withholdingId={withholding.id}
        description={description}
        replacing={replacing}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
