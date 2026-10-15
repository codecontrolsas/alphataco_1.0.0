'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getSuppliersAttention } from '../actions.server';
import { EXPIRED_DOCUMENTS_HREF, SUPPLIERS_ATTENTION_QUERY_KEY } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getSuppliersAttention>>;

/**
 * Banda "proveedores activos con documentación vencida". El número es el del estado "Vencido" de la tabla
 * (solo documentos vigentes, no reemplazados) y se refresca tras cada cambio (la clave cuelga de la de la tabla,
 * así `invalidatePurchases` la invalida). La acción aplica el filtro equivalente a la lista.
 */
export function SuppliersAttention({ initialData }: { initialData: AttentionData }) {
  const { data } = useQuery({
    queryKey: SUPPLIERS_ATTENTION_QUERY_KEY,
    queryFn: getSuppliersAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const expired = data?.expiredDocuments ?? 0;
  if (expired === 0) return null;

  return (
    <AttentionBanner
      live
      tone="danger"
      title={`${expired} ${expired === 1 ? 'proveedor activo con documentación vencida' : 'proveedores activos con documentación vencida'}`}
      description="Tienen al menos un documento vigente cuya fecha de vencimiento ya pasó."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={EXPIRED_DOCUMENTS_HREF}>Ver {expired === 1 ? 'el proveedor' : `los ${expired} proveedores`}</Link>
        </Button>
      }
    />
  );
}
