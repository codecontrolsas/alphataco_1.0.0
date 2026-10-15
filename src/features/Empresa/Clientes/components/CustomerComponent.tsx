'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useLoggedUserStore } from '@/shared/store/loggedUser';
import { useRouter } from 'next/navigation';
import type { CustomerRow } from '../lib/serializers';
import { CustomerDetail, type CustomerDetailPreferences } from './CustomerDetail/CustomerDetail';
import { CustomerForm } from './CustomerForm';

interface CustomerComponentProps {
  customer: CustomerRow | null;
  /** Permisos del usuario cargados en el servidor (`modulo:tab:accion`). */
  permissionsMap: Record<string, boolean>;
  contractsPreferences: CustomerDetailPreferences;
}

/** Invitados (usuarios compartidos con rol Invitado) asociados al cliente. */
function CustomerGuests({ customerId }: { customerId: string }) {
  const sharedUsers = useLoggedUserStore((state) => state.sharedUsers);
  const guests = sharedUsers.filter((user) => user.customer_id?.id === customerId && user.role === 'Invitado');

  return (
    <Card className="mt-6">
      <CardContent className="p-4">
        <CardTitle className="text-lg mb-3">Invitados</CardTitle>
        {guests.length === 0 ? (
          <CardDescription>Este cliente no tiene usuarios invitados.</CardDescription>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.profile_id.fullname ?? ''}</TableCell>
                  <TableCell>{user.profile_id.email ?? ''}</TableCell>
                  <TableCell>
                    <Badge variant="default">{user.role}</Badge>
                  </TableCell>
                  <TableCell>{formatArgentinaDay(user.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Página `/dashboard/configuration/customers/action`: alta de cliente (sin `id`) o
 * ficha completa (con `id`), reutilizando `CustomerDetail`.
 */
export default function CustomerComponent({ customer, permissionsMap, contractsPreferences }: CustomerComponentProps) {
  const router = useRouter();

  if (!customer) {
    return (
      <Card className="mt-6 p-8">
        <CardTitle className="text-4xl mb-3">Registrar Cliente</CardTitle>
        <CardDescription>Completa este formulario con los datos de tu nuevo Cliente</CardDescription>
        <div className="mt-6 w-full">
          <CustomerForm onSuccess={() => router.push('/dashboard/configuration')} />
        </div>
      </Card>
    );
  }

  return (
    <section className="md:mx-7 mt-8">
      <CustomerDetail
        customerId={customer.id}
        initialCustomer={customer}
        permissionsMap={permissionsMap}
        contractsPreferences={contractsPreferences}
        onClose={() => router.push('/dashboard/configuration')}
      />
      <CustomerGuests customerId={customer.id} />
    </section>
  );
}
