import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { getExternalUploadContext } from '../../actions/external-upload';
import { ExternalUploadForm } from './ExternalUploadForm';

/** Página pública de un link de carga externa (sin sesión). */
export async function ExternalUploadPage({ token }: { token: string }) {
  const context = await getExternalUploadContext(token);
  return (
    <main className="bg-muted/40 flex min-h-dvh items-start justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        {context ? (
          <>
            <CardHeader>
              <CardTitle>Carga de documentos para {context.companyName}</CardTitle>
              <CardDescription>
                Link para {context.label}. Vence el {formatArgentinaDay(context.expiresAt)}. Los documentos los revisa{' '}
                {context.companyName} antes de darlos por válidos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExternalUploadForm token={token} context={context} />
            </CardContent>
          </>
        ) : (
          <CardHeader>
            <CardTitle>Este link no está disponible</CardTitle>
            <CardDescription>Venció o fue revocado. Pedile uno nuevo a la empresa que te lo envió.</CardDescription>
          </CardHeader>
        )}
      </Card>
    </main>
  );
}
