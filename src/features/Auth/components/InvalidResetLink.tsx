import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';

/** Estado de un enlace de recuperación vencido, usado o mal armado. */
export function InvalidResetLink() {
  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle className="line-clamp-none">Enlace inválido o vencido</AlertTitle>
        <AlertDescription>Los enlaces de recuperación se pueden usar una sola vez y vencen a la hora.</AlertDescription>
      </Alert>
      <Button asChild size="lg" className="w-full">
        <Link href="/reset_password">Pedir un enlace nuevo</Link>
      </Button>
    </div>
  );
}
