import { prisma } from '@/infrastructure/database/client';
import { getDeliveryForOrder, assertDeliveryOwnership, type ActorContext } from '@/modules/deliveries/deliveries.service';
import { queueAndSendNotification } from '@/modules/notifications/notifications.service';

export class ChatError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ChatError';
    this.statusCode = statusCode;
  }
}

async function loadOrderWithParties(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      customer: true,
      delivery: { include: { driver: { include: { user: true } } } },
    },
  });
}

export async function listOrderMessages(orderId: string) {
  return prisma.orderMessage.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
}

/**
 * Message envoyé par le client depuis la page de suivi public — sans
 * authentification, même principe que le reste du tracking (voir
 * tracking.service.ts). N'existe que si un livreur est assigné : avant ça,
 * il n'y a personne pour recevoir le message.
 */
export async function sendCustomerMessage(orderNumber: string, body: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { delivery: { include: { driver: { include: { user: true } } } } },
  });
  if (!order) {
    throw new ChatError('Commande introuvable.', 404);
  }
  if (!order.delivery?.driver) {
    throw new ChatError('Pas encore de livreur assigné à cette commande.', 409);
  }

  const message = await prisma.orderMessage.create({ data: { orderId: order.id, sender: 'CUSTOMER', body } });

  await queueAndSendNotification({
    recipient: { userId: order.delivery.driver.userId },
    channel: 'PUSH',
    event: 'CUSTOMER_MESSAGE',
    payload: { orderNumber: order.orderNumber, body },
  }).catch(() => {});

  return message;
}

/**
 * Message envoyé par le livreur depuis sa mission — authentifié, avec la
 * même vérification de propriété que les transitions de statut
 * (assertDeliveryOwnership) : un livreur ne peut écrire que sur ses propres
 * livraisons.
 */
export async function sendDriverMessage(orderId: string, actor: ActorContext, body: string) {
  const delivery = await getDeliveryForOrder(orderId);
  await assertDeliveryOwnership(delivery, actor);

  const message = await prisma.orderMessage.create({ data: { orderId, sender: 'DRIVER', body } });

  const order = await loadOrderWithParties(orderId);
  await queueAndSendNotification({
    recipient: { userId: order.customer.userId ?? undefined, phone: order.customer.phone },
    channel: 'SMS',
    event: 'DRIVER_MESSAGE',
    payload: { orderNumber: order.orderNumber, body },
  }).catch(() => {});

  return message;
}
