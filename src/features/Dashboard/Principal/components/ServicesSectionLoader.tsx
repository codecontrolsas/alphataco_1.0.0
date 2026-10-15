import { formatDateAr } from '@/shared/lib/argentina-time';
import { getServicesDetailByClient, getServicesSummary } from '../actions/services.server';
import { getOperationToday } from '../lib/dashboard-dates';
import { ServicesSection } from './ServicesSection';

/**
 * Sección «Servicios del Día»: el resumen por tipo y el detalle por cliente se piden en paralelo desde
 * el servidor (antes el detalle salía del navegador, ya montada la sección). Cada uno puede fallar por
 * separado: el que falla llega como `null` y la sección muestra el error en su mitad, no un cero.
 */
export async function ServicesSectionLoader() {
  const today = getOperationToday();

  // Las dos promesas arrancan antes de esperar a ninguna.
  const [summaryResult, detailResult] = await Promise.allSettled([getServicesSummary(), getServicesDetailByClient()]);

  return (
    <ServicesSection
      date={formatDateAr(today)}
      today={today}
      servicesSummary={summaryResult.status === 'fulfilled' ? summaryResult.value : null}
      clientDetail={detailResult.status === 'fulfilled' ? detailResult.value : null}
    />
  );
}
