import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { listProducts } from '@/modules/products/products.service';
import { CSV_TEMPLATE_HEADER, CSV_TEMPLATE_EXAMPLE_ROW } from '@/modules/orders/orders-import.service';
import { ImportOrdersForm } from '@/components/supplier/ImportOrdersForm';

export const dynamic = 'force-dynamic';

export default async function ImportOrdersPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });
  const products = await listProducts(supplier.id, { isActive: true });
  const productsWithSku = products.filter((p) => p.sku);

  // Exemple construit avec un vrai SKU du catalogue quand c'est possible —
  // plus utile qu'un placeholder générique pour un fournisseur qui copie ce
  // modèle tel quel.
  const exampleRow = productsWithSku[0]
    ? CSV_TEMPLATE_EXAMPLE_ROW.replace('SKU-001', productsWithSku[0].sku!)
    : CSV_TEMPLATE_EXAMPLE_ROW;
  const template = `${CSV_TEMPLATE_HEADER}\n${exampleRow}\n`;

  return (
    <div className="space-y-4">
      <Link href="/supplier/orders" className="text-sm text-brand-600 hover:underline">
        ← Commandes
      </Link>
      <h1 className="text-xl font-semibold text-ink-primary">Importer des commandes (CSV)</h1>
      <p className="text-sm text-ink-secondary">
        Une ligne = une commande à un seul article. Pour un panier avec plusieurs produits, utilisez le formulaire
        habituel.
      </p>

      {productsWithSku.length === 0 && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-ink-secondary">
          Aucun de vos produits n&apos;a de référence SKU — l&apos;import CSV identifie les produits par SKU
          (colonne <code className="font-mono">productSku</code>). Ajoutez un SKU à vos produits pour pouvoir les
          référencer.
        </div>
      )}

      <ImportOrdersForm template={template} />
    </div>
  );
}
