import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import { generateSettlement, getSettlementDetail, SettlementError } from '@/modules/settlements/settlements.service';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

/**
 * Livre réellement une commande (pas d'insertion directe en base) pour que
 * generateSettlement trouve une commande éligible (DELIVERED +
 * paymentStatus CONFIRMED) — même chemin que full-lifecycle.test.ts, réduit
 * à ce qui est nécessaire pour ce fichier.
 */
async function createDeliveredOrder(customerName: string, productPrice: number, deliveryFee: number) {
  const { supplier, product, address } = await createOrderFixtures({ commissionRate: 12, productPrice });
  const { user: driverUser, driver } = await createDriver({ zoneId: address.zoneId ?? undefined, lat: 33.5731, lng: -7.5898 });
  await prisma.address.update({ where: { id: address.id }, data: { latitude: 33.5736, longitude: -7.5901 } });

  const order = await createOrderForSupplier({
    supplierId: supplier.id,
    customer: { fullName: customerName, phone: `+2126${Date.now().toString().slice(-8)}` },
    address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
    items: [{ productId: product.id, quantity: 1 }],
    deliveryFee,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  await autoAssignBestDriver(order.id, {});
  const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
  await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
  await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
  await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);
  await recordDeliveryAttempt(order.id, { ...ctx, result: 'SUCCESS', proof: { type: 'OTP', value: '111111' } });

  return { supplier, order };
}

describe('getSettlementDetail — détail par commande (état de versement imprimable)', () => {
  it('inclut le numéro de commande, le client et les montants pour chaque ligne de transaction', async () => {
    const { supplier, order } = await createDeliveredOrder('Client Versement', 400, 20);

    const settlement = await generateSettlement(
      supplier.id,
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000)
    );

    const detail = await getSettlementDetail(settlement.id);
    expect(detail.transactions).toHaveLength(1);

    const line = detail.transactions[0]!;
    expect(line.order?.orderNumber).toBe(order.orderNumber);
    expect(line.order?.customer.fullName).toBe('Client Versement');
    expect(Number(line.order?.totalAmount)).toBe(420); // 400 + 20
    expect(Number(line.order?.commissionAmount)).toBe(50.4); // 12% de 420
    expect(Number(line.amount)).toBe(369.6); // net = 420 − 50.4, montant réel de la transaction SUPPLIER_PAYOUT
  });

  it('inclut les informations de facturation du fournisseur (raison sociale, IF/ICE, adresse)', async () => {
    const { supplier, order } = await createDeliveredOrder('Client Deux', 300, 15);
    void order;
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { taxId: 'IF-123456', billingAddress: '10 Boulevard Test, Casablanca' },
    });

    const settlement = await generateSettlement(
      supplier.id,
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000)
    );

    const detail = await getSettlementDetail(settlement.id);
    expect(detail.supplier.taxId).toBe('IF-123456');
    expect(detail.supplier.billingAddress).toBe('10 Boulevard Test, Casablanca');
  });

  it('lève une erreur explicite pour un versement inconnu', async () => {
    await expect(getSettlementDetail('inconnu')).rejects.toThrow(SettlementError);
  });
});
