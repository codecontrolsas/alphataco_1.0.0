import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateAr } from '@/shared/lib/argentina-time';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

/** Aviso (no bloquea) de documentos del proveedor vencidos: al armar, aprobar y enviar una OC. */
export function ExpiredSupplierDocumentsAlert({
  supplierId,
  documents,
}: {
  supplierId: string;
  documents: readonly { id: string; name: string; expiresAt: string }[];
}) {
  if (documents.length === 0) return null;
  return (
    <Alert className="border-warn/35 bg-warn-subtle text-warn-subtle-foreground">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>El proveedor tiene documentos vencidos</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {documents.map((doc) => (
            <li key={doc.id}>
              {doc.name}: venció el {formatDateAr(doc.expiresAt)}
            </li>
          ))}
        </ul>
        <Link href={`/dashboard/purchases/suppliers/${supplierId}`} className="underline">
          Ver la ficha del proveedor
        </Link>
      </AlertDescription>
    </Alert>
  );
}
