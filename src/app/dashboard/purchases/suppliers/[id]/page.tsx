import { getSupplierDetail } from '@/features/Purchases/actions/supplier-queries.server';
import { SupplierDetailPage } from '@/features/Purchases/Suppliers/SupplierPages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getSupplier = cache(getSupplierDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supplier = await getSupplier((await params).id);
  return { title: supplier ? `${supplier.name} | Compras` : 'Proveedor | Compras' };
}

export default async function SupplierRoute({ params }: { params: Promise<{ id: string }> }) {
  const supplier = await getSupplier((await params).id);
  if (!supplier) notFound();
  return <SupplierDetailPage supplier={supplier} />;
}
