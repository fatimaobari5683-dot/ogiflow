import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { listProducts } from '@/modules/products/products.service';
import { CreateOrderForm } from '@/components/supplier/CreateOrderForm';

export const dynamic = 'force-dynamic';

export default async function NewSupplierOrderPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });
  const products = await listProducts(supplier.id, { isActive: true });

  return (
    <div className="space-y-4">
      <Link href="/supplier/orders" className="text-sm text-brand-600 hover:underline">
        ← Commandes
      </Link>
      <h1 className="text-xl font-semibold text-ink-primary">Nouvelle commande</h1>

      <CreateOrderForm
        supplierId={supplier.id}
        products={products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
        commissionRate={Number(supplier.defaultCommissionRate)}
      />
    </div>
  );
}
