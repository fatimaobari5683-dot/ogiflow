import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { assignDriverToOrder } from '@/modules/dispatch/dispatch.service';
import { DeliveryError } from '@/modules/deliveries/deliveries.service';
import { listOrderMessages, sendCustomerMessage, sendDriverMessage, ChatError } from '@/modules/messaging/order-chat.service';

beforeEach(resetDatabase);

async function createAssignedOrder() {
  const fixtures = await createOrderFixtures();
  const order = await createOrderForSupplier({
    supplierId: fixtures.supplier.id,
    customer: { fullName: 'Client Chat', phone: '+212677220011' },
    address: { fullAddress: fixtures.address.fullAddress, city: fixtures.address.city, zoneId: fixtures.zone.id },
    items: [{ productId: fixtures.product.id, quantity: 1 }],
    deliveryFee: 20,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  const { user: driverUser, driver } = await createDriver({ zoneId: fixtures.zone.id });
  await assignDriverToOrder(order.id, driver.id, {});
  return { order, driverUser, driver, ...fixtures };
}

describe('sendCustomerMessage — chat côté client (page de suivi publique)', () => {
  it('refuse un message tant qu\'aucun livreur n\'est assigné', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Sans Livreur', phone: '+212677220022' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });

    await expect(sendCustomerMessage(order.orderNumber, 'Bonjour ?')).rejects.toThrow(ChatError);
  });

  it('enregistre le message et notifie le livreur assigné (PUSH)', async () => {
    const { order, driverUser } = await createAssignedOrder();

    const message = await sendCustomerMessage(order.orderNumber, 'Je suis au 3e étage, merci de sonner fort.');
    expect(message.sender).toBe('CUSTOMER');
    expect(message.body).toContain('3e étage');

    const notif = await prisma.notification.findFirst({ where: { event: 'CUSTOMER_MESSAGE', userId: driverUser.id } });
    expect(notif).toBeDefined();
    expect(notif?.channel).toBe('PUSH');
  });

  it('lève ChatError pour un numéro de commande inconnu', async () => {
    await expect(sendCustomerMessage('ORD-INCONNU', 'test')).rejects.toThrow(ChatError);
  });
});

describe('sendDriverMessage — chat côté livreur (authentifié)', () => {
  it("un livreur ne peut PAS écrire sur une livraison qui n'est pas la sienne (IDOR)", async () => {
    const { order } = await createAssignedOrder();
    const { user: intruderUser } = await createDriver();

    await expect(
      sendDriverMessage(order.id, { actorId: intruderUser.id, actorRole: 'DRIVER' }, 'Message intrus')
    ).rejects.toThrow(DeliveryError);
  });

  it('enregistre le message et notifie le client (SMS)', async () => {
    const { order, driverUser } = await createAssignedOrder();

    const message = await sendDriverMessage(order.id, { actorId: driverUser.id, actorRole: 'DRIVER' }, "J'arrive dans 5 minutes.");
    expect(message.sender).toBe('DRIVER');

    const notif = await prisma.notification.findFirst({ where: { event: 'DRIVER_MESSAGE' } });
    expect(notif).toBeDefined();
    expect(notif?.channel).toBe('SMS');
  });

  it('un manager (non-DRIVER) peut écrire sur n\'importe quelle livraison — override légitime', async () => {
    const { order } = await createAssignedOrder();
    const message = await sendDriverMessage(order.id, { actorId: 'manager-id', actorRole: 'LOGISTICS_MANAGER' }, 'Message manager');
    expect(message.sender).toBe('DRIVER');
  });
});

describe('listOrderMessages', () => {
  it('renvoie les messages des deux côtés, dans leur ordre chronologique', async () => {
    const { order, driverUser } = await createAssignedOrder();

    await sendCustomerMessage(order.orderNumber, 'Premier message client');
    await sendDriverMessage(order.id, { actorId: driverUser.id, actorRole: 'DRIVER' }, 'Réponse livreur');

    const messages = await listOrderMessages(order.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.sender).toBe('CUSTOMER');
    expect(messages[1]!.sender).toBe('DRIVER');
  });
});
