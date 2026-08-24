import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createSupplier } from '../factories';
import { importOrdersFromCsv, CSV_TEMPLATE_HEADER, OrderImportError } from '@/modules/orders/orders-import.service';
import { createPromoCode } from '@/modules/promotions/promotions.service';

beforeEach(resetDatabase);

async function createSupplierWithSkuProducts() {
  const { supplier } = await createSupplier({ commissionRate: 10 });
  const productA = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit A', price: 100, sku: 'SKU-A' } });
  const productB = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit B', price: 250, sku: 'SKU-B' } });
  return { supplier, productA, productB };
}

const HEADER = CSV_TEMPLATE_HEADER;

describe('importOrdersFromCsv', () => {
  it('crée une commande par ligne valide, en relisant le prix depuis le catalogue (jamais un prix du CSV)', async () => {
    const { supplier } = await createSupplierWithSkuProducts();
    const csv = [
      HEADER,
      'Client Un,+212600100001,,1 Rue Test,Casablanca,SKU-A,2,20,,',
      'Client Deux,+212600100002,,2 Rue Test,Casablanca,SKU-B,1,15,,',
    ].join('\n');

    const summary = await importOrdersFromCsv(supplier.id, csv);

    expect(summary.successCount).toBe(2);
    expect(summary.failureCount).toBe(0);

    const orders = await prisma.order.findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: 'asc' } });
    expect(orders).toHaveLength(2);
    expect(Number(orders[0]!.subtotalAmount)).toBe(200); // 2 × 100 (prix catalogue, pas un prix du CSV — il n'y en a pas)
    expect(Number(orders[1]!.subtotalAmount)).toBe(250); // 1 × 250
  });

  it('une ligne invalide (SKU inconnu) échoue seule, sans bloquer les autres lignes', async () => {
    const { supplier } = await createSupplierWithSkuProducts();
    const csv = [
      HEADER,
      'Client Un,+212600100001,,1 Rue Test,Casablanca,SKU-A,1,20,,',
      'Client Deux,+212600100002,,2 Rue Test,Casablanca,SKU-INCONNU,1,20,,',
      'Client Trois,+212600100003,,3 Rue Test,Casablanca,SKU-B,1,20,,',
    ].join('\n');

    const summary = await importOrdersFromCsv(supplier.id, csv);

    expect(summary.successCount).toBe(2);
    expect(summary.failureCount).toBe(1);
    expect(summary.results[0]!.success).toBe(true);
    expect(summary.results[1]).toMatchObject({ line: 3, success: false });
    expect(summary.results[1]!.error).toContain('SKU-INCONNU');
    expect(summary.results[2]!.success).toBe(true);

    const orderCount = await prisma.order.count({ where: { supplierId: supplier.id } });
    expect(orderCount).toBe(2);
  });

  it('rapporte une erreur de validation avec le bon numéro de ligne (téléphone manquant)', async () => {
    const { supplier } = await createSupplierWithSkuProducts();
    const csv = [HEADER, 'Client Sans Telephone,,,1 Rue Test,Casablanca,SKU-A,1,20,,'].join('\n');

    const summary = await importOrdersFromCsv(supplier.id, csv);

    expect(summary.successCount).toBe(0);
    expect(summary.failureCount).toBe(1);
    expect(summary.results[0]).toMatchObject({ line: 2, success: false });
  });

  it('un SKU appartenant à un autre fournisseur ne correspond à aucun produit', async () => {
    const { supplier: supplierA } = await createSupplierWithSkuProducts();
    const { supplier: supplierB } = await createSupplierWithSkuProducts();
    const uniqueProductB = await prisma.product.create({ data: { supplierId: supplierB.id, name: 'Unique B', price: 50, sku: 'SKU-ONLY-B' } });

    const summary = await importOrdersFromCsv(supplierA.id, [
      HEADER,
      `Client Un,+212600100010,,1 Rue Test,Casablanca,${uniqueProductB.sku},1,20,,`,
    ].join('\n'));

    expect(summary.successCount).toBe(0);
    expect(summary.results[0]!.error).toContain('SKU-ONLY-B');
  });

  it('applique un code promo passé en colonne, comme le formulaire manuel', async () => {
    const { supplier } = await createSupplierWithSkuProducts();
    await createPromoCode({ code: 'IMPORT10', discountType: 'PERCENTAGE', discountValue: 10 });

    const csv = [HEADER, 'Client Un,+212600100001,,1 Rue Test,Casablanca,SKU-A,1,20,IMPORT10,'].join('\n');
    const summary = await importOrdersFromCsv(supplier.id, csv);

    expect(summary.successCount).toBe(1);
    const order = await prisma.order.findFirstOrThrow({ where: { supplierId: supplier.id } });
    expect(Number(order.discountAmount)).toBe(10); // 10% de 100
  });

  it('rejette un CSV sans aucune ligne de données', async () => {
    const { supplier } = await createSupplierWithSkuProducts();
    await expect(importOrdersFromCsv(supplier.id, HEADER)).rejects.toThrow(OrderImportError);
  });
});
