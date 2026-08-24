import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures } from '../factories';
import { createOrderForSupplier } from '@/modules/orders/orders.service';
import { listCustomers, getCustomerDetail, CustomerError } from '@/modules/customers/customers.service';

beforeEach(resetDatabase);

describe('listCustomers — recherche', () => {
  it('retrouve un client par nom (insensible à la casse) ou par téléphone', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Nadia Bennani', phone: '+212677001122' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });

    expect(await listCustomers('nadia')).toHaveLength(1);
    expect(await listCustomers('677001122')).toHaveLength(1);
    expect(await listCustomers('quelquun-dautre')).toHaveLength(0);
  });

  it('sans terme de recherche, liste tous les clients avec leur nombre de commandes', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Compteur', phone: '+212677003344' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });

    const all = await listCustomers();
    const found = all.find((c) => c.fullName === 'Client Compteur');
    expect(found?._count.orders).toBe(1);
  });
});

describe('getCustomerDetail', () => {
  it('lève CustomerError pour un client inconnu', async () => {
    await expect(getCustomerDetail('inconnu')).rejects.toThrow(CustomerError);
  });

  it("agrège le total dépensé sur les commandes DELIVERED uniquement, pas sur toutes", async () => {
    const { supplier, product, address } = await createOrderFixtures({ productPrice: 200 });
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Historique', phone: '+212677005566' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    // Une deuxième commande jamais livrée (encore PENDING) ne doit pas
    // compter dans le total dépensé.
    await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Historique', phone: '+212677005566' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });

    // Simule la livraison de la première commande directement (le cycle
    // complet — avec la state machine — est déjà couvert par
    // full-lifecycle.test.ts ; seule l'agrégation nous intéresse ici).
    await prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });

    const customer = await prisma.customer.findFirstOrThrow({ where: { phone: '+212677005566' } });
    const detail = await getCustomerDetail(customer.id);

    expect(detail.stats.totalOrders).toBe(2);
    expect(detail.stats.deliveredOrders).toBe(1);
    expect(detail.stats.totalSpent).toBe(215); // 200 + 15 de livraison, une seule commande DELIVERED
  });
});
