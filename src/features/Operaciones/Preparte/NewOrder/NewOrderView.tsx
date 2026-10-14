'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PreparteForm } from '../components/PreparteForm';
import type { Cliente, Contrato } from '../types/entities';
import { usePreparteActions } from '../hooks/usePreparteActions';
import { createEmptyPreparteFormData } from '../lib/preparte-form-data';
import type { PreparteFormData } from '../schemas/preparte-form';

const ORDERS_LIST_URL = '/dashboard/operations?tab=preparte';

interface NewOrderViewProps {
  customers: Cliente[];
  contratos: Contrato[];
}

/** Pantalla de alta de pedido: el formulario en variante página, con resumen lateral. */
export function NewOrderView({ customers, contratos }: NewOrderViewProps) {
  const router = useRouter();
  // Se calcula una sola vez: `requestDate` es la fecha del momento en que se abrió la pantalla
  const [initialData] = useState<PreparteFormData>(createEmptyPreparteFormData);
  // Tras guardar, el botón queda bloqueado hasta que termine la navegación (evita el doble alta)
  const [isCreated, setIsCreated] = useState(false);

  const { submitPreparte } = usePreparteActions({ customers, contratos });

  const handleSubmit = async (data: PreparteFormData) => {
    const saved = await submitPreparte(data, { mode: 'create' });
    if (!saved) return;
    setIsCreated(true);
    router.push(ORDERS_LIST_URL);
  };

  return (
    <div className="space-y-6 px-4 pt-4 pb-6 sm:px-6">
      <div className="space-y-3">
        <Link
          href={ORDERS_LIST_URL}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Volver a pedidos
        </Link>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Nuevo pedido</h1>
          <p className="text-muted-foreground text-sm">
            Cargá lo que pidió el cliente. Lo podés confirmar después desde el listado.
          </p>
        </div>
      </div>

      <PreparteForm
        variant="page"
        formData={initialData}
        clientes={customers}
        contratos={contratos}
        isEditing={false}
        submitDisabled={isCreated}
        onSubmit={handleSubmit}
        onCancel={() => router.push(ORDERS_LIST_URL)}
      />
    </div>
  );
}
