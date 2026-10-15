import { Badge } from '@/components/ui/badge';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { ExpiredSupplierDocumentsAlert } from '../components/ExpiredSupplierDocumentsAlert';
import { PurchasesPageShell } from '../components/PurchasesPageShell';
import {
  getSupplierDocumentNameSuggestions,
  getSupplierFormLookups,
  type SupplierDetail,
} from '../actions/suppliers.server';
import { formatCuit } from '../lib/supplier-ids';
import { emptySupplierContact, type SupplierFormValues } from '../schemas/suppliers';
import { SupplierDocuments } from './components/SupplierDocuments';
import { SupplierForm } from './components/SupplierForm';
import { SupplierStatusActions } from './components/SupplierStatusActions';
import { SupplierTaxProfile } from './components/SupplierTaxProfile';
import { getSupplierWithholdingProfiles } from '../actions/withholding-profiles.server';
import { getWithholdingRegimes } from '../actions/withholding-regimes.server';
import { getSupplierAccount } from '../actions/supplier-account.server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SupplierAccountView } from './components/SupplierAccountView';

const SUPPLIERS_BACK = { href: '/dashboard/purchases?tab=proveedores', label: 'Proveedores' };

const EMPTY: SupplierFormValues = {
  name: '',
  tradeName: '',
  cuit: '',
  vatConditionId: '',
  street: '',
  city: '',
  province: '',
  postalCode: '',
  paymentTermDays: '',
  bankCbu: '',
  bankAlias: '',
  notes: '',
  contacts: [emptySupplierContact(true)],
  categoryIds: [],
};

export async function NewSupplierPage() {
  const { categories } = await getSupplierFormLookups();
  return (
    <PurchasesPageShell back={SUPPLIERS_BACK}>
      <h1 className="text-2xl font-semibold">Nuevo proveedor</h1>
      <SupplierForm supplierId={null} defaultValues={EMPTY} categories={categories} />
    </PurchasesPageShell>
  );
}

export async function SupplierDetailPage({ supplier }: { supplier: SupplierDetail }) {
  const [{ categories }, nameSuggestions, permissions, taxProfiles, regimes, account] = await Promise.all([
    getSupplierFormLookups(),
    getSupplierDocumentNameSuggestions(),
    getUserPermissionsMapServer(),
    getSupplierWithholdingProfiles(supplier.id),
    getWithholdingRegimes(),
    getSupplierAccount(supplier.id),
  ]);
  const canUpdate = permissions['compras:proveedores:update'] === true;
  const canDelete = permissions['compras:proveedores:delete'] === true;
  const nullable = (v: string | number | null) => (v === null ? '' : String(v));

  const defaultValues: SupplierFormValues = {
    name: supplier.name,
    tradeName: nullable(supplier.trade_name),
    cuit: formatCuit(supplier.cuit),
    vatConditionId: String(supplier.vat_condition_id),
    street: nullable(supplier.street),
    city: nullable(supplier.city),
    province: nullable(supplier.province),
    postalCode: nullable(supplier.postal_code),
    paymentTermDays: nullable(supplier.payment_term_days),
    bankCbu: nullable(supplier.bank_cbu),
    bankAlias: nullable(supplier.bank_alias),
    notes: nullable(supplier.notes),
    contacts: supplier.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      role: c.role ?? '',
      isPrimary: c.is_primary,
    })),
    categoryIds: supplier.categories.map((c) => c.id),
  };
  // Los rubros inactivos que el proveedor ya tiene se siguen mostrando (no se ofrecen a otros).
  const categoryOptions = [
    ...categories,
    ...supplier.categories.filter((c) => !categories.some((active) => active.id === c.id)),
  ];

  const today = argentinaDate();
  const expiredDocuments = supplier.documents
    .filter((d) => !d.replaced_by_id && d.expiresAt !== null && d.expiresAt < today)
    .map((d) => ({ id: d.id, name: d.name, expiresAt: d.expiresAt as string }));

  return (
    <PurchasesPageShell back={SUPPLIERS_BACK}>
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold break-words">{supplier.name}</h1>
              <p className="text-sm text-muted-foreground tabular-nums">
                CUIT {formatCuit(supplier.cuit)}
                {supplier.trade_name ? ` · ${supplier.trade_name}` : ''}
              </p>
            </div>
            {!supplier.is_active && <Badge variant="secondary">Inactivo</Badge>}
          </div>
        }
        actions={
          <SupplierStatusActions
            supplierId={supplier.id}
            name={supplier.name}
            isActive={supplier.is_active}
            canDelete={canDelete}
            canUpdate={canUpdate}
          />
        }
      />
      <ExpiredSupplierDocumentsAlert supplierId={supplier.id} documents={expiredDocuments} />
      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          {account && <TabsTrigger value="cuenta">Cuenta corriente</TabsTrigger>}
        </TabsList>
        <TabsContent value="datos" className="space-y-4">
      {/* `key`: tras guardar, el form se remonta con los datos frescos (ids de contactos nuevos). */}
      <SupplierForm
        key={supplier.updatedAt}
        supplierId={supplier.id}
        defaultValues={defaultValues}
        categories={categoryOptions}
        readOnly={!canUpdate}
      />
      <SupplierDocuments
        supplierId={supplier.id}
        documents={supplier.documents}
        nameSuggestions={nameSuggestions}
        canUpdate={canUpdate}
      />
      <SupplierTaxProfile supplierId={supplier.id} profiles={taxProfiles} regimes={regimes} canUpdate={canUpdate} />
        </TabsContent>
        {account && (
          <TabsContent value="cuenta">
            <SupplierAccountView initial={account} canCreatePayment={permissions['compras:pagos:create'] === true} />
          </TabsContent>
        )}
      </Tabs>
    </PurchasesPageShell>
  );
}
