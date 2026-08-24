import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import { listOrderTransactions } from '@/modules/payments/payments.service';
import { generateSettlement, submitSettlementForPayment, confirmSettlementPaid } from '@/modules/settlements/settlements.service';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

/**
 * Reproduit intégralement le parcours vérifié manuellement via curl pendant
 * cette session (commande → confirmation → dispatch → livraison → POD →
 * paiement COD automatique → libération du livreur → settlement). Si ce
 * test casse, c'est que la chaîne complète de LogiFlow ne fonctionne plus —
 * exactement le genre de régression qu'aucune suite de types ne peut voir.
 */
describe('Cycle de vie complet d\'une commande COD', () => {
  it('commande → livraison → paiement automatique → libération livreur → versement', async () => {
    const { supplier, product, address } = await createOrderFixtures({ commissionRate: 12, productPrice: 450 });
    const { user: driverUser, driver } = await createDriver({
      zoneId: address.zoneId ?? undefined,
      commissionRate: 10,
      lat: 33.5731,
      lng: -7.5898,
    });
    await prisma.address.update({ where: { id: address.id }, data: { latitude: 33.5736, longitude: -7.5901 } });

    // 1. Création de la commande (fournisseur)
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client E2E', phone: '+212677889900' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 2 }],
      deliveryFee: 20,
    });
    expect(order.status).toBe('PENDING');
    expect(Number(order.totalAmount)).toBe(920); // 2×450 + 20
    expect(Number(order.commissionAmount)).toBe(110.4); // 12% de 920

    // 2. Manager : confirme puis prépare
    await transitionOrderStatus(order.id, 'CONFIRMED', {});
    await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});

    // 3. Dispatch automatique — un seul livreur disponible, doit être choisi
    const assignment = await autoAssignBestDriver(order.id, {});
    expect(assignment.driverId).toBe(driver.id);
    expect(assignment.order.status).toBe('ASSIGNED');

    const busyDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(busyDriver.status).toBe('BUSY');

    // 4. Livreur : cycle de transit complet
    const driverContext = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', driverContext);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', driverContext);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverContext);

    // 5. POD — livraison réussie
    const deliveredOrder = await recordDeliveryAttempt(order.id, {
      ...driverContext,
      result: 'SUCCESS',
      proof: { type: 'OTP', data: { code: '482913', otpVerified: true } },
    });
    expect(deliveredOrder.status).toBe('DELIVERED');

    // 6. Le paiement COD doit s'être déclenché AUTOMATIQUEMENT via l'event bus
    //    (c'est exactement le bug de la session précédente : sans handlers
    //    enregistrés, cette section échouerait silencieusement à zéro).
    const transactions = await listOrderTransactions(order.id);
    expect(transactions).toHaveLength(3);

    const collection = transactions.find((t) => t.type === 'COD_COLLECTION');
    const commission = transactions.find((t) => t.type === 'COMMISSION_DEDUCTION');
    const payout = transactions.find((t) => t.type === 'DRIVER_PAYOUT');

    expect(Number(collection?.amount)).toBe(920);
    expect(collection?.status).toBe('CONFIRMED');
    expect(Number(commission?.amount)).toBe(110.4);
    expect(Number(payout?.amount)).toBe(2); // 10% des frais de livraison (20)
    expect(payout?.status).toBe('PENDING');

    const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paidOrder.paymentStatus).toBe('CONFIRMED');

    // 7. Le solde du livreur = montant encaissé moins sa propre rémunération
    const settledDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(Number(settledDriver.walletBalance)).toBe(918); // 920 − 2

    // 8. Le livreur redevient AUTOMATIQUEMENT disponible (releaseDriverIfIdle)
    expect(settledDriver.status).toBe('AVAILABLE');

    // 9. Versement fournisseur — génération, puis cycle de vie complet
    const settlement = await generateSettlement(
      supplier.id,
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000)
    );
    expect(settlement.totalOrders).toBe(1);
    expect(Number(settlement.netPayout)).toBe(809.6); // 920 − 110.4

    await submitSettlementForPayment(settlement.id);
    const paidSettlement = await confirmSettlementPaid(settlement.id);
    expect(paidSettlement.status).toBe('PAID');
    expect(paidSettlement.paidAt).not.toBeNull();

    const payoutTx = await prisma.transaction.findFirst({ where: { settlementId: settlement.id } });
    expect(payoutTx?.type).toBe('SUPPLIER_PAYOUT');
    expect(payoutTx?.status).toBe('CONFIRMED');

    // 10. Une commande déjà réglée (paymentStatus CONFIRMED) ne doit jamais
    //     être incluse dans un second versement pour la même période.
    await expect(
      generateSettlement(supplier.id, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000))
    ).rejects.toThrow();
  });

  it('un échec de livraison (client absent) ne déclenche PAS de paiement et garde le livreur BUSY', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    const { user: driverUser, driver } = await createDriver({ zoneId: address.zoneId ?? undefined });

    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Absent Test', phone: '+212677889901' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    await transitionOrderStatus(order.id, 'CONFIRMED', {});
    await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
    await autoAssignBestDriver(order.id, {});

    const driverContext = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', driverContext);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', driverContext);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverContext);

    const failedOrder = await recordDeliveryAttempt(order.id, {
      ...driverContext,
      result: 'CUSTOMER_ABSENT',
      notes: 'Personne sur place',
    });

    expect(failedOrder.status).toBe('CUSTOMER_ABSENT');

    const transactions = await listOrderTransactions(order.id);
    expect(transactions).toHaveLength(0);

    const stillBusyDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(stillBusyDriver.status).toBe('BUSY'); // toujours en charge — pas de résolution finale encore
  });
});
