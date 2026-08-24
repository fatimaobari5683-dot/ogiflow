import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { listProducts } from '@/modules/products/products.service';
import { Card } from '@/components/ui/Card';
import { ProductForm } from '@/components/supplier/ProductForm';
import { ToggleProductActive } from '@/components/supplier/ToggleProductActive';

export const dynamic = 'force-dynamic';

export default async function SupplierProductsPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });
  const products = await listProducts(supplier.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Produits</h1>
        <p className="text-sm text-ink-secondary">{products.length} produit{products.length > 1 ? 's' : ''} au catalogue</p>
      </div>

      <ProductForm />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Produit</th>
              <th className="pb-2 font-medium">SKU</th>
              <th className="pb-2 font-medium">Prix</th>
              <th className="pb-2 font-medium">Poids</th>
              <th className="pb-2 pr-0 text-right font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="py-2.5 font-medium text-ink-primary">{product.name}</td>
                <td className="py-2.5 text-ink-secondary">{product.sku ?? '—'}</td>
                <td className="py-2.5 tabular-nums text-ink-primary">{Number(product.price).toLocaleString('fr-FR')} MAD</td>
                <td className="py-2.5 text-ink-secondary">{product.weightKg ? `${product.weightKg} kg` : '—'}</td>
                <td className="py-2.5 text-right">
                  <ToggleProductActive productId={product.id} isActive={product.isActive} />
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-muted">
                  Aucun produit. Ajoutez votre premier produit pour pouvoir créer des commandes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
