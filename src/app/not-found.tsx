import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/shared/components/layout/StatusScreen';
import Link from 'next/link';

export default function NotFound() {
  return (
    <StatusScreen
      as="main"
      code="ERROR 404"
      className="min-h-dvh pt-[20vh]"
      title="¡Ups! Página no encontrada"
      description="Lo sentimos, parece que la página que estás buscando no existe o ha sido movida."
      actions={
        <Button asChild>
          <Link href="/dashboard">Volver al Dashboard</Link>
        </Button>
      }
    />
  );
}
