import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures } from '../factories';
import { createOrderForSupplier, transitionOrderStatus, getOrderDetail, OrderError } from '@/modules/orders/orders.service';
import { InvalidTransitionError } from '@/modules/orders/order-state-machine';
import { createPromoCode, PromoError } from '@/modules/promotions/promotions.service';

beforeEach(resetDatabase);

describe('createOrderForSupplier — intégrité des prix et du client', () => {
  it('relit toujours le prix depuis le catalogue, jamais un prix transmis par l\'appelant', async () => {
    const { supplier, product, customer, address } = await createOrderFixtures({ productPrice: 500, commissionRate: 10 });

    // Le type CreateOrderForSupplierInput n'accepte pas de unitPrice — mais
    // on vérifie ici le comportement réel : le total calculé doit refléter
    // le prix EN BASE (500), peu importe ce qu'on pourrait tenter d'injecter.
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Test', phone: '+212600000099' },
      address: { fullAddress: address.fullAddress, city: address.city },
      items: [{ productId: product.id, quantity: 2 }],
      deliveryFee: 20,
    });

    expect(Number(order.subtotalAmount)).toBe(1000); // 2 × 500, jamais un prix falsifié
    expect(Number(order.totalAmount)).toBe(1020);
    expect(Number(order.commissionAmount)).toBe(102); // 10% de 1020
    expect(Number(order.supplierPayoutAmount)).toBe(918);
    void customer;
  });

  it('rejette un produit qui n\'appartient pas au fournisseur (isolation inter-fournisseurs)', async () => {
    const { supplier: supplierA } = await createOrderFixtures();
    const { product: productB } = await createOrderFixtures(); // fournisseur B, produit distinct

    await expect(
      createOrderForSupplier({
        supplierId: supplierA.id,
        customer: { fullName: 'Client Test', phone: '+212600000099' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: productB.id, quantity: 1 }],
        deliveryFee: 20,
      })
    ).rejects.toThrow(OrderError);
  });

  it('rejette un produit inactif', async () => {
    const { supplier, product } = await createOrderFixtures();
    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });

    await expect(
      createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client Test', phone: '+212600000099' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 20,
      })
    ).rejects.toThrow(OrderError);
  });

  it('retrouve un client existant par téléphone plutôt que d\'en créer un doublon', async () => {
    const { supplier, product } = await createOrderFixtures();
    const phone = '+212611112222';

    const order1 = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Premier Nom', phone },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });
    const order2 = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Nom Ignoré Car Client Existant', phone },
      address: { fullAddress: '2 rue Autre', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    expect(order1.customerId).toBe(order2.customerId);
    const customerCount = await prisma.customer.count({ where: { phone } });
    expect(customerCount).toBe(1);
  });

  it('génère des numéros de commande séquentiels lisibles (ORD-année-NNNNNN)', async () => {
    const { supplier, product } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600000001' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    expect(order.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
  });
});

describe('getOrderDetail — données du bordereau de livraison', () => {
  it('inclut le nom du fournisseur, nécessaire au bordereau imprimable', async () => {
    const { supplier, product } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Bordereau', phone: '+212600000095' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 2 }],
      deliveryFee: 20,
    });

    const detail = await getOrderDetail(order.id);
    expect(detail.supplier.companyName).toBe(supplier.companyName);
    expect(detail.customer.fullName).toBe('Client Bordereau');
    expect(detail.address.fullAddress).toBe('1 rue Test');
  });

  it('lève OrderError pour une commande inconnue', async () => {
    await expect(getOrderDetail('inconnue')).rejects.toThrow(OrderError);
  });
});

describe('createOrderForSupplier — codes promo', () => {
  it('applique la réduction au sous-total, avant calcul de la commission', async () => {
    const { supplier, product } = await createOrderFixtures({ productPrice: 500, commissionRate: 10 });
    await createPromoCode({ code: 'REMISE10', discountType: 'PERCENTAGE', discountValue: 10 });

    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Promo', phone: '+212600000098' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
      promoCode: 'remise10', // casse volontairement différente
    });

    // Sous-total 500, réduction 10% = 50 → total = 500 - 50 + 20 = 470
    expect(Number(order.discountAmount)).toBe(50);
    expect(Number(order.totalAmount)).toBe(470);
    expect(Number(order.commissionAmount)).toBe(47); // 10% de 470, pas de 520
    expect(order.promoCodeId).not.toBeNull();
  });

  it("propage l'erreur PromoError pour un code invalide, sans créer de commande", async () => {
    const { supplier, product } = await createOrderFixtures();

    await expect(
      createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client', phone: '+212600000097' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 20,
        promoCode: 'INEXISTANT',
      })
    ).rejects.toThrow(PromoError);

    expect(await prisma.order.count()).toBe(0);
  });

  it('sans code promo, discountAmount reste à 0 et promoCodeId à null', async () => {
    const { supplier, product } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600000096' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    expect(Number(order.discountAmount)).toBe(0);
    expect(order.promoCodeId).toBeNull();
  });
});

describe('transitionOrderStatus — state machine + audit trail', () => {
  it('rejette une transition invalide (ex: sauter des étapes)', async () => {
    const { supplier, product } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600000001' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    await expect(transitionOrderStatus(order.id, 'DELIVERED', {})).rejects.toThrow(InvalidTransitionError);
  });

  it('une transition valide crée une entrée d\'historique ET un audit log', async () => {
    const { supplier, product } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600000001' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    // actorId doit être un vrai utilisateur — audit_logs.actorId a une FK
    // vers users.id (à raison : un acteur fictif serait un trou d'audit).
    await transitionOrderStatus(order.id, 'CONFIRMED', { actorId: supplier.userId, reason: 'test' });

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.toStatus)).toEqual(['PENDING', 'CONFIRMED']);

    const auditLog = await prisma.auditLog.findFirst({ where: { entityId: order.id, action: 'ORDER_STATUS_CHANGED' } });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(supplier.userId);
  });
});
