'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Logger } from '@/lib/logger';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { createAdjustmentDraft } from '../../actions/invoice-drafts-create.server';
import type { AdjustmentInput } from '../../schemas/invoice';
import { invoiceHref } from '../../utils/invoice-links';

const logger = new Logger('features/Comercial/Facturacion/AdjustmentActions');

type Option = {
  kind: AdjustmentInput['kind'];
  mode: AdjustmentInput['mode'];
  label: string;
  description: string;
  disabledReason: string | null;
};

/**
 * Notas de crédito y débito sobre un comprobante autorizado. Un solo menú (sin modales
 * encadenados): cada opción crea el borrador de la nota y abre su editor.
 */
export function AdjustmentActions({
  invoiceId,
  voucherLabel,
  canCredit,
  totalCreditBlockedReason,
}: {
  invoiceId: string;
  voucherLabel: string;
  /** Se puede acreditar (no es una NC y no está acreditado por completo). */
  canCredit: boolean;
  /** Por qué no se ofrece la NC total (ya hubo NC), o `null`. */
  totalCreditBlockedReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const options: Option[] = [
    ...(canCredit
      ? [
          {
            kind: 'credit_note' as const,
            mode: 'total' as const,
            label: 'Nota de crédito total',
            description: `Anula ${voucherLabel} por el total.`,
            disabledReason: totalCreditBlockedReason,
          },
          {
            kind: 'credit_note' as const,
            mode: 'partial' as const,
            label: 'Nota de crédito parcial',
            description: 'Acredita una parte: cargás las líneas.',
            disabledReason: null,
          },
        ]
      : []),
    {
      kind: 'debit_note',
      mode: 'partial',
      label: 'Nota de débito',
      description: 'Intereses, diferencias o ajustes: cargás las líneas.',
      disabledReason: null,
    },
  ];

  const create = (option: Option) => {
    if (option.disabledReason || pending) return;
    startTransition(async () => {
      const result = await createAdjustmentDraft({
        originalInvoiceId: invoiceId,
        kind: option.kind,
        mode: option.mode,
      });
      if (!result.ok) {
        logger.warn('No se creó la nota', { data: { invoiceId, error: result.error } });
        toast.error(`No se creó la nota: ${result.error}`);
        return;
      }
      toast.success(`Borrador de ${option.label.toLowerCase()} creado sobre ${voucherLabel}.`);
      router.push(invoiceHref(result.data.id));
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={pending}>
          <LoadingSwap isLoading={pending}>
            <span className="inline-flex items-center gap-2">
              Nota de crédito o débito
              <ChevronDown className="size-4" aria-hidden />
            </span>
          </LoadingSwap>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Sobre {voucherLabel}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuItem
              key={`${option.kind}-${option.mode}`}
              aria-disabled={option.disabledReason !== null}
              className="flex flex-col items-start gap-0.5 aria-disabled:opacity-50"
              onSelect={(event) => {
                if (option.disabledReason) {
                  event.preventDefault();
                  return;
                }
                create(option);
              }}
            >
              <span>{option.label}</span>
              <span className="text-muted-foreground text-xs text-pretty">
                {option.disabledReason ?? option.description}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
