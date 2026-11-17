import { ExternalUploadPage } from '@/features/Documentacion/CumplimientoClientes/components/external/ExternalUploadPage';
import { BRAND_NAME } from '@/shared/lib/branding';

export const metadata = {
  title: `Carga de documentos | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default async function ExternalUploadRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ExternalUploadPage token={token} />;
}
